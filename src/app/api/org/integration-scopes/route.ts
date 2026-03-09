import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFullCatalog } from "@/lib/integrations/catalog";
import { logger } from "@/lib/logger";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET() {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const [catalog, { data: scopes }, { data: members }] = await Promise.all([
    getFullCatalog(),
    supabaseAdmin
      .from("integration_access_scopes")
      .select("id, integration_id, integration_scope_users(user_id)")
      .eq("organization_id", auth.organizationId),
    supabaseAdmin
      .from("profiles")
      .select("id, name, org_role")
      .eq("organization_id", auth.organizationId)
      .order("name"),
  ]);

  const scopeMap: Record<string, string[]> = {};
  for (const scope of scopes ?? []) {
    const users = (scope.integration_scope_users ?? []) as Array<{ user_id: string }>;
    scopeMap[scope.integration_id] = users.map((u) => u.user_id);
  }

  return NextResponse.json({
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
    })),
    scopes: scopeMap,
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.org_role,
    })),
  });
}

export async function PUT(request: Request) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const { scopes } = body as {
    scopes: Array<{ integrationId: string; userIds: string[] }>;
  };

  if (!Array.isArray(scopes)) {
    return NextResponse.json({ error: "scopes must be an array" }, { status: 400 });
  }

  // Delete all existing scopes for this org
  await supabaseAdmin
    .from("integration_access_scopes")
    .delete()
    .eq("organization_id", auth.organizationId);

  // Insert new scopes (empty userIds = admins only)
  const scopesToInsert = scopes;

  for (const scope of scopesToInsert) {
    const { data: inserted, error } = await supabaseAdmin
      .from("integration_access_scopes")
      .insert({
        organization_id: auth.organizationId,
        integration_id: scope.integrationId,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      logger.error({ err: error }, "[integration-scopes] insert error");
      return NextResponse.json({ error: "Failed to save scopes" }, { status: 500 });
    }

    if (scope.userIds.length > 0) {
      const { error: userError } = await supabaseAdmin
        .from("integration_scope_users")
        .insert(
          scope.userIds.map((userId) => ({
            scope_id: inserted.id,
            user_id: userId,
          }))
        );

      if (userError) {
        logger.error({ err: userError }, "[integration-scopes] user insert error");
        return NextResponse.json({ error: "Failed to save scope users" }, { status: 500 });
      }
    }
  }

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.ORGANIZATION_UPDATED,
    resourceType: "integration_access_scopes",
    description: "Updated integration access scopes",
    metadata: { scopeCount: scopes.length },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(request.url);
  const integrationId = searchParams.get("integrationId");

  if (!integrationId) {
    return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
  }

  await supabaseAdmin
    .from("integration_access_scopes")
    .delete()
    .eq("organization_id", auth.organizationId)
    .eq("integration_id", integrationId);

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.ORGANIZATION_UPDATED,
    resourceType: "integration_access_scopes",
    resourceId: integrationId,
    description: `Removed integration access scope for ${integrationId}`,
  });

  return NextResponse.json({ ok: true });
}
