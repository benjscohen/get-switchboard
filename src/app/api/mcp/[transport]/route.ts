import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { withMcpAuth } from "mcp-handler";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/crypto";
import { decrypt } from "@/lib/encryption";
import { checkRateLimit } from "@/lib/rate-limit";
import { allIntegrations } from "@/lib/integrations/registry";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { loadProxyTools, discoverAndCacheProxyTools, type ProxyTool } from "@/lib/integrations/proxy-tools";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import type { SkillRecord } from "@/lib/mcp/skill-filtering";
import { registerAdminTools } from "@/lib/mcp/admin-tools";
import { registerVaultTools } from "@/lib/mcp/vault-tools";
import { registerFileTools } from "@/lib/mcp/file-tools";
import { registerMemoryTools } from "@/lib/mcp/memory-tools";
import { registerDiscoverTools } from "@/lib/mcp/discover-tools";
import { registerCallTool } from "@/lib/mcp/call-tool";
import { registerSkillTools } from "@/lib/mcp/skill-tools";
import { registerIntegrationTools } from "@/lib/mcp/integration-tools";
import { filterToolsForUser, type ToolMeta } from "@/lib/mcp/tool-filtering";
import { getFilterContext } from "@/lib/mcp/types";
import { buildToolIndex, buildIntegrationSummaryLine, ensureToolEmbeddings, type ToolIndexEntry } from "@/lib/mcp/tool-search";
import { loadIntegrationScopes } from "@/lib/integration-scopes";

// ── Module-level data loading ──

const toolMeta = new Map<string, ToolMeta>();

const customToolsPromise = supabaseAdmin
  .from("custom_mcp_tools")
  .select(
    "*, custom_mcp_servers!inner(id, name, slug, server_url, auth_type, shared_api_key, key_mode, status, organization_id, custom_headers)"
  )
  .eq("enabled", true)
  .eq("custom_mcp_servers.status", "active")
  .then((res) => {
    if (res.error) console.error("[MCP] custom_mcp_tools query error:", res.error);
    return res.data ?? [];
  });

let resolvedCustomTools: Awaited<typeof customToolsPromise> | null = null;
customToolsPromise.then((tools) => { resolvedCustomTools = tools; });

const proxyToolsPromise = loadProxyTools().catch((err) => {
  console.error("[MCP] proxy tools load error:", err);
  return { tools: [] as ProxyTool[], fallbackIntegrationIds: new Set(allProxyIntegrations.map(p => p.id)) };
});
let resolvedProxyTools: { tools: ProxyTool[]; fallbackIntegrationIds: Set<string> } | null = null;
let proxyDiscoveryCooldownUntil: number | null = null;
const discoveredIntegrations = new Set<string>();
proxyToolsPromise.then((r) => { resolvedProxyTools = r; });

const skillsPromise = supabaseAdmin
  .from("skills")
  .select("id, name, slug, description, content, arguments, organization_id, team_id, user_id, enabled")
  .eq("enabled", true)
  .then((res) => {
    if (res.error) console.error("[MCP] skills query error:", res.error);
    return (res.data ?? []) as SkillRecord[];
  });

let resolvedSkills: SkillRecord[] | null = null;
skillsPromise.then((skills) => { resolvedSkills = skills; });

// ── Discovery + tools/list handler ──

