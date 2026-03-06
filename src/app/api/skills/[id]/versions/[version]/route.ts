import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getSkillVersion, type SkillAuth } from "@/lib/skills/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id, version } = await params;

  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) return NextResponse.json({ error: "Invalid version" }, { status: 400 });

  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await getSkillVersion(skillAuth, id, versionNum);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
