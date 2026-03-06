import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { readFileById, moveFile, type FileAuth } from "@/lib/files/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const body = await request.json();
  if (!body.to) {
    return NextResponse.json({ error: "to (destination path) is required" }, { status: 400 });
  }

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };

  // Get current path from file
  const file = await readFileById(fileAuth, id);
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: file.status });

  const result = await moveFile(fileAuth, file.data.path, body.to);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
