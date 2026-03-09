import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const { id } = await params;

  const { data: keys, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, created_at, revoked_at, expires_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }

  return NextResponse.json(
    (keys ?? []).map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
      revokedAt: k.revoked_at,
      expiresAt: k.expires_at,
    }))
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const { id } = await params;
  const keyId = req.nextUrl.searchParams.get("keyId");

  if (!keyId) {
    return NextResponse.json({ error: "Missing keyId" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", id)
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }

  logAuditEvent({
    organizationId: authResult.organizationId,
    actorId: authResult.userId,
    eventType: AuditEventType.API_KEY_REVOKED,
    resourceType: "api_key",
    resourceId: keyId,
    description: `Admin revoked API key for user ${id}`,
    metadata: { targetUserId: id },
  });

  return NextResponse.json({ success: true });
}
