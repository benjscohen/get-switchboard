import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Container } from "@/components/ui/container";
import { IntegrationList } from "@/components/dashboard/integration-list";
import { ConnectCard } from "@/components/dashboard/connect-card";
import { allIntegrations } from "@/lib/integrations/registry";
import { headers } from "next/headers";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = profile?.organization_id;

  const { data: connections } = await supabase
    .from("connections")
    .select("integration_id")
    .eq("user_id", user.id);

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

  const { data: customServers } = await customServersQuery;

  const { data: userKeys } = await supabaseAdmin
    .from("custom_mcp_user_keys")
    .select("server_id")
    .eq("user_id", user.id);

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

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <Container className="py-10">
      <h1 className="mb-8 text-2xl font-bold">Dashboard</h1>
      <div className="space-y-6">
        <IntegrationList
          integrations={integrations}
          customIntegrations={customIntegrations}
        />
        <ConnectCard origin={origin} />
      </div>
    </Container>
  );
}
