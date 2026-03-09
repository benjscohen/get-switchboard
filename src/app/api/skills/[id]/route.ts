import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getSkillById, updateSkill, deleteSkill, type SkillAuth } from "@/lib/skills/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await getSkillById(skillAuth, id);

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
  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await updateSkill(skillAuth, id, {
    name: body.name,
    description: body.description,
    content: body.content,
    arguments: body.arguments,
    enabled: body.enabled,
    scope: body.scope,
    teamId: body.teamId,
    changeSummary: body.changeSummary,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.SKILL_UPDATED,
    resourceType: "skill",
    resourceId: id,
    description: `Updated skill "${id}"`,
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

  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await deleteSkill(skillAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.SKILL_DELETED,
    resourceType: "skill",
    resourceId: id,
    description: `Deleted skill "${id}"`,
  });

  return NextResponse.json(result.data);
}
