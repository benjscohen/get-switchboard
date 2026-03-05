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

// Check if the API key is expired and return a helpful MCP error
function checkKeyExpired(extra: { authInfo?: { extra?: Record<string, unknown> } }) {
  if (extra.authInfo?.extra?.keyExpired) {
    const dashboardUrl = process.env.APP_URL || "your dashboard";
    return {
      content: [{ type: "text" as const, text: `Your API key has expired. Generate a new one at ${dashboardUrl}/dashboard` }],
      isError: true,
    };
  }
  return null;
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
  return { tools: [] as ProxyTool[], fromFallback: true };
});
let resolvedProxyTools: { tools: ProxyTool[]; fromFallback: boolean } | null = null;
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

  // Register list_skills tool
  server.tool(
    "list_skills",
    "List available skills (prompt templates) for the current user",
    {},
    async (_args, extra) => {
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
  );

  // Register get_skill tool
  server.tool(
    "get_skill",
    "Get a skill's content by its prompt name (e.g. org:code-review)",
    { name: z.string().describe("The skill prompt name (e.g. org:code-review)") },
    async (args, extra) => {
      const userId = extra.authInfo?.extra?.userId as string | undefined;
      const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
      const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;

      const visible = filterSkillsForUser(skills, { userId, organizationId, teamIds });
      const requestedName = args.name;
      const skill = visible.find((s) => skillPromptName(s) === requestedName);

      if (!skill) {
        return {
          content: [{ type: "text" as const, text: `Skill "${requestedName}" not found or not available` }],
          isError: true,
        };
      }

      const content = skill.content;

      return {
        content: [{ type: "text" as const, text: content }],
      };
    }
  );

  // Register create_skill tool
  server.tool(
    "create_skill",
    "Create a new skill (prompt template). Note: newly created skills will be available as MCP prompts after server restart.",
    {
      scope: z.enum(["user", "organization", "team"]).describe("Skill visibility scope"),
      name: z.string().describe("Skill name"),
      slug: z.string().optional().describe("URL-friendly slug (auto-generated from name if omitted)"),
      description: z.string().optional().describe("Short description of the skill"),
      content: z.string().describe("Skill prompt content (supports {{arg}} interpolation)"),
      arguments: z.array(z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
      })).optional().describe("Skill arguments for interpolation"),
      team_id: z.string().optional().describe("Team ID (required when scope is 'team')"),
    },
    async (args, extra) => {
      const auth = mcpSkillAuth(extra);
      if (!auth) return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };

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
  );

  // Register update_skill tool
  server.tool(
    "update_skill",
    "Update an existing skill's name, description, content, arguments, or enabled status. Note: changes to MCP prompts take effect after server restart.",
    {
      id: z.string().describe("Skill ID to update"),
      name: z.string().optional().describe("New skill name"),
      description: z.string().optional().describe("New description"),
      content: z.string().optional().describe("New prompt content"),
      arguments: z.array(z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
      })).optional().describe("New skill arguments"),
      enabled: z.boolean().optional().describe("Enable or disable the skill"),
    },
    async (args, extra) => {
      const auth = mcpSkillAuth(extra);
      if (!auth) return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };

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
  );

  // Register delete_skill tool
  server.tool(
    "delete_skill",
    "Permanently delete a skill. This cannot be undone.",
    {
      id: z.string().describe("Skill ID to delete"),
    },
    async (args, extra) => {
      const auth = mcpSkillAuth(extra);
      if (!auth) return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };

      const result = await deleteSkillService(auth, args.id);

      if (!result.ok) return { content: [{ type: "text" as const, text: result.error }], isError: true };
      return {
        content: [{ type: "text" as const, text: "Skill deleted successfully." }],
      };
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

  // Register builtin integration tools
  for (const integration of allIntegrations) {
    for (const tool of integration.tools) {
      toolMeta.set(tool.name, { integrationId: integration.id, orgId: null });
      server.tool(
        tool.name,
        tool.description,
        tool.schema.shape,
        async (args, extra) => {
          const expiredResult = checkKeyExpired(extra);
          if (expiredResult) return expiredResult;

          const startTime = Date.now();
          const userId = extra.authInfo?.extra?.userId as string | undefined;
          const apiKeyId = extra.authInfo?.extra?.apiKeyId as string | undefined;
          const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;

          if (!userId) {
            logUsage({
              userId: "unknown",
              apiKeyId,
              toolName: tool.name,
              integrationId: integration.id,
              status: "unauthorized",
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [{ type: "text" as const, text: "Unauthorized" }],
              isError: true,
            };
          }

          // Check per-user tool permissions
          const permissionsMode = extra.authInfo?.extra?.permissionsMode as string | undefined;
          const integrationAccess = extra.authInfo?.extra?.integrationAccess as
            | Array<{ integrationId: string; allowedTools: string[] }>
            | undefined;

          if (
            permissionsMode &&
            integrationAccess &&
            !isToolAllowed(permissionsMode, integrationAccess, integration.id, tool.name)
          ) {
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId: integration.id,
              status: "unauthorized",
              errorMessage: "Tool not available",
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [{ type: "text" as const, text: "Tool not available" }],
              isError: true,
            };
          }

          // API key scope check
          const apiKeyScope = extra.authInfo?.extra?.apiKeyScope as string | undefined;
          if (apiKeyScope && apiKeyScope !== "full") {
            const risk = getToolRisk(tool.name);
            if (!isRiskAllowedByScope(risk, apiKeyScope)) {
              logUsage({
                userId,
                apiKeyId,
                toolName: tool.name,
                integrationId: integration.id,
                status: "unauthorized",
                errorMessage: "Tool not available for this API key scope",
                organizationId,
                riskLevel: getToolRisk(tool.name),
              });
              return {
                content: [{ type: "text" as const, text: "Tool not available" }],
                isError: true,
              };
            }
          }

          // Per-user rate limit by risk level
          const rl = checkToolRateLimit(userId, tool.name);
          if (!rl.allowed) {
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId: integration.id,
              status: "error",
              errorMessage: "Rate limit exceeded",
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [{ type: "text" as const, text: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }],
              isError: true,
            };
          }

          // Look up the user's connection for this integration
          const connections = extra.authInfo?.extra?.connections as
            | Array<{
                id: string;
                integrationId: string;
                accessToken: string;
                refreshToken: string | null;
                expiresAt: Date | null;
                senderName?: string | null;
              }>
            | undefined;

          const connection = connections?.find(
            (c) => c.integrationId === integration.id
          );

          if (!connection) {
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId: integration.id,
              status: "error",
              errorMessage: "Integration not connected",
              durationMs: Date.now() - startTime,
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Integration "${integration.name}" is not connected. Connect it at your dashboard.`,
                },
              ],
              isError: true,
            };
          }

          try {
            const tokens = await getValidTokens(connection);
            const client = integration.createClient(tokens);
            const result = await tool.execute(
              args as Record<string, unknown>,
              client,
              { senderName: connection.senderName }
            );
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId: integration.id,
              status: "success",
              durationMs: Date.now() - startTime,
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            if (
              result &&
              typeof result === "object" &&
              "_mcpContent" in (result as Record<string, unknown>)
            ) {
              return {
                content: (result as McpToolResult)._mcpContent,
              };
            }
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId: integration.id,
              status: "error",
              errorMessage: message,
              durationMs: Date.now() - startTime,
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });

            // Determine a useful client-facing message
            let clientMessage: string;
            const authMessages = [
              "Token expired and no refresh token available",
              "Token refresh failed. Please reconnect the integration.",
              "Integration not connected",
            ];
            if (authMessages.includes(message)) {
              clientMessage = message;
            } else if (
              err &&
              typeof err === "object" &&
              "response" in err
            ) {
              // Google API errors (GaxiosError) — surface the descriptive message
              const apiMsg = (
                err as { response?: { data?: { error?: { message?: string } } } }
              ).response?.data?.error?.message;
              clientMessage = apiMsg || message;
            } else {
              clientMessage = "An internal error occurred";
            }

            return {
              content: [{ type: "text" as const, text: clientMessage }],
              isError: true,
            };
          }
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
    server.tool(
      namespacedName,
      `[${srv.name}] ${ct.description}`,
      ct.input_schema as Record<string, unknown>,
      async (args, extra) => {
        const expiredResult = checkKeyExpired(extra);
        if (expiredResult) return expiredResult;

        const startTime = Date.now();
        const userId = extra.authInfo?.extra?.userId as string | undefined;
        const apiKeyId = extra.authInfo?.extra?.apiKeyId as string | undefined;
        const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;

        if (!userId) {
          logUsage({
            userId: "unknown",
            apiKeyId,
            toolName: namespacedName,
            integrationId,
            status: "unauthorized",
            organizationId,
            riskLevel: getToolRisk(namespacedName),
          });
          return {
            content: [{ type: "text" as const, text: "Unauthorized" }],
            isError: true,
          };
        }

        // Org-scoped access check: global servers (null org_id) are available to all,
        // org-specific servers are only available to members of that org
        if (srv.organization_id !== null && srv.organization_id !== organizationId) {
          logUsage({
            userId,
            apiKeyId,
            toolName: namespacedName,
            integrationId,
            status: "unauthorized",
            errorMessage: "Tool not available for this organization",
            organizationId,
            riskLevel: getToolRisk(namespacedName),
          });
          return {
            content: [{ type: "text" as const, text: "Tool not available" }],
            isError: true,
          };
        }

        // Check permissions
        const permissionsMode = extra.authInfo?.extra?.permissionsMode as string | undefined;
        const integrationAccess = extra.authInfo?.extra?.integrationAccess as
          | Array<{ integrationId: string; allowedTools: string[] }>
          | undefined;

        if (
          permissionsMode &&
          integrationAccess &&
          !isToolAllowed(permissionsMode, integrationAccess, integrationId, namespacedName)
        ) {
          logUsage({
            userId,
            apiKeyId,
            toolName: namespacedName,
            integrationId,
            status: "unauthorized",
            errorMessage: "Tool not available",
            organizationId,
            riskLevel: getToolRisk(namespacedName),
          });
          return {
            content: [{ type: "text" as const, text: "Tool not available" }],
            isError: true,
          };
        }

        // API key scope check
        const apiKeyScope = extra.authInfo?.extra?.apiKeyScope as string | undefined;
        if (apiKeyScope && apiKeyScope !== "full") {
          const risk = getToolRisk(namespacedName);
          if (!isRiskAllowedByScope(risk, apiKeyScope)) {
            logUsage({
              userId,
              apiKeyId,
              toolName: namespacedName,
              integrationId,
              status: "unauthorized",
              errorMessage: "Tool not available for this API key scope",
              organizationId,
              riskLevel: getToolRisk(namespacedName),
            });
            return {
              content: [{ type: "text" as const, text: "Tool not available" }],
              isError: true,
            };
          }
        }

        // Per-user rate limit by risk level
        const rl = checkToolRateLimit(userId, namespacedName);
        if (!rl.allowed) {
          logUsage({
            userId,
            apiKeyId,
            toolName: namespacedName,
            integrationId,
            status: "error",
            errorMessage: "Rate limit exceeded",
            organizationId,
            riskLevel: getToolRisk(namespacedName),
          });
          return {
            content: [{ type: "text" as const, text: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }],
            isError: true,
          };
        }

        // Resolve API key: user key > shared key
        const customMcpKeys = extra.authInfo?.extra?.customMcpKeys as
          | Record<string, string>
          | undefined;
        const userKey = customMcpKeys?.[srv.id];
        const sharedKey = srv.shared_api_key ? decrypt(srv.shared_api_key) : undefined;
        const resolvedKey = userKey ?? sharedKey;

        if (!resolvedKey && srv.auth_type === "bearer") {
          const isPerUser = srv.key_mode === "per_user";
          logUsage({
            userId,
            apiKeyId,
            toolName: namespacedName,
            integrationId,
            status: "error",
            errorMessage: isPerUser ? "No personal API key configured" : "No API key configured",
            durationMs: Date.now() - startTime,
            organizationId,
            riskLevel: getToolRisk(namespacedName),
          });
          return {
            content: [
              {
                type: "text" as const,
                text: isPerUser
                  ? "This server requires a personal API key. Add one in your dashboard."
                  : "No API key configured for this MCP server. Add one in your dashboard.",
              },
            ],
            isError: true,
          };
        }

        try {
          const result = await proxyToolCall(
            srv.server_url,
            resolvedKey,
            ct.tool_name,
            args as Record<string, unknown>
          );
          logUsage({
            userId,
            apiKeyId,
            toolName: namespacedName,
            integrationId,
            status: result.isError ? "error" : "success",
            durationMs: Date.now() - startTime,
            organizationId,
            riskLevel: getToolRisk(namespacedName),
          });
          return result;
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          logUsage({
            userId,
            apiKeyId,
            toolName: namespacedName,
            integrationId,
            status: "error",
            errorMessage: message,
            durationMs: Date.now() - startTime,
            organizationId,
            riskLevel: getToolRisk(namespacedName),
          });
          return {
            content: [{ type: "text" as const, text: "An internal error occurred" }],
            isError: true,
          };
        }
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
      async (args, extra) => {
        const expiredResult = checkKeyExpired(extra);
        if (expiredResult) return expiredResult;

        const startTime = Date.now();
        const userId = extra.authInfo?.extra?.userId as string | undefined;
        const apiKeyId = extra.authInfo?.extra?.apiKeyId as string | undefined;
        const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;

        if (!userId) {
          logUsage({
            userId: "unknown",
            apiKeyId,
            toolName: tool.name,
            integrationId,
            status: "unauthorized",
            organizationId,
            riskLevel: getToolRisk(tool.name),
          });
          return {
            content: [{ type: "text" as const, text: "Unauthorized" }],
            isError: true,
          };
        }

        // Check per-user tool permissions
        const permissionsMode = extra.authInfo?.extra?.permissionsMode as string | undefined;
        const integrationAccess = extra.authInfo?.extra?.integrationAccess as
          | Array<{ integrationId: string; allowedTools: string[] }>
          | undefined;

        if (
          permissionsMode &&
          integrationAccess &&
          !isToolAllowed(permissionsMode, integrationAccess, integrationId, tool.name)
        ) {
          logUsage({
            userId,
            apiKeyId,
            toolName: tool.name,
            integrationId,
            status: "unauthorized",
            errorMessage: "Tool not available",
            organizationId,
            riskLevel: getToolRisk(tool.name),
          });
          return {
            content: [{ type: "text" as const, text: "Tool not available" }],
            isError: true,
          };
        }

        // API key scope check
        const apiKeyScope = extra.authInfo?.extra?.apiKeyScope as string | undefined;
        if (apiKeyScope && apiKeyScope !== "full") {
          const risk = getToolRisk(tool.name);
          if (!isRiskAllowedByScope(risk, apiKeyScope)) {
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId,
              status: "unauthorized",
              errorMessage: "Tool not available for this API key scope",
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [{ type: "text" as const, text: "Tool not available" }],
              isError: true,
            };
          }
        }

        // Per-user rate limit by risk level
        const rl = checkToolRateLimit(userId, tool.name);
        if (!rl.allowed) {
          logUsage({
            userId,
            apiKeyId,
            toolName: tool.name,
            integrationId,
            status: "error",
            errorMessage: "Rate limit exceeded",
            organizationId,
            riskLevel: getToolRisk(tool.name),
          });
          return {
            content: [{ type: "text" as const, text: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }],
            isError: true,
          };
        }

        // Resolve bearer token: OAuth connection or API key
        let bearerToken: string | undefined;

        if (proxy.oauth) {
          // OAuth-based proxy: use connection tokens
          const connections = extra.authInfo?.extra?.connections as
            | Array<{
                id: string;
                integrationId: string;
                accessToken: string;
                refreshToken: string | null;
                expiresAt: Date | null;
                senderName?: string | null;
              }>
            | undefined;

          const connection = connections?.find((c) => c.integrationId === proxy.id);
          if (!connection) {
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId,
              status: "error",
              errorMessage: "Integration not connected",
              durationMs: Date.now() - startTime,
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Integration "${proxy.name}" is not connected. Connect it at your dashboard.`,
                },
              ],
              isError: true,
            };
          }

          try {
            const tokens = await getValidTokens(connection);
            bearerToken = tokens.accessToken;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Token error";
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId,
              status: "error",
              errorMessage: message,
              durationMs: Date.now() - startTime,
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [{ type: "text" as const, text: message }],
              isError: true,
            };
          }
        } else {
          // Key-based proxy
          bearerToken = proxy.keyMode === "per_user"
            ? (extra.authInfo?.extra?.proxyUserKeys as Record<string, string> | undefined)?.[proxy.id]
            : (extra.authInfo?.extra?.integrationOrgKeys as Record<string, string> | undefined)?.[proxy.id];

          if (!bearerToken) {
            const errorMessage = proxy.keyMode === "per_user"
              ? "No personal API key configured"
              : "No API key configured for this integration";
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId,
              status: "error",
              errorMessage,
              durationMs: Date.now() - startTime,
              organizationId,
              riskLevel: getToolRisk(tool.name),
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: proxy.keyMode === "per_user"
                    ? `Integration "${proxy.name}" requires a personal API key. Add one in your dashboard.`
                    : `Integration "${proxy.name}" is not configured. An org admin must add an API key in Organization Settings.`,
                },
              ],
              isError: true,
            };
          }
        }

        // Trigger on-demand schema discovery for integrations still using fallback schemas
        if (resolvedProxyTools?.fromFallback && !discoveredIntegrations.has(proxy.id)) {
          discoveredIntegrations.add(proxy.id);
          discoverAndCacheProxyTools(proxy.id, proxy.serverUrl, bearerToken)
            .then(() => loadProxyTools().then((r) => { resolvedProxyTools = r; }))
            .catch((err) => console.warn(`[proxy] On-demand discovery failed for ${proxy.id}:`, err.message));
        }

        try {
          const result = await proxyToolCall(
            proxy.serverUrl,
            bearerToken,
            tool.name,
            args as Record<string, unknown>
          );
          logUsage({
            userId,
            apiKeyId,
            toolName: tool.name,
            integrationId,
            status: result.isError ? "error" : "success",
            durationMs: Date.now() - startTime,
            organizationId,
            riskLevel: getToolRisk(tool.name),
          });
          return result;
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          console.error(
            `[proxy-tool] ${tool.name} failed for user=${userId} integration=${integrationId}:`,
            message
          );

          // Provide actionable error messages for common auth failures
          const isAuthError = /missing_token|invalid_auth|token_revoked|not_authed|account_inactive/i.test(message);
          const userMessage = isAuthError
            ? `Integration "${proxy.name}" returned an auth error. Please reconnect it in your dashboard.`
            : `Proxy tool "${tool.name}" failed: ${message}`;

          logUsage({
            userId,
            apiKeyId,
            toolName: tool.name,
            integrationId,
            status: "error",
            errorMessage: message,
            durationMs: Date.now() - startTime,
            organizationId,
            riskLevel: getToolRisk(tool.name),
          });
          return {
            content: [{ type: "text" as const, text: userMessage }],
            isError: true,
          };
        }
      }
    );
  }

  // Override tools/list to filter per-user based on connections, org, and permissions
  const registeredTools = (server as unknown as { _registeredTools: Record<string, {
    enabled: boolean;
    description?: string;
    inputSchema?: unknown;
    annotations?: unknown;
  }> })._registeredTools;

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
  if (resolvedProxyTools.fromFallback && !proxyDiscoveryCooldownUntil) {
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

    // Load user status and permissions
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("status, permissions_mode, organization_id, org_role")
      .eq("id", apiKey.user_id)
      .single();

    // Deny deactivated users
    if (!profile || profile.status === "deactivated") return undefined;

    const organizationId = apiKey.organization_id;

    // Load integration access rules
    const { data: accessRows } = await supabaseAdmin
      .from("user_integration_access")
      .select("integration_id, allowed_tools")
      .eq("user_id", apiKey.user_id);

    // Update last used time (fire-and-forget)
    supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id)
      .then();

    // Rate limit: 120 req/min per org
    const rl = checkRateLimit(`mcp:org:${organizationId}`, 120, 60_000);
    if (!rl.allowed) return undefined;

    // Load all connections for the key creator and decrypt tokens
    const { data: rawConnections } = await supabaseAdmin
      .from("connections")
      .select("id, integration_id, access_token, refresh_token, expires_at, sender_name")
      .eq("user_id", apiKey.user_id);

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

    // Load custom MCP user keys
    const { data: rawUserKeys } = await supabaseAdmin
      .from("custom_mcp_user_keys")
      .select("server_id, api_key")
      .eq("user_id", apiKey.user_id);

    const customMcpKeys: Record<string, string> = {};
    for (const k of rawUserKeys ?? []) {
      customMcpKeys[k.server_id] = decrypt(k.api_key);
    }

    // Load org-level native proxy integration keys
    const { data: rawOrgKeys } = await supabaseAdmin
      .from("integration_org_keys")
      .select("integration_id, api_key")
      .eq("organization_id", organizationId)
      .eq("enabled", true);

    const integrationOrgKeys: Record<string, string> = {};
    for (const k of rawOrgKeys ?? []) {
      integrationOrgKeys[k.integration_id] = decrypt(k.api_key);
    }

    // Load per-user native proxy integration keys
    const { data: rawProxyUserKeys } = await supabaseAdmin
      .from("proxy_user_keys")
      .select("integration_id, api_key")
      .eq("user_id", apiKey.user_id);

    const proxyUserKeys: Record<string, string> = {};
    for (const k of rawProxyUserKeys ?? []) {
      proxyUserKeys[k.integration_id] = decrypt(k.api_key);
    }

    // Load team memberships for skill filtering
    const { data: teamMemberships } = await supabaseAdmin
      .from("team_members")
      .select("team_id")
      .eq("user_id", apiKey.user_id);

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
        apiKeyScope: apiKey.scope ?? "full",
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
