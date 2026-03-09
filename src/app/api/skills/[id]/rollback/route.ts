import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { rollbackSkill, type SkillAuth } from "@/lib/skills/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

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

  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await rollbackSkill(skillAuth, id, version);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.SKILL_ROLLED_BACK,
    resourceType: "skill",
    resourceId: id,
    description: `Rolled back skill "${id}" to version ${version}`,
    metadata: { version },
  });

  return NextResponse.json(result.data);
}
