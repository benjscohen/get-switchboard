import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { rollbackSkill, type SkillAuth } from "@/lib/skills/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;

  const body = await request.json();
  const version = body.version;
  if (typeof version !== "number") {
    return NextResponse.json({ error: "version (number) is required" }, { status: 400 });
  }

  const skillAuth: SkillAuth = { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole };
  const result = await rollbackSkill(skillAuth, id, version);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
