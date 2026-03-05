import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema, ListPromptsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { withMcpAuth } from "mcp-handler";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/crypto";
import { decrypt } from "@/lib/encryption";
import { checkRateLimit } from "@/lib/rate-limit";
import { allIntegrations } from "@/lib/integrations/registry";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { loadProxyTools, discoverAndCacheProxyTools, type ProxyTool } from "@/lib/integrations/proxy-tools";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { getValidTokens } from "@/lib/integrations/token-refresh";
import type { McpToolResult } from "@/lib/integrations/types";
import { logUsage } from "@/lib/usage-log";
import { submitFeedback } from "@/lib/feedback";
import { isToolAllowed } from "@/lib/permissions";
import { getToolRisk, isRiskAllowedByScope } from "@/lib/mcp/tool-risk";
import { proxyToolCall } from "@/lib/mcp/proxy-client";
import { jsonSchemaToZodToolSchema } from "@/lib/mcp/json-schema-to-zod";
import { filterToolsForUser, type ToolMeta } from "@/lib/mcp/tool-filtering";
import {
  filterSkillsForUser,
  skillPromptName,
  interpolateSkillContent,
  type SkillRecord,
} from "@/lib/mcp/skill-filtering";
import { registerAdminTools } from "@/lib/mcp/admin-tools";
import { registerVaultTools } from "@/lib/mcp/vault-tools";
import { registerDiscoverTools } from "@/lib/mcp/discover-tools";
import { registerCallTool } from "@/lib/mcp/call-tool";
import { buildToolIndex, ensureToolEmbeddings, type ToolIndexEntry } from "@/lib/mcp/tool-search";
import {
  createSkill,
  updateSkill,
  deleteSkill as deleteSkillService,
  type SkillAuth,
} from "@/lib/skills/service";
import { z } from "zod";

// Per-user rate limits by risk level
const RISK_RATE_LIMITS: Record<string, number> = {
  read: 120,
  write: 30,
  destructive: 5,
};

