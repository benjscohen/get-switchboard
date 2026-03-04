import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Container } from "@/components/ui/container";
import { IntegrationList } from "@/components/dashboard/integration-list";
import { ConnectCard } from "@/components/dashboard/connect-card";
import { DashboardToasts } from "@/components/dashboard/dashboard-toasts";
import { allIntegrations } from "@/lib/integrations/registry";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Phase 1: profile + connections in parallel (no orgId dependency)
  const [{ data: profile }, { data: connections }] = await Promise.all([
    supabase.from("profiles").select("organization_id").eq("id", user.id).single(),
    supabase.from("connections").select("integration_id").eq("user_id", user.id),
  ]);

  const orgId = profile?.organization_id;

  const connectedIds = new Set(
    (connections ?? []).map((c) => c.integration_id)
  );

  const integrations = allIntegrations.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    icon: i.icon(),
    toolCount: i.toolCount,
    tools: i.tools.map((t) => ({ name: t.name, description: t.description })),
    connected: connectedIds.has(i.id),
    kind: "builtin" as const,
  }));

  // Load custom MCP servers filtered by org (global + org-specific)
  let customServersQuery = supabaseAdmin
    .from("custom_mcp_servers")
    .select("id, name, slug, description, auth_type, shared_api_key, key_mode, user_key_instructions, organization_id, custom_mcp_tools(tool_name, description, enabled)")
    .eq("status", "active");

  if (orgId) {
    customServersQuery = customServersQuery.or(
      `organization_id.is.null,organization_id.eq.${orgId}`
    );
  } else {
    customServersQuery = customServersQuery.is("organization_id", null);
  }

  // Phase 2: orgId-dependent queries in parallel
  const [
    { data: customServers },
    { data: userKeys },
    { data: orgKeysData },
    { data: apiKeys },
    { data: proxyUserKeysData },
  ] = await Promise.all([
    customServersQuery,
    supabaseAdmin.from("custom_mcp_user_keys").select("server_id").eq("user_id", user.id),
    orgId
      ? supabaseAdmin.from("integration_org_keys").select("integration_id, enabled").eq("organization_id", orgId)
      : Promise.resolve({ data: [] as Array<{ integration_id: string; enabled: boolean }> }),
    orgId
      ? supabaseAdmin
          .from("api_keys")
          .select("id, name, key_prefix, last_used_at, created_at, user_id, revoked_at")
          .eq("organization_id", orgId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string; user_id: string; revoked_at: string | null }> }),
    supabaseAdmin.from("proxy_user_keys").select("integration_id").eq("user_id", user.id),
  ]);

  const orgKeys = orgKeysData ?? [];

  const initialKeys = (apiKeys ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
    revokedAt: k.revoked_at,
  }));

  const userKeySet = new Set((userKeys ?? []).map((k) => k.server_id));

  const customIntegrations = (customServers ?? []).map((s) => {
    const enabledTools = (s.custom_mcp_tools ?? []).filter(
      (t: { enabled: boolean }) => t.enabled
    );
    return {
      id: `custom:${s.id}`,
      name: s.name,
      description: s.description,
      icon: null,
      toolCount: enabledTools.length,
      tools: enabledTools.map((t: { tool_name: string; description: string }) => ({
        name: `${s.slug}__${t.tool_name}`,
        description: t.description,
      })),
      connected: true,
      kind: "custom-mcp" as const,
      serverId: s.id,
      authType: s.auth_type,
      keyMode: (s.key_mode as "shared" | "per_user") ?? "shared",
      userKeyInstructions: (s.user_key_instructions as string | null) ?? null,
      hasSharedKey: !!s.shared_api_key,
      hasPersonalKey: userKeySet.has(s.id),
    };
  });

  const orgKeyMap = new Map(
    orgKeys.map((k) => [k.integration_id, k.enabled])
  );

  const proxyUserKeySet = new Set(
    (proxyUserKeysData ?? []).map((k) => k.integration_id)
  );

  // Load proxy tools from DB (with fallback to config)
  const { data: proxyToolsData } = await supabaseAdmin
    .from("proxy_integration_tools")
    .select("integration_id, tool_name, description")
    .eq("enabled", true);

  // Group proxy tools by integration_id
  const proxyToolsByIntegration = new Map<string, Array<{ name: string; description: string }>>();
  for (const t of proxyToolsData ?? []) {
    const existing = proxyToolsByIntegration.get(t.integration_id) ?? [];
    existing.push({ name: t.tool_name, description: t.description });
    proxyToolsByIntegration.set(t.integration_id, existing);
  }

  function getProxyToolsForIntegration(p: typeof allProxyIntegrations[number]) {
    const dbTools = proxyToolsByIntegration.get(p.id);
    if (dbTools && dbTools.length > 0) return dbTools;
    return (p.fallbackTools ?? []).map((t) => ({ name: t.name, description: t.description }));
  }

  const orgProxies = allProxyIntegrations.filter((p) => p.keyMode === "org");
  const perUserProxies = allProxyIntegrations.filter((p) => p.keyMode === "per_user");

  const proxyIntegrations = orgProxies.map((p) => {
    const tools = getProxyToolsForIntegration(p);
    return {
      id: `proxy:${p.id}`,
      name: p.name,
      description: p.description,
      icon: p.icon(),
      toolCount: tools.length,
      tools,
      connected: orgKeyMap.get(p.id) === true,
      kind: "native-proxy" as const,
    };
  });

  const perUserProxyIntegrations = perUserProxies.map((p) => {
    const tools = getProxyToolsForIntegration(p);
    return {
      integrationId: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon(),
      toolCount: tools.length,
      tools,
      hasPersonalKey: proxyUserKeySet.has(p.id),
      userKeyInstructions: p.userKeyInstructions ?? null,
    };
  });

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <Container className="py-10">
      <DashboardToasts />
      <h1 className="mb-8 text-2xl font-bold">Dashboard</h1>
      <div className="space-y-6">
        <ConnectCard
          origin={origin}
          initialKeys={initialKeys}
          connectionStats={{
            connected: integrations.filter(i => i.connected).length
              + perUserProxyIntegrations.filter(i => i.hasPersonalKey).length,
            total: integrations.length + perUserProxyIntegrations.length,
          }}
        />
        <IntegrationList
          initialIntegrations={integrations}
          proxyIntegrations={proxyIntegrations}
          perUserProxyIntegrations={perUserProxyIntegrations}
          initialCustomIntegrations={customIntegrations}
          subtitle="Connect services to make their tools available through your MCP client."
        />
      </div>
    </Container>
  );
}
