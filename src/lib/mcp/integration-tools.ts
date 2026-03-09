import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { allIntegrations } from "@/lib/integrations/registry";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { discoverAndCacheProxyTools, loadProxyTools, type ProxyTool } from "@/lib/integrations/proxy-tools";
import { getValidTokens } from "@/lib/integrations/token-refresh";
import type { McpToolResult } from "@/lib/integrations/types";
import { logUsage } from "@/lib/usage-log";
import { submitFeedback } from "@/lib/feedback";
import { isToolAllowed, isUserInScope } from "@/lib/permissions";
import { getToolRisk, isRiskAllowedByScope } from "@/lib/mcp/tool-risk";
import { proxyToolCall, type ProxyAuth } from "@/lib/mcp/proxy-client";
import { namespaceTool } from "./proxy-namespace";
import { jsonSchemaToZodToolSchema } from "@/lib/mcp/json-schema-to-zod";
import { withToolLogging } from "@/lib/mcp/tool-logging";
import { decrypt } from "@/lib/encryption";
import type { ToolMeta } from "@/lib/mcp/tool-filtering";
import { logger } from "@/lib/logger";

// ── Types ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type McpResult = { content: any[]; isError?: boolean; [key: string]: unknown };
export type McpErrorResult = { content: Array<{ type: "text"; text: string }>; isError: true };

export type PreCheckSuccess = {
  userId: string;
  apiKeyId: string | undefined;
  organizationId: string | undefined;
  startTime: number;
};

export type ConnectionInfo = {
  id: string;
  integrationId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  senderName?: string | null;
};

// ── Rate limiting ──

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
    60_000,
  );
}

// ── Pre-check ──

/**
 * Shared pre-execution checks for all tool types.
 * Returns userId + context on success, or an MCP error result on failure.
 */