function checkToolRateLimit(userId: string, toolName: string) {
  const risk = getToolRisk(toolName);
  return checkRateLimit(
    `mcp:user:${userId}:${risk}`,
    RISK_RATE_LIMITS[risk],
    60_000
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpResult = { content: any[]; isError?: boolean; [key: string]: unknown };
type McpErrorResult = { content: Array<{ type: "text"; text: string }>; isError: true };

type PreCheckSuccess = {
  userId: string;
  apiKeyId: string | undefined;
  organizationId: string | undefined;
  startTime: number;
};

/**
 * Shared pre-execution checks for all tool types.
 * Returns userId + context on success, or an MCP error result on failure.
 */
function toolPreCheck(
  toolName: string,
  integrationId: string,
  extra: { authInfo?: { extra?: Record<string, unknown> } },
): PreCheckSuccess | McpErrorResult {
  // Key expiry
  if (extra.authInfo?.extra?.keyExpired) {
    const dashboardUrl = process.env.APP_URL || "your dashboard";
    return {
      content: [{ type: "text" as const, text: `Your API key has expired. Generate a new one at ${dashboardUrl}/dashboard` }],
      isError: true,
    };
  }

  const userId = extra.authInfo?.extra?.userId as string | undefined;
  const apiKeyId = extra.authInfo?.extra?.apiKeyId as string | undefined;
  const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
  const risk = getToolRisk(toolName);

  if (!userId) {
    logUsage({ userId: "unknown", apiKeyId, toolName, integrationId, status: "unauthorized", organizationId, riskLevel: risk });
    return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };
  }

  // Permissions check
  const permissionsMode = extra.authInfo?.extra?.permissionsMode as string | undefined;
  const integrationAccess = extra.authInfo?.extra?.integrationAccess as
    | Array<{ integrationId: string; allowedTools: string[] }>
    | undefined;

  if (permissionsMode && integrationAccess && !isToolAllowed(permissionsMode, integrationAccess, integrationId, toolName)) {
    logUsage({ userId, apiKeyId, toolName, integrationId, status: "unauthorized", errorMessage: "Tool not available", organizationId, riskLevel: risk });
    return { content: [{ type: "text" as const, text: "Tool not available" }], isError: true };
  }

  // API key scope check
  const apiKeyScope = extra.authInfo?.extra?.apiKeyScope as string | undefined;
  if (apiKeyScope && apiKeyScope !== "full" && !isRiskAllowedByScope(risk, apiKeyScope)) {
    logUsage({ userId, apiKeyId, toolName, integrationId, status: "unauthorized", errorMessage: "Tool not available for this API key scope", organizationId, riskLevel: risk });
    return { content: [{ type: "text" as const, text: "Tool not available" }], isError: true };
  }

  // Per-user rate limit
  const rl = checkToolRateLimit(userId, toolName);
  if (!rl.allowed) {
    logUsage({ userId, apiKeyId, toolName, integrationId, status: "error", errorMessage: "Rate limit exceeded", organizationId, riskLevel: risk });
    return { content: [{ type: "text" as const, text: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }], isError: true };
  }

  return { userId, apiKeyId, organizationId, startTime: Date.now() };
}

function isPreCheckError(result: PreCheckSuccess | McpErrorResult): result is McpErrorResult {
  return "isError" in result;
}

/**
 * Wraps tool execution with success/error usage logging.
 */
async function executeWithLogging(
  ctx: { userId: string; apiKeyId?: string; organizationId?: string; toolName: string; integrationId: string; startTime: number },
  fn: () => Promise<McpResult>,
  opts?: { formatError?: (err: unknown) => string },
): Promise<McpResult> {
  try {
    const result = await fn();
    logUsage({
      userId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      toolName: ctx.toolName,
      integrationId: ctx.integrationId,
      status: result.isError ? "error" : "success",
      durationMs: Date.now() - ctx.startTime,
      organizationId: ctx.organizationId,
      riskLevel: getToolRisk(ctx.toolName),
    });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logUsage({
      userId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      toolName: ctx.toolName,
      integrationId: ctx.integrationId,
      status: "error",
      errorMessage: message,
      durationMs: Date.now() - ctx.startTime,
      organizationId: ctx.organizationId,
      riskLevel: getToolRisk(ctx.toolName),
    });
    const clientMessage = opts?.formatError?.(err) ?? "An internal error occurred";
    return { content: [{ type: "text" as const, text: clientMessage }], isError: true };
  }
}

// ── Shared helpers for tool handlers ──

type ConnectionInfo = {
  id: string;
  integrationId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  senderName?: string | null;
};

/** Find a user's OAuth connection for a given integration, or return a standardized error. */
function resolveConnection(
  extra: { authInfo?: { extra?: Record<string, unknown> } },
  integrationId: string,
): ConnectionInfo | null {
  const connections = extra.authInfo?.extra?.connections as ConnectionInfo[] | undefined;
  return connections?.find((c) => c.integrationId === integrationId) ?? null;
}

function connectionNotFoundError(
  pre: { userId: string; apiKeyId?: string; organizationId?: string; startTime: number },
  toolName: string,
  integrationId: string,
  displayName: string,
) {
  logUsage({
    userId: pre.userId, apiKeyId: pre.apiKeyId, toolName, integrationId,
    status: "error", errorMessage: "Integration not connected",
    durationMs: Date.now() - pre.startTime, organizationId: pre.organizationId,
    riskLevel: getToolRisk(toolName),
  });
  return {
    content: [{ type: "text" as const, text: `Integration "${displayName}" is not connected. Connect it at your dashboard.` }],
    isError: true,
  };
}

/** Resolve API key with fallback chain: userKey > orgKey/sharedKey. Returns the key or a standardized error response. */
function resolveApiKeyForProxy(
  pre: { userId: string; apiKeyId?: string; organizationId?: string; startTime: number },
  toolName: string,
  integrationId: string,
  displayName: string,
  opts: { userKey?: string; fallbackKey?: string; keyMode?: string },
): { key: string } | { error: ReturnType<typeof connectionNotFoundError> } {
  const resolvedKey = opts.userKey ?? opts.fallbackKey;
  if (resolvedKey) return { key: resolvedKey };

  const isPerUser = opts.keyMode === "per_user";
  const errorMessage = isPerUser ? "No personal API key configured" : "No API key configured";
  logUsage({
    userId: pre.userId, apiKeyId: pre.apiKeyId, toolName, integrationId,
    status: "error", errorMessage,
    durationMs: Date.now() - pre.startTime, organizationId: pre.organizationId,
    riskLevel: getToolRisk(toolName),
  });
  return {
    error: {
      content: [{
        type: "text" as const,
        text: isPerUser
          ? `Integration "${displayName}" requires a personal API key. Add one in your dashboard.`
          : `Integration "${displayName}" is not configured. An org admin must add an API key in Organization Settings.`,
      }],
      isError: true,
    },
  };
}

// Metadata map for filtering tools/list per-user
const toolMeta = new Map<string, ToolMeta>();

// Load enabled custom MCP tools at module init
const customToolsPromise = supabaseAdmin
  .from("custom_mcp_tools")
  .select(
    "*, custom_mcp_servers!inner(id, name, slug, server_url, auth_type, shared_api_key, key_mode, status, organization_id)"
  )
  .eq("enabled", true)
  .eq("custom_mcp_servers.status", "active")
  .then((res) => {
    if (res.error) console.error("[MCP] custom_mcp_tools query error:", res.error);
    return res.data ?? [];
  });

// Pre-resolve custom tools so registration is synchronous
let resolvedCustomTools: Awaited<typeof customToolsPromise> | null = null;
customToolsPromise.then((tools) => {
  resolvedCustomTools = tools;
});

// Load proxy tools from DB at module init
const proxyToolsPromise = loadProxyTools().catch((err) => {
  console.error("[MCP] proxy tools load error:", err);
  return { tools: [] as ProxyTool[], fallbackIntegrationIds: new Set(allProxyIntegrations.map(p => p.id)) };
});
let resolvedProxyTools: { tools: ProxyTool[]; fallbackIntegrationIds: Set<string> } | null = null;
let proxyDiscoveryCooldownUntil: number | null = null;
const discoveredIntegrations = new Set<string>();
proxyToolsPromise.then((r) => {
  resolvedProxyTools = r;
});

// Load all enabled skills at module init
const skillsPromise = supabaseAdmin
  .from("skills")
  .select("id, name, slug, description, content, arguments, organization_id, team_id, user_id, enabled")
  .eq("enabled", true)
  .then((res) => {
    if (res.error) console.error("[MCP] skills query error:", res.error);
    return (res.data ?? []) as SkillRecord[];
  });

let resolvedSkills: SkillRecord[] | null = null;
skillsPromise.then((skills) => {
  resolvedSkills = skills;
});

function mcpSkillAuth(extra: { authInfo?: { extra?: Record<string, unknown> } }): SkillAuth | null {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
  const orgRole = extra.authInfo?.extra?.orgRole as string | undefined;
  const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;
  if (!userId || !organizationId) return null;
  return { userId, organizationId, orgRole: orgRole ?? "member", teamIds };
}

function registerSkills(server: McpServer) {
  const skills = resolvedSkills ?? [];

  // Register each skill as an MCP prompt
  for (const skill of skills) {
    const promptName = skillPromptName(skill);

    if (skill.arguments.length > 0) {
      const zodShape: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> = {};
      for (const arg of skill.arguments) {
        zodShape[arg.name] = arg.required
          ? z.string().describe(arg.description || "")
          : z.string().describe(arg.description || "").optional();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.prompt(promptName, skill.description || skill.name, zodShape as any, (args: Record<string, string>) => ({
        messages: [{ role: "user" as const, content: { type: "text" as const, text: interpolateSkillContent(skill.content, args) } }],
      }));
    } else {
      server.prompt(promptName, skill.description || skill.name, () => ({
        messages: [{ role: "user" as const, content: { type: "text" as const, text: skill.content } }],
      }));
    }
  }

  // Register manage_skills tool (consolidated CRUD)
  server.tool(
    "manage_skills",
    "List, get, create, update, or delete skills (prompt templates)",
    {
      operation: z.enum(["list", "get", "create", "update", "delete"])
        .describe("Skill operation to perform"),
      id: z.string().optional()
        .describe("Skill ID (required for update, delete)"),
      name: z.string().optional()
        .describe("Skill prompt name for 'get' (e.g. org:code-review), or display name for 'create'/'update'"),
      scope: z.enum(["user", "organization", "team"]).optional()
        .describe("Skill visibility scope (required for create)"),
      slug: z.string().optional()
        .describe("URL-friendly slug (auto-generated from name if omitted)"),
      description: z.string().optional()
        .describe("Short description of the skill"),
      content: z.string().optional()
        .describe("Skill prompt content (supports {{arg}} interpolation)"),
      arguments: z.array(z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
      })).optional().describe("Skill arguments for interpolation"),
      team_id: z.string().optional()
        .describe("Team ID (required when scope is 'team')"),
      enabled: z.boolean().optional()
        .describe("Enable or disable the skill (update only)"),
    },
    async (args, extra) => {
      switch (args.operation) {
        case "list": {
          const userId = extra.authInfo?.extra?.userId as string | undefined;
          const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
          const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;

          const visible = filterSkillsForUser(skills, { userId, organizationId, teamIds });
          const list = visible.map((s) => ({
            name: skillPromptName(s),
            description: s.description,
            argumentCount: s.arguments.length,
          }));

          return {
            content: [{ type: "text" as const, text: JSON.stringify(list, null, 2) }],
          };
        }

        case "get": {
          if (!args.name) {
            return { content: [{ type: "text" as const, text: "Missing required field: name" }], isError: true };
          }
          const userId = extra.authInfo?.extra?.userId as string | undefined;
          const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
          const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;

          const visible = filterSkillsForUser(skills, { userId, organizationId, teamIds });
          const skill = visible.find((s) => skillPromptName(s) === args.name);

          if (!skill) {
            return {
              content: [{ type: "text" as const, text: `Skill "${args.name}" not found or not available` }],
              isError: true,
            };
          }

          return {
            content: [{ type: "text" as const, text: skill.content }],
          };
        }

        case "create": {
          const auth = mcpSkillAuth(extra);
          if (!auth) return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };
          if (!args.scope || !args.name || !args.content) {
            return { content: [{ type: "text" as const, text: "Missing required fields: scope, name, content" }], isError: true };
          }

          const result = await createSkill(auth, {
            scope: args.scope,
            teamId: args.team_id,
            name: args.name,
            slug: args.slug,
            description: args.description,
            content: args.content,
            arguments: args.arguments,
          });

          if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) + "\n\nNote: This skill will be available as an MCP prompt after server restart." }],
          };
        }

        case "update": {
          const auth = mcpSkillAuth(extra);
          if (!auth) return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };
          if (!args.id) {
            return { content: [{ type: "text" as const, text: "Missing required field: id" }], isError: true };
          }

          const result = await updateSkill(auth, args.id, {
            name: args.name,
            description: args.description,
            content: args.content,
            arguments: args.arguments,
            enabled: args.enabled,
          });

          if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) + "\n\nNote: MCP prompt changes take effect after server restart." }],
          };
        }

        case "delete": {
          const auth = mcpSkillAuth(extra);
          if (!auth) return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };
          if (!args.id) {
            return { content: [{ type: "text" as const, text: "Missing required field: id" }], isError: true };
          }

          const result = await deleteSkillService(auth, args.id);

          if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
          return {
            content: [{ type: "text" as const, text: "Skill deleted successfully." }],
          };
        }
      }
    }
  );

  // Override prompts/list to filter per-user
  const registeredPrompts = (server as unknown as { _registeredPrompts: Record<string, {
    description?: string;
    argsSchema?: unknown;
  }> })._registeredPrompts;

  server.server.setRequestHandler(ListPromptsRequestSchema, (_request, extra) => {
    const userId = extra.authInfo?.extra?.userId as string | undefined;
    const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
    const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;

    const visible = filterSkillsForUser(skills, { userId, organizationId, teamIds });
    const visibleNames = new Set(visible.map(skillPromptName));

    const prompts = Object.entries(registeredPrompts)
      .filter(([name]) => visibleNames.has(name))
      .map(([name, prompt]) => ({
        name,
        description: prompt.description,
        arguments: skills
          .find((s) => skillPromptName(s) === name)
          ?.arguments.map((a) => ({
            name: a.name,
            description: a.description,
            required: a.required,
          })) ?? [],
      }));

    return { prompts };
  });

  // Mark skill tool as platform tool (always visible, no connection required)
  toolMeta.set("manage_skills", { integrationId: "platform", orgId: null });
}

