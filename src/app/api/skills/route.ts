import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listSkills, createSkill, type SkillAuth } from "@/lib/skills/service";

async function getSkillAuth(auth: { userId: string; organizationId: string; orgRole: string }): Promise<SkillAuth> {
  const { data: teamMemberships } = await supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("user_id", auth.userId);
  const teamIds = (teamMemberships ?? []).map((m) => m.team_id);
  return { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole, teamIds };
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const skillAuth = await getSkillAuth(auth);
  const result = await listSkills(skillAuth);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const skillAuth = await getSkillAuth(auth);
  const result = await createSkill(skillAuth, {
    scope: body.scope,
    teamId: body.teamId,
    name: body.name,
    slug: body.slug,
    description: body.description,
    content: body.content,
    arguments: body.arguments,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data, { status: result.status ?? 201 });
}
