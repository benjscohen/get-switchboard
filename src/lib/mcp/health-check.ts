import { supabaseAdmin } from "@/lib/supabase/admin";
import { discoverTools, type ProxyAuth } from "@/lib/mcp/proxy-client";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { decrypt } from "@/lib/encryption";

// ── Types ──

type ServerCheckResult = {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "unreachable" | "skipped";
  serverUrl: string;
  previousToolCount: number;
  currentToolCount: number;
  toolsAdded: string[];
  toolsRemoved: string[];
  toolsSchemaChanged: string[];
  error: string | null;
  lastDiscoveredAt: string | null;
  discoveryDurationMs: number | null;
  skipReason?: string;
};

type IntegrationUsage = {
  integrationId: string;
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  topErrors: Array<{ message: string; count: number }>;
};

type UsageAnalysis = {
  period: string;
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  integrationBreakdown: IntegrationUsage[];
};

type HealthCheckReport = {
  checkedAt: string;
  summary: { totalServers: number; healthy: number; degraded: number; unreachable: number; skipped: number };
  proxyIntegrations: ServerCheckResult[];
  customServers: ServerCheckResult[];
  usageAnalysis: UsageAnalysis | null;
};

type HealthCheckOpts = {
  scope: "proxy" | "custom" | "all";
  include_usage_analysis: boolean;
  days: number;
  organizationId: string;
};

// ── Helpers ──

type DiscoveredTool = { name: string; description: string; inputSchema: Record<string, unknown> };

function compareTools(
  cached: Array<{ tool_name: string; input_schema: Record<string, unknown> }>,
  discovered: DiscoveredTool[],
): { added: string[]; removed: string[]; schemaChanged: string[] } {
  const cachedMap = new Map(cached.map((t) => [t.tool_name, t.input_schema]));
  const discoveredMap = new Map(discovered.map((t) => [t.name, t.inputSchema]));

  const added: string[] = [];
  const removed: string[] = [];
  const schemaChanged: string[] = [];

  for (const name of discoveredMap.keys()) {
    if (!cachedMap.has(name)) {
      added.push(name);
    } else if (JSON.stringify(cachedMap.get(name)) !== JSON.stringify(discoveredMap.get(name))) {
      schemaChanged.push(name);
    }
  }
  for (const name of cachedMap.keys()) {
    if (!discoveredMap.has(name)) removed.push(name);
  }

  return { added, removed, schemaChanged };
}

function resultStatus(diff: { added: string[]; removed: string[]; schemaChanged: string[] }): "healthy" | "degraded" {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.schemaChanged.length > 0 ? "degraded" : "healthy";
}

// ── Proxy integration checks ──