function registerTools(server: McpServer) {
  // ── Platform tool: submit_feedback ──
  server.tool(
    "submit_feedback",
    "Submit feedback to the Switchboard team when something doesn't work, is confusing, or you need a capability that doesn't exist. Always succeeds — won't interrupt your workflow.",
    {
      category: z.enum(["bug", "missing_capability", "confusing", "integration_request", "other"])
        .describe("bug: something broke | missing_capability: feature needed | confusing: unexpected behavior | integration_request: new service | other"),
      message: z.string()
        .describe("Clear description of the issue or request"),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium")
        .describe("low: minor | medium: annoying | high: blocking task | critical: blocking all work"),
      tool_name: z.string().optional()
        .describe("The tool involved, if applicable"),
      context: z.string().optional()
        .describe("What you were trying to accomplish"),
      metadata: z.record(z.string(), z.unknown()).optional()
        .describe("Additional structured data (error codes, stack traces, etc.)"),
    },
    async (args, extra) => {
      const userId = (extra.authInfo?.extra?.userId as string) ?? "unknown";
      const apiKeyId = extra.authInfo?.extra?.apiKeyId as string | undefined;
      const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;

      submitFeedback({
        organizationId,
        userId,
        apiKeyId,
        category: args.category,
        severity: args.severity,
        message: args.message,
        toolName: args.tool_name,
        context: args.context,
        metadata: args.metadata as Record<string, unknown> | undefined,
      });

      return { content: [{ type: "text" as const, text: "Feedback received — thank you." }] };
    }
  );
  toolMeta.set("submit_feedback", { integrationId: "platform", orgId: null });

  // Register builtin integration tools
  for (const integration of allIntegrations) {
    for (const tool of integration.tools) {
      const integrationId = integration.id;
      toolMeta.set(tool.name, { integrationId, orgId: null });
      server.tool(
        tool.name,
        tool.description,
        tool.schema.shape,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args, extra): Promise<any> => {
          const pre = toolPreCheck(tool.name, integrationId, extra);
          if (isPreCheckError(pre)) return pre;

          const connection = resolveConnection(extra, integrationId);
          if (!connection) {
            return connectionNotFoundError(pre, tool.name, integrationId, integration.name);
          }

          return executeWithLogging(
            { ...pre, toolName: tool.name, integrationId },
            async () => {
              const tokens = await getValidTokens(connection);
              const orgKey = integration.orgKeyRequired
                ? (extra.authInfo?.extra?.integrationOrgKeys as Record<string, string> | undefined)?.[integrationId]
                : undefined;
              if (integration.orgKeyRequired && !orgKey) {
                return { content: [{ type: "text" as const, text: `${integration.name} requires an org-level key. Ask your org admin to configure it in Settings.` }], isError: true };
              }
              const client = integration.createClient(tokens, orgKey);
              const result = await tool.execute(args as Record<string, unknown>, client, { senderName: connection.senderName });
              if (result && typeof result === "object" && "_mcpContent" in (result as Record<string, unknown>)) {
                return { content: (result as McpToolResult)._mcpContent };
              }
              return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
            },
            {
              formatError: (err) => {
                const message = err instanceof Error ? err.message : "Unknown error";
                const authMessages = [
                  "Token expired and no refresh token available",
                  "Token refresh failed. Please reconnect the integration.",
                  "Integration not connected",
                ];
                if (authMessages.includes(message)) return message;
                if (err && typeof err === "object" && "response" in err) {
                  const apiMsg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
                  return apiMsg || message;
                }
                return "An internal error occurred";
              },
            },
          );
        }
      );
    }
  }

  // Register custom MCP proxy tools
  const customTools = resolvedCustomTools ?? [];
  for (const ct of customTools) {
    const srv = ct.custom_mcp_servers as {
      id: string;
      name: string;
      slug: string;
      server_url: string;
      auth_type: string;
      shared_api_key: string | null;
      key_mode: string | null;
      status: string;
      organization_id: string | null;
    };

    const namespacedName = `${srv.slug}__${ct.tool_name}`;
    const integrationId = `custom:${srv.id}`;

    toolMeta.set(namespacedName, { integrationId, orgId: srv.organization_id });
    const zodSchema = jsonSchemaToZodToolSchema(ct.input_schema as Record<string, unknown>);
    server.tool(
      namespacedName,
      `[${srv.name}] ${ct.description}`,
      zodSchema.shape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args, extra): Promise<any> => {
        const pre = toolPreCheck(namespacedName, integrationId, extra);
        if (isPreCheckError(pre)) return pre;

        // Org-scoped access check
        if (srv.organization_id !== null && srv.organization_id !== pre.organizationId) {
          logUsage({
            userId: pre.userId, apiKeyId: pre.apiKeyId, toolName: namespacedName, integrationId,
            status: "unauthorized", errorMessage: "Tool not available for this organization",
            organizationId: pre.organizationId, riskLevel: getToolRisk(namespacedName),
          });
          return { content: [{ type: "text" as const, text: "Tool not available" }], isError: true };
        }

        // Resolve API key: user key > shared key
        const customMcpKeys = extra.authInfo?.extra?.customMcpKeys as Record<string, string> | undefined;
        const userKey = customMcpKeys?.[srv.id];
        const sharedKey = srv.shared_api_key ? decrypt(srv.shared_api_key) : undefined;
        const resolvedKey = userKey ?? sharedKey;

        if (!resolvedKey && srv.auth_type === "bearer") {
          const result = resolveApiKeyForProxy(pre, namespacedName, integrationId, srv.name, {
            keyMode: srv.key_mode ?? undefined,
          });
          if ("error" in result) return result.error;
        }

        return executeWithLogging(
          { ...pre, toolName: namespacedName, integrationId },
          async () => proxyToolCall(srv.server_url, resolvedKey, ct.tool_name, args as Record<string, unknown>),
        );
      }
    );
  }

  // Register native proxy integration tools (from DB or fallback)
  const proxyTools = resolvedProxyTools?.tools ?? [];
  for (const tool of proxyTools) {
    const proxy = proxyIntegrationRegistry.get(tool.integrationId);
    if (!proxy) continue;

    const integrationId = `proxy:${tool.integrationId}`;
    toolMeta.set(tool.name, { integrationId, orgId: null, keyMode: proxy.keyMode, proxyOAuth: !!proxy.oauth });
    const zodSchema = jsonSchemaToZodToolSchema(tool.inputSchema);
    server.tool(
      tool.name,
      tool.description,
      zodSchema.shape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args, extra): Promise<any> => {
        const pre = toolPreCheck(tool.name, integrationId, extra);
        if (isPreCheckError(pre)) return pre;

        // Resolve bearer token: OAuth connection or API key
        let bearerToken: string | undefined;

        if (proxy.oauth) {
          const connection = resolveConnection(extra, proxy.id);
          if (!connection) {
            return connectionNotFoundError(pre, tool.name, integrationId, proxy.name);
          }

          try {
            const tokens = await getValidTokens(connection);
            bearerToken = tokens.accessToken;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Token error";
            logUsage({
              userId: pre.userId, apiKeyId: pre.apiKeyId, toolName: tool.name, integrationId,
              status: "error", errorMessage: message,
              durationMs: Date.now() - pre.startTime, organizationId: pre.organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return { content: [{ type: "text" as const, text: message }], isError: true };
          }
        } else {
          const userKey = (extra.authInfo?.extra?.proxyUserKeys as Record<string, string> | undefined)?.[proxy.id];
          const orgKey = (extra.authInfo?.extra?.integrationOrgKeys as Record<string, string> | undefined)?.[proxy.id];
          const result = resolveApiKeyForProxy(pre, tool.name, integrationId, proxy.name, {
            userKey: proxy.keyMode === "per_user" ? userKey : orgKey,
            fallbackKey: proxy.keyMode === "per_user" ? undefined : userKey,
            keyMode: proxy.keyMode,
          });
          if ("error" in result) return result.error;
          bearerToken = result.key;
        }

        // Trigger on-demand schema discovery for integrations still using fallback schemas
        if (resolvedProxyTools?.fallbackIntegrationIds.has(proxy.id) && !discoveredIntegrations.has(proxy.id)) {
          discoveredIntegrations.add(proxy.id);
          discoverAndCacheProxyTools(proxy.id, proxy.serverUrl, bearerToken)
            .then(() => loadProxyTools().then((r) => { resolvedProxyTools = r; }))
            .catch((err) => console.warn(`[proxy] On-demand discovery failed for ${proxy.id}:`, err.message));
        }

        return executeWithLogging(
          { ...pre, toolName: tool.name, integrationId },
          async () => proxyToolCall(proxy.serverUrl, bearerToken, tool.name, args as Record<string, unknown>),
          {
            formatError: (err) => {
              const message = err instanceof Error ? err.message : "Unknown error";
              console.error(`[proxy-tool] ${tool.name} failed for user=${pre.userId} integration=${integrationId}:`, message);
              const isAuthError = /missing_token|invalid_auth|token_revoked|not_authed|account_inactive/i.test(message);
              return isAuthError
                ? `Integration "${proxy.name}" returned an auth error. Please reconnect it in your dashboard.`
                : `Proxy tool "${tool.name}" failed: ${message}`;
            },
          },
        );
      }
    );
  }

  // Build search index from all registered tool sources
  const toolEntries: Array<{ name: string; description: string; integrationId: string; integrationName: string }> = [];
  for (const integration of allIntegrations) {
    for (const tool of integration.tools) {
      toolEntries.push({ name: tool.name, description: tool.description, integrationId: integration.id, integrationName: integration.name });
    }
  }
  for (const tool of proxyTools) {
    const proxy = proxyIntegrationRegistry.get(tool.integrationId);
    toolEntries.push({ name: tool.name, description: tool.description, integrationId: tool.integrationId, integrationName: proxy?.name ?? tool.integrationId });
  }
  for (const ct of customTools) {
    const srv = ct.custom_mcp_servers as { id: string; slug: string; name: string };
    const namespacedName = `${srv.slug}__${ct.tool_name}`;
    toolEntries.push({ name: namespacedName, description: ct.description, integrationId: `custom:${srv.id}`, integrationName: srv.name });
  }
  // Platform and vault tools
  for (const [name, meta] of toolMeta.entries()) {
    if ((meta.integrationId === "platform" || meta.integrationId === "vault") && !toolEntries.some((e) => e.name === name)) {
      const regTool = (server as unknown as { _registeredTools: Record<string, { description?: string }> })._registeredTools[name];
      if (regTool) {
        const displayName = meta.integrationId === "vault" ? "Vault" : "Switchboard";
        toolEntries.push({ name, description: regTool.description ?? "", integrationId: meta.integrationId, integrationName: displayName });
      }
    }
  }
  const searchIndex: ToolIndexEntry[] = buildToolIndex(toolEntries);

  // Fire-and-forget: ensure all tools have embeddings in pgvector
  ensureToolEmbeddings(toolEntries).catch(() => {});

  // Override tools/list to filter per-user based on connections, org, and permissions
  const registeredTools = (server as unknown as { _registeredTools: Record<string, {
    enabled: boolean;
    description?: string;
    inputSchema?: unknown;
    annotations?: unknown;
  }> })._registeredTools;

  // Register discover_tools and call_tool (needs registeredTools reference)
  registerDiscoverTools(server, toolMeta, searchIndex, registeredTools);
  registerCallTool(server, toolMeta, registeredTools);

  server.server.setRequestHandler(ListToolsRequestSchema, (_request, extra) => {
    const tools = filterToolsForUser(registeredTools, toolMeta, {
      connections: extra.authInfo?.extra?.connections as
        | Array<{ integrationId: string }>
        | undefined,
      organizationId: extra.authInfo?.extra?.organizationId as string | undefined,
      permissionsMode: extra.authInfo?.extra?.permissionsMode as string | undefined,
      integrationAccess: extra.authInfo?.extra?.integrationAccess as
        | Array<{ integrationId: string; allowedTools: string[] }>
        | undefined,
      integrationOrgKeys: extra.authInfo?.extra?.integrationOrgKeys as
        | Record<string, string>
        | undefined,
      proxyUserKeys: extra.authInfo?.extra?.proxyUserKeys as
        | Record<string, string>
        | undefined,
      apiKeyScope: extra.authInfo?.extra?.apiKeyScope as string | undefined,
      role: extra.authInfo?.extra?.role as string | undefined,
      orgRole: extra.authInfo?.extra?.orgRole as string | undefined,
      discoveryMode: extra.authInfo?.extra?.discoveryMode as boolean | undefined,
    });

    return { tools };
  });
}

