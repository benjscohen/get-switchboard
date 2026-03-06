import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listSkillVersions, type SkillAuth } from "@/lib/skills/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const { data: teamMemberships } = await supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("user_id", auth.userId);
  const teamIds = (teamMemberships ?? []).map((m) => m.team_id);

  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole, teamIds };
  const result = await listSkillVersions(skillAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
