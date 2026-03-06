import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { generateApiKey } from "@/lib/crypto";
import { encrypt } from "@/lib/encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const { userId, organizationId } = authResult;

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

  const { error } = await supabaseAdmin.from("api_keys").insert({
    user_id: userId,
    organization_id: organizationId,
    name: "Agent Key",
    key_hash: hash,
    key_prefix: prefix,
    scope: "full",
    is_agent_key: true,
    encrypted_raw_key: encryptedRaw,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    console.error("Failed to create agent key:", error);
    return NextResponse.json({ error: "Failed to create agent key" }, { status: 500 });
  }

  return NextResponse.json({ key: raw, prefix, name: "Agent Key" });
}
