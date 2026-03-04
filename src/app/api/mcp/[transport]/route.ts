import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { withMcpAuth } from "mcp-handler";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/crypto";
import { decrypt } from "@/lib/encryption";
import { checkRateLimit } from "@/lib/rate-limit";
import { allIntegrations } from "@/lib/integrations/registry";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { getValidTokens } from "@/lib/integrations/token-refresh";
import type { McpToolResult } from "@/lib/integrations/types";
import { logUsage } from "@/lib/usage-log";
import { isToolAllowed } from "@/lib/permissions";
import { proxyToolCall } from "@/lib/mcp/proxy-client";
import { filterToolsForUser, type ToolMeta } from "@/lib/mcp/tool-filtering";

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

function registerTools(server: McpServer) {
  // Register builtin integration tools
  for (const integration of allIntegrations) {
    for (const tool of integration.tools) {
      toolMeta.set(tool.name, { integrationId: integration.id, orgId: null });
      server.tool(
        tool.name,
        tool.description,
        tool.schema.shape,
        async (args, extra) => {
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
            });
            return {
              content: [{ type: "text" as const, text: "Tool not available" }],
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
              client
            );
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId: integration.id,
              status: "success",
              durationMs: Date.now() - startTime,
              organizationId,
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
          });
          return {
            content: [{ type: "text" as const, text: "Tool not available" }],
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
          });
          return {
            content: [{ type: "text" as const, text: "An internal error occurred" }],
            isError: true,
          };
        }
      }
    );
  }

  // Register native proxy integration tools
  for (const proxy of allProxyIntegrations) {
    const integrationId = `proxy:${proxy.id}`;
    for (const tool of proxy.tools) {
      toolMeta.set(tool.name, { integrationId, orgId: null, keyMode: proxy.keyMode });
      server.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        async (args, extra) => {
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
            });
            return {
              content: [{ type: "text" as const, text: "Tool not available" }],
              isError: true,
            };
          }

          // Look up API key based on keyMode
          const apiKey = proxy.keyMode === "per_user"
            ? (extra.authInfo?.extra?.proxyUserKeys as Record<string, string> | undefined)?.[proxy.id]
            : (extra.authInfo?.extra?.integrationOrgKeys as Record<string, string> | undefined)?.[proxy.id];

          if (!apiKey) {
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

          try {
            const result = await proxyToolCall(
              proxy.serverUrl,
              apiKey,
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
            });
            return result;
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            logUsage({
              userId,
              apiKeyId,
              toolName: tool.name,
              integrationId,
              status: "error",
              errorMessage: message,
              durationMs: Date.now() - startTime,
              organizationId,
            });
            return {
              content: [{ type: "text" as const, text: "An internal error occurred" }],
              isError: true,
            };
          }
        }
      );
    }
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
    });

    return { tools };
  });
}

async function mcpHandler(req: Request): Promise<Response> {
  // Ensure custom tools are loaded before first request
  if (resolvedCustomTools === null) {
    resolvedCustomTools = await customToolsPromise;
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = new McpServer(
    { name: "switchboard", version: "1.0.0" },
  );
  registerTools(server);
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
      .select("user_id, id, organization_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .single();

    if (!apiKey) return undefined;

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
      .select("id, integration_id, access_token, refresh_token, expires_at")
      .eq("user_id", apiKey.user_id);

    const connections = (rawConnections ?? []).map((c) => ({
      id: c.id,
      integrationId: c.integration_id,
      accessToken: decrypt(c.access_token),
      refreshToken: c.refresh_token ? decrypt(c.refresh_token) : null,
      expiresAt: c.expires_at ? new Date(c.expires_at) : null,
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
