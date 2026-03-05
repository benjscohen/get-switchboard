import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/auth-cache";
import { IntegrationsCard } from "@/components/app/integrations-card";
import { CustomMcpServers } from "@/components/admin/custom-mcp-servers";

export default async function SettingsMcpServersPage() {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  const isSuperAdmin = auth.profile?.role === "admin";

  return (
    <div className="space-y-6">
      <IntegrationsCard />
      {isSuperAdmin && <CustomMcpServers />}
    </div>
  );
}
