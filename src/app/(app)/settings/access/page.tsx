import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/auth-cache";
import { IntegrationAccessScopes } from "@/components/admin/integration-access-scopes";

export default async function SettingsAccessPage() {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  const isOrgAdmin =
    auth.profile?.org_role === "owner" || auth.profile?.org_role === "admin";
  if (!isOrgAdmin) redirect("/settings");

  return <IntegrationAccessScopes />;
}