async function checkProxyIntegrations(organizationId: string): Promise<ServerCheckResult[]> {
  // Load org keys for org-keyed integrations
  const { data: orgKeys } = await supabaseAdmin
    .from("integration_org_keys")
    .select("integration_id, api_key, enabled")
    .eq("organization_id", organizationId);

  const orgKeyMap = new Map(
    (orgKeys ?? []).map((k) => [k.integration_id, { apiKey: k.api_key, enabled: k.enabled }]),
  );

  const results: ServerCheckResult[] = [];

  for (const integration of allProxyIntegrations) {
    // Skip per_user / OAuth integrations — we can't authenticate
    if (integration.keyMode === "per_user" || integration.oauth) {
      results.push({
        id: integration.id, name: integration.name, status: "skipped",
        serverUrl: integration.serverUrl,
        previousToolCount: 0, currentToolCount: 0,
        toolsAdded: [], toolsRemoved: [], toolsSchemaChanged: [],
        error: null, lastDiscoveredAt: null, discoveryDurationMs: null,
        skipReason: integration.oauth ? "Requires per-user OAuth" : "Requires per-user API key",
      });
      continue;
    }

    // Resolve auth for org-keyed integrations
    let auth: ProxyAuth;
    const orgKey = orgKeyMap.get(integration.id);
    if (orgKey?.apiKey) {
      auth = decrypt(orgKey.apiKey);
    }
    // Some integrations (like Context7) work without auth — attempt anyway

    // Load cached tools
    const { data: cachedTools } = await supabaseAdmin
      .from("proxy_integration_tools")
      .select("tool_name, input_schema")
      .eq("integration_id", integration.id);

    const start = Date.now();
    try {
      const discovered = await discoverTools(integration.serverUrl, auth);
      const durationMs = Date.now() - start;

      const diff = compareTools(
        (cachedTools ?? []).map((t) => ({ tool_name: t.tool_name, input_schema: (t.input_schema ?? {}) as Record<string, unknown> })),
        discovered,
      );

      results.push({
        id: integration.id, name: integration.name, status: resultStatus(diff),
        serverUrl: integration.serverUrl,
        previousToolCount: cachedTools?.length ?? 0,
        currentToolCount: discovered.length,
        toolsAdded: diff.added, toolsRemoved: diff.removed, toolsSchemaChanged: diff.schemaChanged,
        error: null, lastDiscoveredAt: new Date().toISOString(), discoveryDurationMs: durationMs,
      });
    } catch (e) {
      results.push({
        id: integration.id, name: integration.name, status: "unreachable",
        serverUrl: integration.serverUrl,
        previousToolCount: cachedTools?.length ?? 0, currentToolCount: 0,
        toolsAdded: [], toolsRemoved: [], toolsSchemaChanged: [],
        error: e instanceof Error ? e.message : String(e),
        lastDiscoveredAt: null, discoveryDurationMs: Date.now() - start,
      });
    }
  }

  return results;
}

// ── Custom MCP server checks ──

async function checkCustomServers(organizationId: string): Promise<ServerCheckResult[]> {
  const { data: servers } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id, name, server_url, auth_type, shared_api_key, key_mode, custom_headers, last_discovered_at, custom_mcp_tools(tool_name, input_schema)")
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);

  if (!servers?.length) return [];

  const results: ServerCheckResult[] = [];

  for (const srv of servers) {
    // Skip per_user servers with no shared key
    if (srv.key_mode === "per_user" && !srv.shared_api_key) {
      results.push({
        id: srv.id, name: srv.name, status: "skipped",
        serverUrl: srv.server_url,
        previousToolCount: 0, currentToolCount: 0,
        toolsAdded: [], toolsRemoved: [], toolsSchemaChanged: [],
        error: null, lastDiscoveredAt: srv.last_discovered_at, discoveryDurationMs: null,
        skipReason: "Requires per-user API key (no shared key configured)",
      });
      continue;
    }

    // Resolve auth
    let auth: ProxyAuth;
    if (srv.auth_type === "custom_headers") {
      const headers: Record<string, string> = {};
      const customHeaders = srv.custom_headers as Array<{ key: string; value?: string }> | null;
      if (Array.isArray(customHeaders)) {
        let incomplete = false;
        for (const h of customHeaders) {
          if (h.key && h.value) {
            headers[h.key] = decrypt(h.value);
          } else {
            incomplete = true;
          }
        }
        if (incomplete) {
          results.push({
            id: srv.id, name: srv.name, status: "skipped",
            serverUrl: srv.server_url,
            previousToolCount: 0, currentToolCount: 0,
            toolsAdded: [], toolsRemoved: [], toolsSchemaChanged: [],
            error: null, lastDiscoveredAt: srv.last_discovered_at, discoveryDurationMs: null,
            skipReason: "Custom headers incomplete — missing values",
          });
          continue;
        }
      }
      if (Object.keys(headers).length > 0) {
        auth = { headers };
      }
    } else if (srv.shared_api_key) {
      auth = decrypt(srv.shared_api_key);
    }

    // Load cached tools
    const cachedTools = (srv.custom_mcp_tools ?? []) as Array<{ tool_name: string; input_schema: Record<string, unknown> }>;

    const start = Date.now();
    try {
      const discovered = await discoverTools(srv.server_url, auth);
      const durationMs = Date.now() - start;

      const diff = compareTools(
        cachedTools.map((t) => ({ tool_name: t.tool_name, input_schema: (t.input_schema ?? {}) as Record<string, unknown> })),
        discovered,
      );

      results.push({
        id: srv.id, name: srv.name, status: resultStatus(diff),
        serverUrl: srv.server_url,
        previousToolCount: cachedTools.length, currentToolCount: discovered.length,
        toolsAdded: diff.added, toolsRemoved: diff.removed, toolsSchemaChanged: diff.schemaChanged,
        error: null, lastDiscoveredAt: new Date().toISOString(), discoveryDurationMs: durationMs,
      });
    } catch (e) {
      results.push({
        id: srv.id, name: srv.name, status: "unreachable",
        serverUrl: srv.server_url,
        previousToolCount: cachedTools.length, currentToolCount: 0,
        toolsAdded: [], toolsRemoved: [], toolsSchemaChanged: [],
        error: e instanceof Error ? e.message : String(e),
        lastDiscoveredAt: srv.last_discovered_at, discoveryDurationMs: Date.now() - start,
      });
    }
  }

  return results;
}

