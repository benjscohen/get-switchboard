import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listSecrets } from "@/lib/vault/service";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const result = await listSecrets(
    { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole },
    "shared"
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
