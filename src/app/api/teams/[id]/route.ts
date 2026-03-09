import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth, requireOrgAdmin } from "@/lib/api-auth";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name, slug, organization_id, created_at, updated_at")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .single();

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("id, user_id, role, joined_at, profiles(name, image)")
    .eq("team_id", id);

  return NextResponse.json({
    id: team.id,
    name: team.name,
    slug: team.slug,
    createdAt: team.created_at,
    updatedAt: team.updated_at,
    members: (members ?? []).map((m) => {
      const profileRaw = m.profiles as unknown;
      const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { name: string | null; image: string | null } | null;
      return {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        name: profile?.name ?? null,
        image: profile?.image ?? null,
        joinedAt: m.joined_at,
      };
    }),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  // Must be team lead or org admin
  const isOrgAdmin = auth.orgRole === "owner" || auth.orgRole === "admin";
  if (!isOrgAdmin) {
    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", id)
      .eq("user_id", auth.userId)
      .single();
    if (membership?.role !== "lead") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await request.json();
  const { name } = body as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("teams")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", auth.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.TEAM_UPDATED,
    resourceType: "team",
    resourceId: id,
    description: `Updated team "${id}"`,
    metadata: { name: name.trim() },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("teams")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.TEAM_DELETED,
    resourceType: "team",
    resourceId: id,
    description: `Deleted team "${id}"`,
  });

  return NextResponse.json({ ok: true });
}
