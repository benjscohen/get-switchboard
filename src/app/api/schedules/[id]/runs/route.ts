import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { buildScopedAuth } from "@/lib/shared/scoped-entity";
import { listScheduleRuns } from "@/lib/schedules/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const scopedAuth = await buildScopedAuth(auth);

  const url = new URL(_request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);

  const result = await listScheduleRuns(scopedAuth, id, { limit });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
