import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listSecrets, createSecret } from "@/lib/vault/service";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(req.url);
  const include = (searchParams.get("include") ?? "all") as "owned" | "shared" | "all";

  const result = await listSecrets(
    { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole },
    include
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await req.json();
  const result = await createSecret({ userId: auth.userId }, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data, { status: 201 });
}
