import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth, requireOrgAdmin } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { data, error } = await supabaseAdmin.rpc("get_org_members", {
    p_org_id: auth.organizationId,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }

  const members = (data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    image: m.image,
    orgRole: m.org_role,
    apiKeyCount: Number(m.api_key_count),
    connectionCount: Number(m.connection_count),
    usageCount: Number(m.usage_count),
  }));

  return NextResponse.json(members);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await req.json();
  const { userId, orgRole } = body as { userId: string; orgRole: string };

  if (!userId || !orgRole) {
    return NextResponse.json(
      { error: "userId and orgRole are required" },
      { status: 400 }
    );
  }

  if (!["owner", "admin", "member"].includes(orgRole)) {
    return NextResponse.json(
      { error: "orgRole must be owner, admin, or member" },
      { status: 400 }
    );
  }

  // Cannot change own role
  if (userId === auth.userId) {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 }
    );
  }

  // Only owners can promote to owner or change other owners/admins
  if (auth.orgRole !== "owner") {
    // Check target user's current role
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("org_role")
      .eq("id", userId)
      .eq("organization_id", auth.organizationId)
      .single();

    if (!target) {
      return NextResponse.json({ error: "User not found in org" }, { status: 404 });
    }

    if (target.org_role === "owner" || target.org_role === "admin") {
      return NextResponse.json(
        { error: "Only owners can change owner/admin roles" },
        { status: 403 }
      );
    }

    if (orgRole === "owner") {
      return NextResponse.json(
        { error: "Only owners can promote to owner" },
        { status: 403 }
      );
    }
  }

  // Verify user is in the same org
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .update({ org_role: orgRole })
    .eq("id", userId)
    .eq("organization_id", auth.organizationId)
    .select("id, email, name, org_role")
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "User not found in organization" }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    email: profile.email,
    name: profile.name,
    orgRole: profile.org_role,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Cannot remove self
  if (userId === auth.userId) {
    return NextResponse.json(
      { error: "Cannot remove yourself from the organization" },
      { status: 400 }
    );
  }

  // Verify user is in org and check role restrictions
  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("org_role")
    .eq("id", userId)
    .eq("organization_id", auth.organizationId)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found in organization" }, { status: 404 });
  }

  // Only owners can remove admins/owners
  if (auth.orgRole !== "owner" && (target.org_role === "owner" || target.org_role === "admin")) {
    return NextResponse.json(
      { error: "Only owners can remove owners or admins" },
      { status: 403 }
    );
  }

  // Move user to a new personal org
  const slug = `personal-removed-${userId.slice(0, 8)}-${Date.now()}`;
  const { data: newOrg } = await supabaseAdmin
    .from("organizations")
    .insert({ name: "Personal", slug, is_personal: true })
    .select("id")
    .single();

  if (!newOrg) {
    return NextResponse.json({ error: "Failed to create personal org" }, { status: 500 });
  }

  await supabaseAdmin
    .from("profiles")
    .update({ organization_id: newOrg.id, org_role: "owner" })
    .eq("id", userId);

  return NextResponse.json({ success: true });
}
