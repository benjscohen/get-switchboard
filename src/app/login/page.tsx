import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { Card } from "@/components/ui/card";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card hover={false} className="w-full max-w-sm text-center">
        <div className="mb-6">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            className="mx-auto mb-4 text-accent"
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
          <h1 className="text-xl font-bold">Sign in to Switchboard</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to get started
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path
                d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"
                fill="#4285F4"
              />
              <path
                d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"
                fill="#34A853"
              />
              <path
                d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"
                fill="#FBBC05"
              />
              <path
                d="M8.98 3.58c1.32 0 2.5.44 3.44 1.35l2.58-2.59C13.46.89 11.14 0 8.98 0A8 8 0 001.83 5.41L4.5 7.48a4.77 4.77 0 014.48-3.9z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </form>
      </Card>
    </div>
  );
}
