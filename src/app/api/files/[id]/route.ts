import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { readFileById, updateFileById, deleteFileById, type FileAuth } from "@/lib/files/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await readFileById(fileAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const body = await request.json();
  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await updateFileById(fileAuth, id, {
    content: body.content,
    metadata: body.metadata,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.FILE_UPDATED,
    resourceType: "file",
    resourceId: id,
    description: `Updated file "${id}"`,
  });

  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await deleteFileById(fileAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.FILE_DELETED,
    resourceType: "file",
    resourceId: id,
    description: `Deleted file "${id}"`,
  });

  return NextResponse.json(result.data);
}
