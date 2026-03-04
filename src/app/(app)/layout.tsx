import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";

export default async function AppLayout({
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
    .select("role, name, image, organization_id, org_role, organizations(name, slug, is_personal)")
    .eq("id", user.id)
    .single();

  const displayName = profile?.name ?? user.user_metadata?.full_name ?? user.email;
  const avatarUrl = profile?.image ?? user.user_metadata?.avatar_url;
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
            <a href="/dashboard" className="flex items-center gap-2 text-lg font-bold">
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
            </a>
            {org && !org.is_personal && (
              <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {org.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {showOrgSettings && (
              <a
                href="/org"
                className="text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                Org Settings
              </a>
            )}
            {role === "admin" && (
              <a
                href="/admin"
                className="text-sm text-accent transition-colors hover:text-accent/80"
              >
                Admin
              </a>
            )}
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt=""
                className="h-7 w-7 rounded-full"
              />
            )}
            <span className="text-sm text-text-secondary">
              {displayName}
            </span>
            <form
              action={async () => {
                "use server";
                const supabase = await createClient();
                await supabase.auth.signOut();
                redirect("/");
              }}
            >
              <button
                type="submit"
                className="text-sm text-text-tertiary transition-colors hover:text-text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </Container>
      </header>
      <main>{children}</main>
    </>
  );
}
