import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listAgents, createAgent, type AgentAuth } from "@/lib/agents/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

async function getAgentAuth(auth: { userId: string; organizationId: string; orgRole: string }): Promise<AgentAuth> {
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

  const agentAuth = await getAgentAuth(auth);
  const result = await listAgents(agentAuth);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const agentAuth = await getAgentAuth(auth);
  const result = await createAgent(agentAuth, {
    scope: body.scope,
    teamId: body.teamId,
    name: body.name,
    slug: body.slug,
    description: body.description,
    instructions: body.instructions,
    toolAccess: body.toolAccess,
    model: body.model,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.AGENT_CREATED,
    resourceType: "agent",
    resourceId: result.data.id,
    description: `Created agent "${body.name}"`,
    metadata: { name: body.name, slug: body.slug },
  });

  return NextResponse.json(result.data, { status: result.status ?? 201 });
}
