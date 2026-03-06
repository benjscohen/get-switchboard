import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { rollbackFile, type FileAuth } from "@/lib/files/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const body = await request.json();
  const version = body.version;
  if (typeof version !== "number") {
    return NextResponse.json({ error: "version (number) is required" }, { status: 400 });
  }

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await rollbackFile(fileAuth, id, version);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
