import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { unshareSecret } from "@/lib/vault/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id, shareId } = await params;
  const result = await unshareSecret(
    { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole },
    id,
    shareId
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
