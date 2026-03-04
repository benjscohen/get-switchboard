import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";

export default async function AdminLayout({
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
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <Container className="py-8">
      <div className="mb-8 flex items-center gap-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <nav className="flex gap-4 text-sm">
          <a
            href="/admin"
            className="text-text-secondary transition-colors hover:text-text-primary"
          >
            Overview
          </a>
          <a
            href="/admin/users"
            className="text-text-secondary transition-colors hover:text-text-primary"
          >
            Users
          </a>
          <a
            href="/admin/usage"
            className="text-text-secondary transition-colors hover:text-text-primary"
          >
            Usage Logs
          </a>
          <a
            href="/admin/mcp-servers"
            className="text-text-secondary transition-colors hover:text-text-primary"
          >
            MCP Servers
          </a>
        </nav>
      </div>
      {children}
    </Container>
  );
}
