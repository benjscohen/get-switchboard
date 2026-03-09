import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentById, updateAgent, deleteAgent, type AgentAuth } from "@/lib/agents/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const { data: teamMemberships } = await supabaseAdmin
    .from("team_members").select("team_id").eq("user_id", auth.userId);
  const teamIds = (teamMemberships ?? []).map((m) => m.team_id);

  const agentAuth: AgentAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole, teamIds };
  const result = await getAgentById(agentAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const body = await request.json();
  const agentAuth: AgentAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await updateAgent(agentAuth, id, {
    name: body.name,
    description: body.description,
    instructions: body.instructions,
    toolAccess: body.toolAccess,
    model: body.model,
    enabled: body.enabled,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.AGENT_UPDATED,
    resourceType: "agent",
    resourceId: id,
    description: `Updated agent "${id}"`,
    metadata: { name: body.name, enabled: body.enabled },
  });

  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const agentAuth: AgentAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await deleteAgent(agentAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.AGENT_DELETED,
    resourceType: "agent",
    resourceId: id,
    description: `Deleted agent "${id}"`,
  });

  return NextResponse.json(result.data);
}
