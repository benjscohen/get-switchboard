import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getSecret, updateSecret, deleteSecret } from "@/lib/vault/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const result = await getSecret(
    { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole },
    id
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const result = await updateSecret({ userId: auth.userId }, id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.SECRET_UPDATED,
    resourceType: "secret",
    resourceId: id,
    description: `Updated secret "${id}"`,
    metadata: { name: body.name },
  });

  return NextResponse.json(result.data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const result = await deleteSecret({ userId: auth.userId }, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.SECRET_DELETED,
    resourceType: "secret",
    resourceId: id,
    description: `Deleted secret "${id}"`,
  });

  return NextResponse.json(result.data);
}
