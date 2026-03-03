import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Container } from "@/components/ui/container";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <header className="border-b border-border bg-bg/80 backdrop-blur-xl">
        <Container className="flex h-14 items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-lg font-bold">
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
          <div className="flex items-center gap-4">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="h-7 w-7 rounded-full"
              />
            )}
            <span className="text-sm text-text-secondary">
              {session.user.name}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
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