function buildAndRegisterDiscovery(server: McpServer) {
  const toolEntries: Array<{ name: string; description: string; integrationId: string; integrationName: string }> = [];
  for (const integration of allIntegrations) {
    for (const tool of integration.tools) {
      toolEntries.push({ name: tool.name, description: tool.description, integrationId: integration.id, integrationName: integration.name });
    }
  }
  const proxyTools = resolvedProxyTools?.tools ?? [];
  for (const tool of proxyTools) {
    const proxy = proxyIntegrationRegistry.get(tool.integrationId);
    toolEntries.push({ name: tool.name, description: tool.description, integrationId: tool.integrationId, integrationName: proxy?.name ?? tool.integrationId });
  }
  const customTools = resolvedCustomTools ?? [];
  for (const ct of customTools) {
    const srv = ct.custom_mcp_servers as { id: string; slug: string; name: string };
    const namespacedName = `${srv.slug}__${ct.tool_name}`;
    toolEntries.push({ name: namespacedName, description: ct.description, integrationId: `custom:${srv.id}`, integrationName: srv.name });
  }
  for (const [name, meta] of toolMeta.entries()) {
    if (!toolEntries.some((e) => e.name === name)) {
      const regTool = (server as unknown as { _registeredTools: Record<string, { description?: string }> })._registeredTools[name];
      if (regTool) {
        const displayName = meta.integrationId === "vault" ? "Vault" : meta.integrationId === "admin" ? "Admin" : "Switchboard";
        toolEntries.push({ name, description: regTool.description ?? "", integrationId: meta.integrationId, integrationName: displayName });
      }
    }
  }
  const searchIndex: ToolIndexEntry[] = buildToolIndex(toolEntries);
  ensureToolEmbeddings(toolEntries).catch(() => {});

  const registeredTools = (server as unknown as { _registeredTools: Record<string, {
    enabled: boolean;
    description?: string;
    inputSchema?: unknown;
    annotations?: unknown;
  }> })._registeredTools;

  registerDiscoverTools(server, toolMeta, searchIndex, registeredTools);
  const integrationNames = new Map(toolEntries.map(e => [e.name, e.integrationName]));
  registerCallTool(server, toolMeta, registeredTools, integrationNames);

  server.server.setRequestHandler(ListToolsRequestSchema, (_request, extra) => {
    const authCtx = getFilterContext(extra);

    const tools = filterToolsForUser(registeredTools, toolMeta, authCtx);

    if (authCtx.discoveryMode) {
      const realTools = filterToolsForUser(registeredTools, toolMeta, { ...authCtx, discoveryMode: false });
      const visibleNames = new Set(realTools.map((t) => t.name));
      const summaryLine = buildIntegrationSummaryLine(searchIndex, visibleNames);
      if (summaryLine) {
        const dt = tools.find((t) => t.name === "discover_tools");
        if (dt) {
          dt.description =
            `${dt.description}\n\nAvailable integrations: ${summaryLine}\n\nUse discover_tools with a query like "send message" or filter by category/integration.`;
        }
      }
    }

    return { tools };
  });
}

// ── MCP handler ──

