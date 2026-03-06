import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const supabase = await createClient();
  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, created_at, user_id, revoked_at, scope, expires_at, permissions")
    .eq("organization_id", authResult.organizationId)
    .eq("user_id", authResult.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }

  const mapped = (keys ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
    revokedAt: k.revoked_at,
    scope: k.scope ?? "full",
    expiresAt: k.expires_at,
    permissions: k.permissions ?? null,
  }));

  return NextResponse.json(mapped);
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const rl = checkRateLimit(`keys:${authResult.userId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await request.json();
  const name = body.name?.trim() || "Default";
  const scope = body.scope?.trim() || "full";

  if (!["full", "read_write", "read_only"].includes(scope)) {
    return NextResponse.json(
      { error: "scope must be 'full', 'read_write', or 'read_only'" },
      { status: 400 }
    );
  }

  // Validate optional per-key permissions
  let permissions: Record<string, string[] | null> | null = null;
  if (body.permissions != null) {
    if (typeof body.permissions !== "object" || Array.isArray(body.permissions)) {
      return NextResponse.json(
        { error: "permissions must be an object mapping integration IDs to tool arrays or null" },
        { status: 400 }
      );
    }
    for (const [key, value] of Object.entries(body.permissions)) {
      if (typeof key !== "string") {
        return NextResponse.json({ error: "permissions keys must be strings" }, { status: 400 });
      }
      if (value !== null && (!Array.isArray(value) || !value.every((v) => typeof v === "string"))) {
        return NextResponse.json(
          { error: `permissions["${key}"] must be null (all tools) or a string array of tool names` },
          { status: 400 }
        );
      }
    }
    permissions = body.permissions as Record<string, string[] | null>;
  }

  const { raw, hash, prefix } = generateApiKey();

  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").insert({
    user_id: authResult.userId,
    organization_id: authResult.organizationId,
    name,
    key_hash: hash,
    key_prefix: prefix,
    scope,
    permissions,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }

  return NextResponse.json({ key: raw, prefix, name, scope, permissions });
}

export async function DELETE(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });
  }

  const supabase = await createClient();
  const revokedAt = new Date().toISOString();

  // Org admins/owners can revoke any org key; members can only revoke their own
  if (authResult.orgRole === "owner" || authResult.orgRole === "admin") {
    await supabase
      .from("api_keys")
      .update({ revoked_at: revokedAt })
      .eq("id", id)
      .eq("organization_id", authResult.organizationId)
      .is("revoked_at", null);
  } else {
    await supabase
      .from("api_keys")
      .update({ revoked_at: revokedAt })
      .eq("id", id)
      .eq("user_id", authResult.userId)
      .is("revoked_at", null);
  }

  return NextResponse.json({ success: true });
}
