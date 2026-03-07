import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { generateApiKey } from "@/lib/crypto";
import { encrypt } from "@/lib/encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_MODEL_IDS } from "@/lib/agent-models";

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const { userId, organizationId } = authResult;

  let permissions: Record<string, string[] | null> | null = null;
  let model: string | undefined;

  try {
    const body = await request.json();
    if (body.permissions !== undefined) permissions = body.permissions;
    if (body.model && ALLOWED_MODEL_IDS.includes(body.model)) model = body.model;
  } catch {
    // empty body is fine — defaults to null permissions
  }

  // Revoke existing agent key if any
  await supabaseAdmin
    .from("api_keys")
    .update({ is_agent_key: false, encrypted_raw_key: null, revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_agent_key", true)
    .is("revoked_at", null);

  // Generate new key
  const { raw, hash, prefix } = generateApiKey();
  const encryptedRaw = encrypt(raw);

  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: inserted, error } = await supabaseAdmin.from("api_keys").insert({
    user_id: userId,
    organization_id: organizationId,
    name: "Agent Key",
    key_hash: hash,
    key_prefix: prefix,
    scope: "full",
    is_agent_key: true,
    encrypted_raw_key: encryptedRaw,
    expires_at: expiresAt,
    permissions,
  }).select("id").single();

  if (error) {
    console.error("Failed to create agent key:", error);
    return NextResponse.json({ error: "Failed to create agent key" }, { status: 500 });
  }

  // Update preferred model if provided
  if (model) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ preferred_agent_model: model }).eq("id", userId);
  }

  return NextResponse.json({ id: inserted.id, prefix, name: "Agent Key", expiresAt });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const { userId } = authResult;

  const body = await request.json();
  const permissions: Record<string, string[] | null> | null =
    body.permissions !== undefined ? body.permissions : null;

  const { error } = await supabaseAdmin
    .from("api_keys")
    .update({ permissions })
    .eq("user_id", userId)
    .eq("is_agent_key", true)
    .is("revoked_at", null);

  if (error) {
    console.error("Failed to update agent key permissions:", error);
    return NextResponse.json({ error: "Failed to update permissions" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const { userId } = authResult;

  const { error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString(), is_agent_key: false, encrypted_raw_key: null })
    .eq("user_id", userId)
    .eq("is_agent_key", true)
    .is("revoked_at", null);

  if (error) {
    console.error("Failed to revoke agent key:", error);
    return NextResponse.json({ error: "Failed to disable agent" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
