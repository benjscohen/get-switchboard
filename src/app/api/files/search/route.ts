import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { searchFiles, type FileAuth } from "@/lib/files/service";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? undefined;
  const path = searchParams.get("path") ?? undefined;

  if (!query) {
    return NextResponse.json({ error: "q query parameter is required" }, { status: 400 });
  }

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await searchFiles(fileAuth, { query, path });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
