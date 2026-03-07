import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rollbackAgent, type AgentAuth } from "@/lib/agents/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const body = await request.json();
  const version = body.version;
  if (typeof version !== "number") {
    return NextResponse.json({ error: "version (number) is required" }, { status: 400 });
  }

  const { data: teamMemberships } = await supabaseAdmin
    .from("team_members").select("team_id").eq("user_id", auth.userId);
  const teamIds = (teamMemberships ?? []).map((m) => m.team_id);

  const agentAuth: AgentAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole, teamIds };
  const result = await rollbackAgent(agentAuth, id, version);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
