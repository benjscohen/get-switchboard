import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";

export async function GET() {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const { data, error } = await supabaseAdmin.rpc("get_admin_users");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  const users = (data ?? []).map((u: Record<string, unknown>) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
    status: u.status,
    permissionsMode: u.permissions_mode,
    organizationId: u.organization_id,
    orgRole: u.org_role,
    orgName: u.org_name,
    apiKeyCount: Number(u.api_key_count),
    connectionCount: Number(u.connection_count),
    requestCount: Number(u.request_count),
    lastActive: u.last_active ?? null,
  }));

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const body = await req.json();
  const { email, name, role } = body as {
    email?: string;
    name?: string;
    role?: string;
  };

  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "Email is required" },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if profile already exists
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  // Create user via Supabase Admin Auth (generates a UUID, triggers profile creation)
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: { full_name: name?.trim() || null },
  });

  if (authError || !authUser.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Failed to create user" },
      { status: 500 }
    );
  }

  // Update profile with role/status (trigger sets defaults)
  await supabaseAdmin
    .from("profiles")
    .update({
      role: role === "admin" ? "admin" : "user",
      status: "invited",
      name: name?.trim() || null,
    })
    .eq("id", authUser.user.id);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name, role, status, permissions_mode")
    .eq("id", authUser.user.id)
    .single();

  return NextResponse.json(profile, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  // Cannot deactivate self
  if (id === authResult.userId) {
    return NextResponse.json(
      { error: "Cannot deactivate yourself" },
      { status: 400 }
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await supabaseAdmin
    .from("profiles")
    .update({ status: "deactivated" })
    .eq("id", id);

  const now = new Date().toISOString();

  // Revoke all active API keys
  await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("user_id", id)
    .is("revoked_at", null);

  // Remove all OAuth connections
  await supabaseAdmin
    .from("connections")
    .delete()
    .eq("user_id", id);

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const body = await req.json();
  const { role, permissionsMode, orgRole, removeFromOrg } = body as {
    role?: string;
    permissionsMode?: string;
    orgRole?: string;
    removeFromOrg?: boolean;
  };

  // Cannot demote self
  if (role && role !== "admin" && id === authResult.userId) {
    return NextResponse.json(
      { error: "Cannot demote yourself" },
      { status: 400 }
    );
  }

  // Cannot set own permissions to custom
  if (permissionsMode === "custom" && id === authResult.userId) {
    return NextResponse.json(
      { error: "Cannot set your own permissions to custom" },
      { status: 400 }
    );
  }

  // Handle remove from org
  if (removeFromOrg) {
    if (id === authResult.userId) {
      return NextResponse.json(
        { error: "Cannot remove yourself from your organization" },
        { status: 400 }
      );
    }

    const slug = `personal-removed-${id.slice(0, 8)}-${Date.now()}`;
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
      .eq("id", id);

    return NextResponse.json({ success: true });
  }

  const data: Record<string, string> = {};
  if (role && (role === "user" || role === "admin")) {
    data.role = role;
  }
  if (
    permissionsMode &&
    (permissionsMode === "full" || permissionsMode === "custom")
  ) {
    data.permissions_mode = permissionsMode;
  }
  if (orgRole && ["owner", "admin", "member"].includes(orgRole)) {
    data.org_role = orgRole;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("profiles")
    .update(data)
    .eq("id", id)
    .select("id, email, name, role, status, permissions_mode, org_role")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // When switching from custom → full, clean up access rows
  if (permissionsMode === "full") {
    await supabaseAdmin
      .from("user_integration_access")
      .delete()
      .eq("user_id", id);
  }

  return NextResponse.json({
    ...updated,
    permissionsMode: updated.permissions_mode,
    orgRole: updated.org_role,
  });
}
