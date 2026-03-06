import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listSkillVersions, type SkillAuth } from "@/lib/skills/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await listSkillVersions(skillAuth, id);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
