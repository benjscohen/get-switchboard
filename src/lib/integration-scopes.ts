import { supabaseAdmin } from "@/lib/supabase/admin";

export type IntegrationScopeMap = Record<string, Set<string>>;

export async function loadIntegrationScopes(
  organizationId: string
): Promise<IntegrationScopeMap> {
  const { data } = await supabaseAdmin
    .from("integration_access_scopes")
    .select("integration_id, integration_scope_users(user_id)")
    .eq("organization_id", organizationId);

  const scopes: IntegrationScopeMap = {};
  for (const scope of data ?? []) {
    const users = (scope.integration_scope_users ?? []) as Array<{
      user_id: string;
    }>;
    scopes[scope.integration_id] = new Set(users.map((u) => u.user_id));
  }
  return scopes;
}
