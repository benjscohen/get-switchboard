import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listDirectory, writeFile, type FileAuth } from "@/lib/files/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "/";
  const recursive = searchParams.get("recursive") === "true";

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await listDirectory(fileAuth, path, { recursive });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  if (!body.path || !body.content) {
    return NextResponse.json({ error: "path and content are required" }, { status: 400 });
  }

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await writeFile(fileAuth, body.path, body.content, { metadata: body.metadata });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.FILE_CREATED,
    resourceType: "file",
    resourceId: result.data.id,
    description: `Created file "${body.path}"`,
    metadata: { path: body.path },
  });

  return NextResponse.json(result.data, { status: 201 });
}
