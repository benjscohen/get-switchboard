import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/auth-cache";
import { AuditLog } from "@/components/settings/audit-log";

export default async function AuditLogPage() {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  const isOrgAdmin =
    auth.profile?.org_role === "owner" || auth.profile?.org_role === "admin";
  const isSuperAdmin = auth.profile?.role === "admin";

  if (!isOrgAdmin && !isSuperAdmin) redirect("/settings");

  return <AuditLog />;
}
