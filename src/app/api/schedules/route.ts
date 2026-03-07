import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { buildScopedAuth } from "@/lib/shared/scoped-entity";
import { listSchedules } from "@/lib/schedules/service";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const scopedAuth = await buildScopedAuth(auth);
  const result = await listSchedules(scopedAuth);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