async function mcpHandler(req: Request): Promise<Response> {
  if (resolvedCustomTools === null) resolvedCustomTools = await customToolsPromise;
  if (resolvedProxyTools === null) resolvedProxyTools = await proxyToolsPromise;
  if (resolvedSkills === null) resolvedSkills = await skillsPromise;

  // Auto-discover proxy tools if using fallback (DB is empty)
  if (resolvedProxyTools.fallbackIntegrationIds.size > 0 && !proxyDiscoveryCooldownUntil) {
    proxyDiscoveryCooldownUntil = Date.now() + 5 * 60 * 1000;
    for (const proxy of allProxyIntegrations) {
      if (proxy.oauth) continue;
      if (proxy.keyMode === "org") continue;
      discoverAndCacheProxyTools(proxy.id, proxy.serverUrl)
        .then(() => loadProxyTools().then((result) => { resolvedProxyTools = result; }))
        .catch(() => {});
    }
  } else if (proxyDiscoveryCooldownUntil && Date.now() > proxyDiscoveryCooldownUntil) {
    proxyDiscoveryCooldownUntil = null;
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = new McpServer(
    { name: "switchboard", version: "1.0.0" },
    {
      capabilities: { prompts: {} },
      instructions: `Switchboard is your persistent workspace. It connects you to integrations and provides:

- **Files & Memory**: A versioned file system for documents and persistent memory.
- **Skills**: Reusable prompt templates (manage_skills).
- **Vault**: Encrypted secrets storage. Share with teammates, teams, or the org.

## Memory Conventions

You have a durable memory system. Follow these conventions:

### MEMORY.md — Your Core Memory
- \`/memories/MEMORY.md\` is your central memory file. It holds user preferences, project conventions, key decisions, and important learnings.
- **Read it at the start of every conversation** using recall_memories (with no query) — this loads MEMORY.md plus recent daily logs automatically.
- When you learn something important, use save_memory with key "MEMORY" to update it. Read it first, add the new info under the right section, write it back.
- Keep it organized with clear markdown headings. Remove outdated entries.
- If it doesn't exist yet, create it with sections: User Preferences, Project Context, Key Decisions, Workflow Patterns.

### Daily Logs — Activity Journal
- Use save_memory with key "daily/YYYY-MM-DD" to write daily notes (e.g. key: "daily/2026-03-06").
- Daily logs are append-only — read the existing content first, append new entries at the end.
- Use them for: task progress, conversation summaries, decisions made, follow-ups.

### When to Write Memory
- Proactively save to MEMORY.md when you learn preferences, patterns, or decisions worth keeping.
- Before ending a long conversation, write a summary to today's daily log.
- Use recall_memories with a query to search across all memory files when needed.`,
    },
  );

  registerIntegrationTools(server, toolMeta, {
    resolvedCustomTools: resolvedCustomTools as IntegrationToolsCtx["resolvedCustomTools"],
    resolvedProxyTools: resolvedProxyTools,
    discoveredIntegrations,
    onProxyToolsReload: (r) => { resolvedProxyTools = r; },
  });
  registerSkillTools(server, toolMeta, resolvedSkills);
  registerAdminTools(server, toolMeta);
  registerVaultTools(server, toolMeta);
  registerFileTools(server, toolMeta);
  registerMemoryTools(server, toolMeta);
  buildAndRegisterDiscovery(server);

  await server.connect(transport);

  const authInfo = (req as Request & { auth?: unknown }).auth as
    | import("@modelcontextprotocol/sdk/server/auth/types.js").AuthInfo
    | undefined;

  return transport.handleRequest(req, { authInfo });
}

// Type alias for the context shape used by registerIntegrationTools
type IntegrationToolsCtx = Parameters<typeof registerIntegrationTools>[2];

// ── Auth wrapper ──

const authedHandler = withMcpAuth(
  mcpHandler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;

    const keyHash = hashApiKey(bearerToken);
    const { data: apiKey } = await supabaseAdmin
      .from("api_keys")
      .select("user_id, id, organization_id, scope, expires_at, permissions")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .single();

    if (!apiKey) return undefined;

    const keyExpired = apiKey.expires_at
      ? new Date(apiKey.expires_at) < new Date()
      : false;

    const organizationId = apiKey.organization_id;

    const rl = checkRateLimit(`mcp:org:${organizationId}`, 120, 60_000);
    if (!rl.allowed) return undefined;

    supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id)
      .then();

    const [
      { data: profile },
      { data: accessRows },
      { data: rawConnections },
      { data: rawUserKeys },
      { data: rawOrgKeys },
      { data: rawProxyUserKeys },
      { data: teamMemberships },
      rawScopes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("status, permissions_mode, organization_id, org_role, role, discovery_mode").eq("id", apiKey.user_id).single(),
      supabaseAdmin.from("user_integration_access").select("integration_id, allowed_tools").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("connections").select("id, integration_id, access_token, refresh_token, expires_at, sender_name").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("custom_mcp_user_keys").select("server_id, api_key, custom_headers").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("integration_org_keys").select("integration_id, api_key").eq("organization_id", organizationId).eq("enabled", true),
      supabaseAdmin.from("proxy_user_keys").select("integration_id, api_key").eq("user_id", apiKey.user_id),
      supabaseAdmin.from("team_members").select("team_id").eq("user_id", apiKey.user_id),
      loadIntegrationScopes(organizationId),
    ]);

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
    const customMcpHeaders: Record<string, Record<string, string>> = {};
    for (const k of rawUserKeys ?? []) {
      if (k.api_key) customMcpKeys[k.server_id] = decrypt(k.api_key);
      if (k.custom_headers && typeof k.custom_headers === "object") {
        const hdrs: Record<string, string> = {};
        for (const [hk, hv] of Object.entries(k.custom_headers as Record<string, string>)) {
          hdrs[hk] = decrypt(hv);
        }
        customMcpHeaders[k.server_id] = hdrs;
      }
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

    const integrationScopes = rawScopes;

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
        customMcpHeaders,
        integrationOrgKeys,
        proxyUserKeys,
        teamIds,
        orgRole: profile.org_role ?? "member",
        role: profile.role ?? "user",
        apiKeyScope: apiKey.scope ?? "full",
        apiKeyPermissions: apiKey.permissions ?? null,
        discoveryMode: profile.discovery_mode ?? false,
        keyExpired,
        integrationScopes,
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
