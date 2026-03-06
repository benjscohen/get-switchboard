import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { readFile, type FileAuth } from "@/lib/files/service";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
  }

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await readFile(fileAuth, path);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
