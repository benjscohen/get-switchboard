import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Container } from "@/components/ui/container";
import { IntegrationList, type UserKeyItem } from "@/components/dashboard/integration-list";
import { ConnectCard } from "@/components/dashboard/connect-card";
import { AgentTokenCard } from "@/components/dashboard/agent-token-card";
import { DashboardToasts } from "@/components/dashboard/dashboard-toasts";
import { DiscoveryModeToggle } from "@/components/dashboard/discovery-mode-toggle";
import { allIntegrations, isIntegrationConfigured } from "@/lib/integrations/registry";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { loadProxyToolsByIntegration } from "@/lib/integrations/catalog";
import { chromeMcpIntegration } from "@/lib/integrations/chrome-mcp";
import { loadIntegrationScopes } from "@/lib/integration-scopes";
import { isUserInScope } from "@/lib/permissions";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Phase 1: profile + connections in parallel (no orgId dependency)
  const [{ data: profile }, { data: connections }] = await Promise.all([
    supabase.from("profiles").select("organization_id, role, org_role, discovery_mode, preferred_agent_model").eq("id", user.id).single(),
    supabase.from("connections").select("integration_id").eq("user_id", user.id),
  ]);

  const orgId = profile?.organization_id;

  const connectedIds = new Set(
    (connections ?? []).map((c) => c.integration_id)
  );

  // builtinIntegrations is built after Phase 2 (needs orgKeyConfiguredIds)

  // Load custom MCP servers filtered by org (global + org-specific)
  let customServersQuery = supabaseAdmin
    .from("custom_mcp_servers")
    .select("id, name, slug, description, auth_type, shared_api_key, key_mode, user_key_instructions, organization_id, custom_headers, custom_mcp_tools(tool_name, description, enabled)")
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
    integrationScopes,
  ] = await Promise.all([
    customServersQuery,
    supabaseAdmin.from("custom_mcp_user_keys").select("server_id").eq("user_id", user.id),
    orgId
      ? supabaseAdmin.from("integration_org_keys").select("integration_id, enabled").eq("organization_id", orgId)
      : Promise.resolve({ data: [] as Array<{ integration_id: string; enabled: boolean }> }),
    orgId
      ? supabaseAdmin
          .from("api_keys")
          .select("id, name, key_prefix, last_used_at, created_at, user_id, revoked_at, scope, expires_at, permissions, is_agent_key")
          .eq("organization_id", orgId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string; user_id: string; revoked_at: string | null; scope: string; expires_at: string }> }),
    supabaseAdmin.from("proxy_user_keys").select("integration_id").eq("user_id", user.id),
    orgId
      ? loadIntegrationScopes(orgId)
      : Promise.resolve({} as Record<string, Set<string>>),
  ]);

  const orgKeys = orgKeysData ?? [];

  // Filter out org-key-required integrations that haven't been configured
  const orgKeyIntegrationIds = new Set(
    allIntegrations.filter((i) => i.orgKeyRequired).map((i) => i.id)
  );
  const orgKeyConfiguredIds = new Set(
    orgKeys
      .filter((k) => orgKeyIntegrationIds.has(k.integration_id) && k.enabled)
      .map((k) => k.integration_id)
  );

  const orgRole = profile?.org_role as string | undefined;

  const builtinIntegrations = allIntegrations
    .filter((i) => isIntegrationConfigured(i) && (!i.orgKeyRequired || orgKeyConfiguredIds.has(i.id)))
    .filter((i) => isUserInScope(integrationScopes, user.id, orgRole, i.id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      icon: i.icon(),
      toolCount: i.toolCount,
      tools: i.tools.map((t) => ({ name: t.name, description: t.description })),
      connected: connectedIds.has(i.id),
      kind: "builtin" as const,
    }));

  const initialKeys = (apiKeys ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
    revokedAt: k.revoked_at,
    scope: (k as { scope?: string }).scope ?? "full",
    expiresAt: (k as { expires_at?: string }).expires_at ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    permissions: (k as { permissions?: Record<string, string[] | null> | null }).permissions ?? null,
    isAgentKey: (k as { is_agent_key?: boolean }).is_agent_key ?? false,
  }));

  const now = new Date();
  const agentKey = initialKeys.find(
    (k) => k.isAgentKey && !k.revokedAt && new Date(k.expiresAt) > now
  ) ?? null;
  const personalKeys = initialKeys.filter((k) => !k.isAgentKey);

  const preferredAgentModel = profile?.preferred_agent_model ?? "claude-sonnet-4-6";

  const userKeySet = new Set((userKeys ?? []).map((k) => k.server_id));

  const customMcpUserKeys: UserKeyItem[] = (customServers ?? [])
    .filter((s) => isUserInScope(integrationScopes, user.id, orgRole, `custom:${s.id}`))
    .map((s) => {
    const enabledTools = (s.custom_mcp_tools ?? []).filter(
      (t: { enabled: boolean }) => t.enabled
    );
    return {
      type: "custom-mcp" as const,
      targetId: s.id,
      name: s.name,
      description: s.description,
      icon: null,
      toolCount: enabledTools.length,
      tools: enabledTools.map((t: { tool_name: string; description: string }) => ({
        name: `${s.slug}__${t.tool_name}`,
        description: t.description,
      })),
      hasPersonalKey: userKeySet.has(s.id),
      userKeyInstructions: (s.user_key_instructions as string | null) ?? null,
      keyMode: (s.key_mode as "shared" | "per_user") ?? "shared",
      hasSharedKey: !!s.shared_api_key || (
        s.auth_type === "custom_headers"
        && Array.isArray(s.custom_headers)
        && (s.custom_headers as Array<{ key: string; value?: string }>).length > 0
        && (s.custom_headers as Array<{ key: string; value?: string }>).every((h) => !!h.value)
      ),
      authType: s.auth_type,
      headerKeys: s.auth_type === "custom_headers" && Array.isArray(s.custom_headers)
        ? (s.custom_headers as Array<{ key: string }>).map((h) => h.key)
        : undefined,
    };
  });

  const orgKeyMap = new Map(
    orgKeys.map((k) => [k.integration_id, k.enabled])
  );

  const proxyUserKeySet = new Set(
    (proxyUserKeysData ?? []).map((k) => k.integration_id)
  );

  // Load proxy tools from DB (with fallback to config)
  const proxyToolsByIntegration = await loadProxyToolsByIntegration();

  function getProxyToolsForIntegration(p: typeof allProxyIntegrations[number]) {
    const dbTools = proxyToolsByIntegration.get(p.id);
    const fallbackCount = p.fallbackTools?.length ?? 0;
    if (dbTools && dbTools.length >= fallbackCount) return dbTools;
    return (p.fallbackTools ?? []).map((t) => ({ name: t.name, description: t.description }));
  }

  const orgProxies = allProxyIntegrations.filter(
    (p) => !p.oauth && p.keyMode === "org" && orgKeyMap.get(p.id) === true
      && isUserInScope(integrationScopes, user.id, orgRole, `proxy:${p.id}`)
  );
  const perUserProxies = allProxyIntegrations.filter(
    (p) => !p.oauth && p.keyMode === "per_user"
      && isUserInScope(integrationScopes, user.id, orgRole, `proxy:${p.id}`)
  );
  const oauthProxies = allProxyIntegrations.filter(
    (p) => !!p.oauth
      && isUserInScope(integrationScopes, user.id, orgRole, `proxy:${p.id}`)
  );

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

  // OAuth proxy integrations show Connect/Disconnect like builtins
  const oauthProxyIntegrations = oauthProxies.map((p) => {
    const tools = getProxyToolsForIntegration(p);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon(),
      toolCount: tools.length,
      tools,
      connected: connectedIds.has(p.id),
      kind: "builtin" as const,
    };
  });

  // Build Switchboard platform integration
  const platformTools: Array<{ name: string; description: string }> = [
    { name: "submit_feedback", description: "Submit feedback to the Switchboard team" },
    { name: "manage_skills", description: "List, get, create, update, or delete skills" },
    { name: "manage_agents", description: "List, get, create, update, or delete agent definitions" },
    { name: "vault_list_secrets", description: "List vault secrets" },
    { name: "vault_get_secret", description: "Get a secret with decrypted values" },
    { name: "vault_set_secret", description: "Create or update a secret" },
    { name: "vault_delete_secret", description: "Delete a secret" },
    { name: "vault_search_secrets", description: "Search secrets" },
  ];

  const isOrgAdmin = profile?.org_role === "owner" || profile?.org_role === "admin";
  const isSuperAdmin = profile?.role === "admin";

  const orgAdminTools: Array<{ name: string; description: string }> = [
    { name: "admin_teams", description: "Manage teams" },
    { name: "admin_team_members", description: "Manage team membership" },
    { name: "admin_org", description: "View/update organization" },
    { name: "admin_org_members", description: "List org members" },
    { name: "admin_org_domains", description: "Manage org domains" },
    { name: "admin_org_integrations", description: "Manage org integrations" },
  ];

  const superAdminTools: Array<{ name: string; description: string }> = [
    { name: "admin_users", description: "Manage platform users" },
    { name: "admin_user_permissions", description: "View/set user permissions" },
    { name: "admin_usage", description: "View usage stats and logs" },
    { name: "admin_mcp_servers", description: "Manage global MCP servers" },
  ];

  const switchboardTools = [
    ...platformTools,
    ...(isOrgAdmin ? orgAdminTools : []),
    ...(isSuperAdmin ? superAdminTools : []),
  ];

  const switchboardIntegration = {
    id: "platform",
    name: "Switchboard",
    description: "Platform tools, skills, and admin management",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" fill="#3B82F6" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" fill="#3B82F6" opacity="0.7" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" fill="#3B82F6" opacity="0.7" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" fill="#3B82F6" opacity="0.4" />
      </svg>
    ) as React.ReactNode,
    toolCount: switchboardTools.length,
    tools: switchboardTools,
    connected: true,
    kind: "builtin" as const,
  };

  // Merge builtin + OAuth proxy integrations for the UI
  const integrations = [switchboardIntegration, ...builtinIntegrations, ...oauthProxyIntegrations];

  const proxyUserKeys: UserKeyItem[] = perUserProxies.map((p) => {
    const tools = getProxyToolsForIntegration(p);
    return {
      type: "proxy" as const,
      targetId: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon(),
      toolCount: tools.length,
      tools,
      hasPersonalKey: proxyUserKeySet.has(p.id),
      userKeyInstructions: p.userKeyInstructions ?? null,
      headerKeys: p.headerKeys,
    };
  });

  const userKeyIntegrations = [...proxyUserKeys, ...customMcpUserKeys];

  const availableIntegrations = [
    ...builtinIntegrations.map((i) => ({ id: i.id, name: i.name, tools: i.tools })),
    ...proxyIntegrations.map((i) => ({ id: i.id, name: i.name, tools: i.tools })),
    ...oauthProxyIntegrations.map((i) => ({ id: i.id, name: i.name, tools: i.tools })),
    ...customMcpUserKeys.map((i) => ({
      id: i.targetId.startsWith("custom:") ? i.targetId : `custom:${i.targetId}`,
      name: i.name,
      tools: i.tools,
    })),
  ];

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <Container className="py-10">
      <DashboardToasts />
      <h1 className="mb-8 text-2xl font-bold">MCP</h1>
      <div className="space-y-6">
        <ConnectCard
          origin={origin}
          initialKeys={personalKeys}
          availableIntegrations={availableIntegrations}
          connectionStats={{
            connected: integrations.filter(i => i.connected).length
              + proxyIntegrations.filter(i => i.connected).length
              + userKeyIntegrations.filter(i => {
                if (i.hasPersonalKey) return true;
                if (i.type === "proxy") return false;
                if (i.keyMode === "per_user") return false;
                if (i.hasSharedKey) return true;
                if (i.authType === "bearer" || i.authType === "custom_headers") return false;
                return true;
              }).length,
            total: integrations.length + proxyIntegrations.length + userKeyIntegrations.length,
          }}
        />
        <AgentTokenCard
          initialAgentKey={agentKey ? {
            id: agentKey.id,
            keyPrefix: agentKey.keyPrefix,
            createdAt: agentKey.createdAt,
            expiresAt: agentKey.expiresAt,
            permissions: agentKey.permissions ?? null,
          } : null}
          preferredAgentModel={preferredAgentModel}
          availableIntegrations={availableIntegrations}
        />
        <DiscoveryModeToggle initialValue={profile?.discovery_mode ?? false} />
        <IntegrationList
          initialIntegrations={integrations}
          proxyIntegrations={proxyIntegrations}
          userKeyIntegrations={userKeyIntegrations}
          localIntegrations={[
            {
              id: chromeMcpIntegration.id,
              name: chromeMcpIntegration.name,
              description: chromeMcpIntegration.description,
              icon: chromeMcpIntegration.icon(),
              toolCount: chromeMcpIntegration.tools.length,
              tools: chromeMcpIntegration.tools,
              setupInstructions: chromeMcpIntegration.setupInstructions,
            },
          ]}
          subtitle="Connect services to make their tools available through your MCP client."
        />
      </div>
    </Container>
  );
}
