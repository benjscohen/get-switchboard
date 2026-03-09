import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listShares, shareSecret } from "@/lib/vault/service";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const result = await listShares(
    { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole },
    id
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const body = await req.json();

  // Validate exactly one target
  const targets = [body.user_id, body.team_id, body.organization_id].filter(Boolean);
  if (targets.length !== 1) {
    return NextResponse.json(
      { error: "Provide exactly one of: user_id, team_id, organization_id" },
      { status: 400 }
    );
  }

  // Resolve "current" organization_id to the user's actual org
  const orgId = body.organization_id === "current" ? auth.organizationId : body.organization_id;
  if (body.organization_id && !orgId) {
    return NextResponse.json(
      { error: "No organization context available" },
      { status: 400 }
    );
  }

  const target = body.user_id
    ? { user_id: body.user_id }
    : body.team_id
      ? { team_id: body.team_id }
      : { organization_id: orgId };

  const result = await shareSecret(
    { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole },
    id,
    target
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.SECRET_SHARE_CREATED,
    resourceType: "secret_share",
    resourceId: result.data.id,
    description: `Shared secret "${id}"`,
    metadata: { secretId: id, ...target },
  });

  return NextResponse.json(result.data, { status: 201 });
}
