import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";
import { SettingsNav } from "@/components/app/settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_role")
    .eq("id", user.id)
    .single();

  const isOrgAdmin =
    profile?.org_role === "owner" || profile?.org_role === "admin";
  const isSuperAdmin = profile?.role === "admin";

  if (!isOrgAdmin && !isSuperAdmin) redirect("/dashboard");

  const tabs: { href: string; label: string }[] = [];

  if (isOrgAdmin) {
    tabs.push(
      { href: "/settings/general", label: "General" },
      { href: "/settings/integrations", label: "Integrations" },
    );
  }

  if (isSuperAdmin) {
    tabs.push(
      { href: "/settings/overview", label: "Overview" },
      { href: "/settings/users", label: "Users" },
      { href: "/settings/usage", label: "Usage Logs" },
      { href: "/settings/mcp-servers", label: "MCP Servers" },
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
