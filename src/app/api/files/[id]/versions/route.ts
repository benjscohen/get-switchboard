import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listVersions, type FileAuth } from "@/lib/files/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const fileAuth: FileAuth = { userId: auth.userId, organizationId: auth.organizationId };
  const result = await listVersions(fileAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
