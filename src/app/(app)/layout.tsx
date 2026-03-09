import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/auth-cache";
import { Container } from "@/components/ui/container";
import { UserMenu } from "@/components/app/user-menu";
import { MainNav } from "@/components/app/main-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthProfile();
  if (!auth) redirect("/login");

  const { user, profile } = auth;

  const displayName = profile?.name ?? user.user_metadata?.full_name ?? user.email ?? "";
  const avatarUrl = profile?.image ?? user.user_metadata?.avatar_url ?? null;
  const role = profile?.role ?? "user";
  const orgRole = profile?.org_role ?? "member";
  const orgRaw = profile?.organizations as unknown;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string; slug: string; is_personal: boolean } | null;
  const showOrgSettings = orgRole === "owner" || orgRole === "admin";

  return (
    <>
      <header className="border-b border-border bg-bg/80 backdrop-blur-xl">
        <Container className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/tools" className="flex items-center gap-2 text-lg font-bold">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                className="text-accent"
              >
                <rect
                  x="3"
                  y="3"
                  width="7"
                  height="7"
                  rx="1.5"
                  fill="currentColor"
                />
                <rect
                  x="14"
                  y="3"
                  width="7"
                  height="7"
                  rx="1.5"
                  fill="currentColor"
                  opacity="0.7"
                />
                <rect
                  x="3"
                  y="14"
                  width="7"
                  height="7"
                  rx="1.5"
                  fill="currentColor"
                  opacity="0.7"
                />
                <rect
                  x="14"
                  y="14"
                  width="7"
                  height="7"
                  rx="1.5"
                  fill="currentColor"
                  opacity="0.4"
                />
              </svg>
              Switchboard
            </Link>
            {org && !org.is_personal && (
              <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {org.name}
              </span>
            )}
            <MainNav links={[
              { href: "/tools", label: "Tools" },
              { href: "/agents", label: "Agents" },
              { href: "/threads", label: "Threads" },
              { href: "/workspace", label: "Workspace" },
              ...((showOrgSettings || role === "admin") ? [{ href: "/settings", label: "Settings" }] : []),
            ]} />
          </div>
          <UserMenu
            displayName={displayName}
            avatarUrl={avatarUrl}
          />
        </Container>
      </header>
      <main>{children}</main>
    </>
  );
}
