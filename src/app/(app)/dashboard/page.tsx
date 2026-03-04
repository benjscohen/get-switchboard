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
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string; user_id: string; revoked_at: string | null }> }),
    supabaseAdmin.from("proxy_user_keys").select("integration_id").eq("user_id", user.id),
  ]);

  const orgKeys = orgKeysData ?? [];

  // Build API key entries with creator info
  const rawKeys = apiKeys ?? [];
  const creatorIds = [...new Set(rawKeys.map((k) => k.user_id))];
  const profileMap = new Map<string, { name: string | null; email: string | null }>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .in("id", creatorIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { name: p.name, email: p.email });
    }
  }
  const initialKeys = rawKeys.map((k) => {
    const creator = profileMap.get(k.user_id) ?? null;
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
      createdBy: creator?.name ?? creator?.email ?? null,
      isOwn: k.user_id === user.id,
      revokedAt: k.revoked_at,
    };
  });

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

  const orgProxies = allProxyIntegrations.filter((p) => p.keyMode === "org");
  const perUserProxies = allProxyIntegrations.filter((p) => p.keyMode === "per_user");

  const proxyIntegrations = orgProxies.map((p) => ({
    id: `proxy:${p.id}`,
    name: p.name,
    description: p.description,
    icon: p.icon(),
    toolCount: p.toolCount,
    tools: p.tools.map((t) => ({ name: t.name, description: t.description })),
    connected: orgKeyMap.get(p.id) === true,
    kind: "native-proxy" as const,
  }));

  const perUserProxyIntegrations = perUserProxies.map((p) => ({
    integrationId: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon(),
    toolCount: p.toolCount,
    tools: p.tools.map((t) => ({ name: t.name, description: t.description })),
    hasPersonalKey: proxyUserKeySet.has(p.id),
    userKeyInstructions: p.userKeyInstructions ?? null,
  }));

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <Container className="py-10">
      <DashboardToasts />
      <h1 className="mb-8 text-2xl font-bold">Dashboard</h1>
      <div className="space-y-6">
        <IntegrationList
          initialIntegrations={integrations}
          proxyIntegrations={proxyIntegrations}
          perUserProxyIntegrations={perUserProxyIntegrations}
          initialCustomIntegrations={customIntegrations}
        />
        <ConnectCard origin={origin} initialKeys={initialKeys} />
      </div>
    </Container>
  );
}