export function toolPreCheck(
  toolName: string,
  integrationId: string,
  extra: { authInfo?: { extra?: Record<string, unknown> } },
): PreCheckSuccess | McpErrorResult {
  // Key expiry
  if (extra.authInfo?.extra?.keyExpired) {
    const dashboardUrl = process.env.APP_URL || "your dashboard";
    return {
      content: [{ type: "text" as const, text: `Your API key has expired. Generate a new one at ${dashboardUrl}/mcp` }],
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

  // Integration access scope check (org-level restriction)
  const integrationScopes = extra.authInfo?.extra?.integrationScopes as Record<string, Set<string>> | undefined;
  const orgRole = extra.authInfo?.extra?.orgRole as string | undefined;
  if (!isUserInScope(integrationScopes, userId, orgRole, integrationId)) {
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

export function isPreCheckError(result: PreCheckSuccess | McpErrorResult): result is McpErrorResult {
  return "isError" in result;
}

// ── Execution wrapper ──

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

// ── Connection helpers ──

/** Find a user's OAuth connection for a given integration. */
export function resolveConnection(
  extra: { authInfo?: { extra?: Record<string, unknown> } },
  integrationId: string,
): ConnectionInfo | null {
  const connections = extra.authInfo?.extra?.connections as ConnectionInfo[] | undefined;
  return connections?.find((c) => c.integrationId === integrationId) ?? null;
}

export function connectionNotFoundError(
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

/** Resolve API key with fallback chain: userKey > orgKey/sharedKey. */
export function resolveApiKeyForProxy(
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

// ── Tool registration ──

export type IntegrationToolsContext = {
  resolvedCustomTools: Array<{
    tool_name: string;
    description: string;
    input_schema: unknown;
    custom_mcp_servers: {
      id: string;
      name: string;
      slug: string;
      server_url: string;
      auth_type: string;
      shared_api_key: string | null;
      key_mode: string | null;
      status: string;
      organization_id: string | null;
      custom_headers: Array<{ key: string; value?: string }> | null;
    };
  }>;
  resolvedProxyTools: { tools: ProxyTool[]; fallbackIntegrationIds: Set<string> };
  discoveredIntegrations: Set<string>;
  onProxyToolsReload: (result: { tools: ProxyTool[]; fallbackIntegrationIds: Set<string> }) => void;
};

export function registerIntegrationTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
  ctx: IntegrationToolsContext,
) {
  // ── Platform tool: submit_feedback ──
  server.tool(
    "submit_feedback",
    "Submit feedback to the Switchboard team when something doesn't work, is confusing, or you need a capability that doesn't exist. Always succeeds — won't interrupt your workflow.",
    {
      category: z.enum(["bug", "missing_capability", "confusing", "integration_request", "other"])
        .describe("bug: something broke | missing_capability: feature needed | confusing: unexpected behavior | integration_request: new service | other"),
      message: z.string().min(1, "Required: 'message' must describe the issue or request. Be specific about what happened and what you expected.")
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
    withToolLogging("submit_feedback", "platform", async (args, extra) => {
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
    })
  );
  toolMeta.set("submit_feedback", { integrationId: "platform", orgId: null });

  // ── Builtin integration tools ──
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
                return message;
              },
            },
          );
        }
      );
    }
  }

  // ── Custom MCP proxy tools ──
  for (const ct of ctx.resolvedCustomTools) {
    const srv = ct.custom_mcp_servers;
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

        // Resolve auth: custom_headers or bearer token
        let proxyAuth: ProxyAuth;

        if (srv.auth_type === "custom_headers") {
          // Build headers from shared (server-level) + user overrides
          const merged: Record<string, string> = {};

          // Shared headers (admin-provided values)
          if (Array.isArray(srv.custom_headers)) {
            for (const h of srv.custom_headers) {
              if (h.key && h.value) merged[h.key] = decrypt(h.value);
            }
          }

          // Per-user headers override shared
          const userHeaders = (extra.authInfo?.extra?.customMcpHeaders as Record<string, Record<string, string>> | undefined)?.[srv.id];
          if (userHeaders) {
            for (const [hk, hv] of Object.entries(userHeaders)) {
              merged[hk] = hv;
            }
          }

          // Check that all required header keys have values
          const requiredKeys = Array.isArray(srv.custom_headers) ? srv.custom_headers.map((h: { key: string }) => h.key) : [];
          const missingKeys = requiredKeys.filter((k: string) => !merged[k]);
          if (missingKeys.length > 0) {
            const isPerUser = srv.key_mode === "per_user";
            logUsage({
              userId: pre.userId, apiKeyId: pre.apiKeyId, toolName: namespacedName, integrationId,
              status: "error", errorMessage: `Missing headers: ${missingKeys.join(", ")}`,
              durationMs: Date.now() - pre.startTime, organizationId: pre.organizationId,
              riskLevel: getToolRisk(namespacedName),
            });
            return {
              content: [{
                type: "text" as const,
                text: isPerUser
                  ? `Integration "${srv.name}" requires custom headers. Add them in your dashboard.`
                  : `Integration "${srv.name}" is missing required headers. An org admin must configure them.`,
              }],
              isError: true,
            };
          }

          proxyAuth = Object.keys(merged).length > 0 ? { headers: merged } : undefined;
        } else {
          // Bearer token: user key > shared key
          const customMcpKeys = extra.authInfo?.extra?.customMcpKeys as Record<string, string> | undefined;
          const userKey = customMcpKeys?.[srv.id];
          const sharedKey = srv.shared_api_key ? decrypt(srv.shared_api_key) : undefined;
          proxyAuth = userKey ?? sharedKey;

          if (!proxyAuth && srv.auth_type === "bearer") {
            const result = resolveApiKeyForProxy(pre, namespacedName, integrationId, srv.name, {
              keyMode: srv.key_mode ?? undefined,
            });
            if ("error" in result) return result.error;
          }
        }

        return executeWithLogging(
          { ...pre, toolName: namespacedName, integrationId },
          async () => proxyToolCall(srv.server_url, proxyAuth, ct.tool_name, args as Record<string, unknown>),
        );
      }
    );
  }

  // ── Native proxy integration tools ──
  const proxyTools = ctx.resolvedProxyTools.tools;
  for (const tool of proxyTools) {
    const proxy = proxyIntegrationRegistry.get(tool.integrationId);
    if (!proxy) continue;

    const integrationId = `proxy:${tool.integrationId}`;
    const namespacedName = namespaceTool(tool.integrationId, tool.name);
    toolMeta.set(namespacedName, { integrationId, orgId: null, keyMode: proxy.keyMode, proxyOAuth: !!proxy.oauth });
    const zodSchema = jsonSchemaToZodToolSchema(tool.inputSchema);
    server.tool(
      namespacedName,
      tool.description,
      zodSchema.shape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args, extra): Promise<any> => {
        const pre = toolPreCheck(namespacedName, integrationId, extra);
        if (isPreCheckError(pre)) return pre;

        // Resolve auth: OAuth, custom headers, or single API key
        let proxyAuth: ProxyAuth;

        if (proxy.oauth) {
          const connection = resolveConnection(extra, proxy.id);
          if (!connection) {
            return connectionNotFoundError(pre, namespacedName, integrationId, proxy.name);
          }

          try {
            const tokens = await getValidTokens(connection);
            proxyAuth = tokens.accessToken;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Token error";
            logUsage({
              userId: pre.userId, apiKeyId: pre.apiKeyId, toolName: namespacedName, integrationId,
              status: "error", errorMessage: message,
              durationMs: Date.now() - pre.startTime, organizationId: pre.organizationId,
              riskLevel: getToolRisk(namespacedName),
            });
            return { content: [{ type: "text" as const, text: message }], isError: true };
          }
        } else if (proxy.headerKeys?.length) {
          // Multi-header auth (e.g. Datadog DD-API-KEY + DD-APPLICATION-KEY)
          const orgHeaders = (extra.authInfo?.extra?.integrationOrgHeaders as Record<string, Record<string, string>> | undefined)?.[proxy.id];
          const userHeaders = (extra.authInfo?.extra?.proxyUserHeaders as Record<string, Record<string, string>> | undefined)?.[proxy.id];
          const resolvedHeaders = proxy.keyMode === "per_user" ? userHeaders : (orgHeaders ?? userHeaders);
          if (!resolvedHeaders) {
            const isPerUser = proxy.keyMode === "per_user";
            logUsage({
              userId: pre.userId, apiKeyId: pre.apiKeyId, toolName: namespacedName, integrationId,
              status: "error", errorMessage: "No custom headers configured",
              durationMs: Date.now() - pre.startTime, organizationId: pre.organizationId,
              riskLevel: getToolRisk(namespacedName),
            });
            return {
              content: [{
                type: "text" as const,
                text: isPerUser
                  ? `Integration "${proxy.name}" requires API keys. Add them in your dashboard.`
                  : `Integration "${proxy.name}" is not configured. An org admin must add the API keys in Organization Settings.`,
              }],
              isError: true,
            };
          }
          const missingKeys = proxy.headerKeys.filter((k) => !resolvedHeaders[k]);
          if (missingKeys.length > 0) {
            logUsage({
              userId: pre.userId, apiKeyId: pre.apiKeyId, toolName: namespacedName, integrationId,
              status: "error", errorMessage: `Missing headers: ${missingKeys.join(", ")}`,
              durationMs: Date.now() - pre.startTime, organizationId: pre.organizationId,
              riskLevel: getToolRisk(namespacedName),
            });
            return {
              content: [{ type: "text" as const, text: `Integration "${proxy.name}" is missing required keys: ${missingKeys.join(", ")}. Update them in your dashboard.` }],
              isError: true,
            };
          }
          proxyAuth = { headers: resolvedHeaders };
        } else {
          const userKey = (extra.authInfo?.extra?.proxyUserKeys as Record<string, string> | undefined)?.[proxy.id];
          const orgKey = (extra.authInfo?.extra?.integrationOrgKeys as Record<string, string> | undefined)?.[proxy.id];
          const result = resolveApiKeyForProxy(pre, namespacedName, integrationId, proxy.name, {
            userKey: proxy.keyMode === "per_user" ? userKey : orgKey,
            fallbackKey: proxy.keyMode === "per_user" ? undefined : userKey,
            keyMode: proxy.keyMode,
          });
          if ("error" in result) return result.error;
          proxyAuth = result.key;
        }

        // Trigger on-demand schema discovery for integrations still using fallback schemas
        if (ctx.resolvedProxyTools.fallbackIntegrationIds.has(proxy.id) && !ctx.discoveredIntegrations.has(proxy.id)) {
          ctx.discoveredIntegrations.add(proxy.id);
          discoverAndCacheProxyTools(proxy.id, proxy.serverUrl, proxyAuth)
            .then(() => loadProxyTools().then((r) => { ctx.onProxyToolsReload(r); }))
            .catch((err) => logger.warn({ integrationId: proxy.id, err }, "[proxy] On-demand discovery failed"));
        }

        return executeWithLogging(
          { ...pre, toolName: namespacedName, integrationId },
          async () => proxyToolCall(proxy.serverUrl, proxyAuth, tool.name, args as Record<string, unknown>),
          {
            formatError: (err) => {
              const message = err instanceof Error ? err.message : "Unknown error";
              logger.error({ toolName: namespacedName, userId: pre.userId, integrationId, errMessage: message }, "[proxy-tool] Tool execution failed");
              const isAuthError = /missing_token|invalid_auth|token_revoked|not_authed|account_inactive/i.test(message);
              return isAuthError
                ? `Integration "${proxy.name}" returned an auth error. Please reconnect it in your dashboard.`
                : `Proxy tool "${namespacedName}" failed: ${message}`;
            },
          },
        );
      }
    );
  }
}
