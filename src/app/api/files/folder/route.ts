import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createFolder, deleteFolder, type FileAuth } from "@/lib/files/service";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  if (!body.path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await createFolder(fileAuth, body.path);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const recursive = searchParams.get("recursive") === "true";

  if (!path) {
    return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
  }

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await deleteFolder(fileAuth, path, { recursive });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
