import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthProfile } from "@/lib/auth-cache";
import { UsersTable } from "@/components/settings/users-table";

export default async function SettingsUsersPage() {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  if (auth.profile?.role !== "admin") redirect("/dashboard");

  const { data: users } = await supabaseAdmin.rpc("get_admin_users");

  const mapped = (users ?? []).map((u: Record<string, unknown>) => ({
    id: u.id as string,
    name: (u.name as string | null) ?? null,
    email: (u.email as string | null) ?? null,
    image: (u.image as string | null) ?? null,
    role: (u.role as string) ?? "user",
    status: (u.status as string) ?? "active",
    permissionsMode: (u.permissions_mode as string) ?? "full",
    organizationId: (u.organization_id as string | null) ?? null,
    orgRole: (u.org_role as string | null) ?? null,
    orgName: (u.org_name as string | null) ?? null,
    apiKeyCount: (u.api_key_count as number) ?? 0,
    connectionCount: (u.connection_count as number) ?? 0,
    requestCount: (u.request_count as number) ?? 0,
    lastActive: (u.last_active as string | null) ?? null,
  }));

  return <UsersTable initialUsers={mapped} />;
}