async function mcpHandler(req: Request): Promise<Response> {
  // Ensure custom tools, proxy tools, and skills are loaded before first request
  if (resolvedCustomTools === null) {
    resolvedCustomTools = await customToolsPromise;
  }
  if (resolvedProxyTools === null) {
    resolvedProxyTools = await proxyToolsPromise;
  }
  if (resolvedSkills === null) {
    resolvedSkills = await skillsPromise;
  }

  // Auto-discover proxy tools if we're using fallback (DB is empty)
  // Skip OAuth-based integrations (they require per-user tokens for tools/list)
  // Use cooldown to prevent re-triggering on every request
  if (resolvedProxyTools.fallbackIntegrationIds.size > 0 && !proxyDiscoveryCooldownUntil) {
    proxyDiscoveryCooldownUntil = Date.now() + 5 * 60 * 1000; // 5 min cooldown
    for (const proxy of allProxyIntegrations) {
      // OAuth integrations can't discover without user tokens — skip them
      if (proxy.oauth) continue;
      discoverAndCacheProxyTools(proxy.id, proxy.serverUrl)
        .then(() => {
          // Reload from DB after successful discovery
          loadProxyTools().then((result) => {
            resolvedProxyTools = result;
          });
        })
        .catch(() => {});
    }
  } else if (proxyDiscoveryCooldownUntil && Date.now() > proxyDiscoveryCooldownUntil) {
    proxyDiscoveryCooldownUntil = null; // Reset cooldown so next request can retry
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = new McpServer(
    { name: "switchboard", version: "1.0.0" },
    { capabilities: { prompts: {} } },
  );
  registerTools(server);
  registerSkills(server);
  registerAdminTools(server, toolMeta);
  registerVaultTools(server, toolMeta);
  await server.connect(transport);

  const authInfo = (req as Request & { auth?: unknown }).auth as
    | import("@modelcontextprotocol/sdk/server/auth/types.js").AuthInfo
    | undefined;

  return transport.handleRequest(req, { authInfo });
}

const authedHandler = withMcpAuth(
  mcpHandler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;

    const keyHash = hashApiKey(bearerToken);
    const { data: apiKey } = await supabaseAdmin
      .from("api_keys")
      .select("user_id, id, organization_id, scope, expires_at")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .single();

    if (!apiKey) return undefined;

    // Check if key is expired — still return auth but flag it
    const keyExpired = apiKey.expires_at
      ? new Date(apiKey.expires_at) < new Date()
      : false;

    const organizationId = apiKey.organization_id;

    // Rate limit: 120 req/min per org (cheap, no DB)
    const rl = checkRateLimit(`mcp:org:${organizationId}`, 120, 60_000);
    if (!rl.allowed) return undefined;

    // Update last used time (fire-and-forget)
    supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id)
      .then();

    // Parallelize all independent DB queries (all depend only on user_id / org_id from api_keys)
    const [
      { data: profile },
      { data: accessRows },
      { data: rawConnections },
      { data: rawUserKeys },
      { data: rawOrgKeys },
      { data: rawProxyUserKeys },
      { data: teamMemberships },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("status, permissions_mode, organization_id, org_role, role, discovery_mode").eq("id", apiKey.user_id).single(),
      supabaseAdmin.from("user_integration_access").select("integration_id, allowed_tools").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("connections").select("id, integration_id, access_token, refresh_token, expires_at, sender_name").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("custom_mcp_user_keys").select("server_id, api_key").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("integration_org_keys").select("integration_id, api_key").eq("organization_id", organizationId).eq("enabled", true),
      supabaseAdmin.from("proxy_user_keys").select("integration_id, api_key").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("team_members").select("team_id").eq("user_id", apiKey.user_id),
    ]);

    // Deny deactivated users (before any decryption work)
    if (!profile || profile.status === "deactivated") return undefined;

    const connections = (rawConnections ?? []).map((c) => ({
      id: c.id,
      integrationId: c.integration_id,
      accessToken: decrypt(c.access_token),
      refreshToken: c.refresh_token ? decrypt(c.refresh_token) : null,
      expiresAt: c.expires_at ? new Date(c.expires_at) : null,
      senderName: c.sender_name as string | null,
    }));

    const integrationAccess = (accessRows ?? []).map((a) => ({
      integrationId: a.integration_id,
      allowedTools: a.allowed_tools,
    }));

    const customMcpKeys: Record<string, string> = {};
    for (const k of rawUserKeys ?? []) {
      customMcpKeys[k.server_id] = decrypt(k.api_key);
    }

    const integrationOrgKeys: Record<string, string> = {};
    for (const k of rawOrgKeys ?? []) {
      integrationOrgKeys[k.integration_id] = decrypt(k.api_key);
    }

    const proxyUserKeys: Record<string, string> = {};
    for (const k of rawProxyUserKeys ?? []) {
      proxyUserKeys[k.integration_id] = decrypt(k.api_key);
    }

    const teamIds = (teamMemberships ?? []).map((m) => m.team_id);

    return {
      token: bearerToken,
      clientId: apiKey.user_id,
      scopes: ["all"],
      extra: {
        userId: apiKey.user_id,
        apiKeyId: apiKey.id,
        organizationId,
        connections,
        permissionsMode: profile.permissions_mode,
        integrationAccess,
        customMcpKeys,
        integrationOrgKeys,
        proxyUserKeys,
        teamIds,
        orgRole: profile.org_role ?? "member",
        role: profile.role ?? "user",
        apiKeyScope: apiKey.scope ?? "full",
        discoveryMode: profile.discovery_mode ?? false,
        keyExpired,
      },
    };
  },
  { required: true }
);

async function handler(req: Request) {
  try {
    return await authedHandler(req);
  } catch (err) {
    console.error("[MCP] Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export { handler as GET, handler as POST, handler as DELETE };