// ── Usage analysis ──

async function analyzeUsage(organizationId: string, days: number): Promise<UsageAnalysis> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabaseAdmin
    .from("usage_logs")
    .select("integration_id, status, error_message")
    .eq("organization_id", organizationId)
    .gte("created_at", since);

  const rows = logs ?? [];
  const totalCalls = rows.length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  // Group by integration
  const byIntegration = new Map<string, { total: number; errors: number; errorMessages: string[] }>();
  for (const row of rows) {
    const id = row.integration_id ?? "unknown";
    const entry = byIntegration.get(id) ?? { total: 0, errors: 0, errorMessages: [] };
    entry.total++;
    if (row.status === "error") {
      entry.errors++;
      if (row.error_message) entry.errorMessages.push(row.error_message);
    }
    byIntegration.set(id, entry);
  }

  const integrationBreakdown: IntegrationUsage[] = [];
  for (const [integrationId, stats] of byIntegration) {
    // Compute top errors
    const errorCounts = new Map<string, number>();
    for (const msg of stats.errorMessages) {
      errorCounts.set(msg, (errorCounts.get(msg) ?? 0) + 1);
    }
    const topErrors = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));

    integrationBreakdown.push({
      integrationId,
      totalCalls: stats.total,
      errorCount: stats.errors,
      errorRate: stats.total > 0 ? stats.errors / stats.total : 0,
      topErrors,
    });
  }

  // Sort: highest error rate first, then by volume
  integrationBreakdown.sort((a, b) => b.errorRate - a.errorRate || b.totalCalls - a.totalCalls);

  return {
    period: `${days}d`,
    totalCalls,
    errorCount,
    errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
    integrationBreakdown,
  };
}

// ── Main entry point ──

export async function runHealthCheck(opts: HealthCheckOpts): Promise<HealthCheckReport> {
  const { scope, include_usage_analysis, days, organizationId } = opts;

  const proxyResults = scope === "custom" ? [] : await checkProxyIntegrations(organizationId);
  const customResults = scope === "proxy" ? [] : await checkCustomServers(organizationId);

  const all = [...proxyResults, ...customResults];
  const summary = {
    totalServers: all.length,
    healthy: all.filter((r) => r.status === "healthy").length,
    degraded: all.filter((r) => r.status === "degraded").length,
    unreachable: all.filter((r) => r.status === "unreachable").length,
    skipped: all.filter((r) => r.status === "skipped").length,
  };

  const usageAnalysis = include_usage_analysis ? await analyzeUsage(organizationId, days) : null;

  return {
    checkedAt: new Date().toISOString(),
    summary,
    proxyIntegrations: proxyResults,
    customServers: customResults,
    usageAnalysis,
  };
}
