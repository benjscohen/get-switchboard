import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/auth-cache";
import { Container } from "@/components/ui/container";
import { SettingsNav } from "@/components/app/settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  const { profile } = auth;

  const isOrgAdmin =
    profile?.org_role === "owner" || profile?.org_role === "admin";
  const isSuperAdmin = profile?.role === "admin";

  if (!isOrgAdmin && !isSuperAdmin) redirect("/tools");

  const tabs: { href: string; label: string }[] = [];

  // Org admin/owner OR platform admin sees Organization, Teams, MCP Servers
  if (isOrgAdmin || isSuperAdmin) {
    tabs.push(
      { href: "/settings/organization", label: "Organization" },
      { href: "/settings/teams", label: "Teams" },
      { href: "/settings/mcp-servers", label: "MCP Servers" },
      { href: "/settings/access", label: "Access" },
      { href: "/settings/agent-usage", label: "Agent Usage" },
      { href: "/settings/audit-log", label: "Audit Log" },
    );
  }

  // Platform admin only
  if (isSuperAdmin) {
    tabs.push(
      { href: "/settings/users", label: "Users" },
      { href: "/settings/dashboard", label: "Dashboard" },
    );
  }

  return (
    <Container className="py-8">
      <div className="mb-8 flex items-center gap-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <SettingsNav tabs={tabs} />
      </div>
      {children}
    </Container>
  );
}
