import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AuthSuccess = {
  authenticated: true;
  userId: string;
  role: string;
  organizationId: string;
  orgRole: string;
};
type AuthFailure = { authenticated: false; response: NextResponse };

export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authenticated: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id, org_role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      ),
    };
  }

  return {
    authenticated: true,
    userId: user.id,
    role: profile?.role ?? "user",
    organizationId: profile.organization_id,
    orgRole: profile?.org_role ?? "member",
  };
}

export async function requireAdmin(): Promise<AuthSuccess | AuthFailure> {
  const result = await requireAuth();
  if (!result.authenticated) return result;
  if (result.role !== "admin") {
    return {
      authenticated: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return result;
}

export async function requireOrgAdmin(): Promise<AuthSuccess | AuthFailure> {
  const result = await requireAuth();
  if (!result.authenticated) return result;
  if (result.orgRole !== "owner" && result.orgRole !== "admin") {
    return {
      authenticated: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return result;
}
