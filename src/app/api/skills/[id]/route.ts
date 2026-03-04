import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  organization_id: string | null;
  team_id: string | null;
  user_id: string | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function formatSkill(s: SkillRow) {
  const scope = s.organization_id ? "organization" : s.team_id ? "team" : "user";
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    content: s.content,
    arguments: s.arguments,
    scope,
    organizationId: s.organization_id,
    teamId: s.team_id,
    userId: s.user_id,
    enabled: s.enabled,
    createdBy: s.created_by,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

async function canEditSkill(
  auth: { userId: string; orgRole: string; organizationId: string },
  skill: SkillRow
): Promise<boolean> {
  // User skills: only own
  if (skill.user_id) return skill.user_id === auth.userId;

  // Org skills: org admin/owner
  if (skill.organization_id) {
    return auth.orgRole === "owner" || auth.orgRole === "admin";
  }

  // Team skills: team lead or org admin
  if (skill.team_id) {
    if (auth.orgRole === "owner" || auth.orgRole === "admin") return true;
    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", skill.team_id)
      .eq("user_id", auth.userId)
      .single();
    return membership?.role === "lead";
  }

  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const { data: skill } = await supabaseAdmin
    .from("skills")
    .select("*")
    .eq("id", id)
    .single();

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const s = skill as SkillRow;

  // Verify user can see this skill
  if (s.user_id && s.user_id !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (s.organization_id && s.organization_id !== auth.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (s.team_id) {
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("organization_id")
      .eq("id", s.team_id)
      .single();
    if (team?.organization_id !== auth.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json(formatSkill(s));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const { data: skill } = await supabaseAdmin
    .from("skills")
    .select("*")
    .eq("id", id)
    .single();

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const s = skill as SkillRow;
  if (!(await canEditSkill(auth, s))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.content !== undefined) updates.content = body.content.trim();
  if (body.arguments !== undefined) updates.arguments = body.arguments;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  const { data: updated, error } = await supabaseAdmin
    .from("skills")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(formatSkill(updated as SkillRow));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const { data: skill } = await supabaseAdmin
    .from("skills")
    .select("*")
    .eq("id", id)
    .single();

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const s = skill as SkillRow;
  if (!(await canEditSkill(auth, s))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("skills").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
