import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/crypto";

export async function authenticateBearer(
  req: Request
): Promise<{ userId: string; organizationId?: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const keyHash = hashApiKey(token);

  const { data: apiKey } = await supabaseAdmin
    .from("api_keys")
    .select("user_id, organization_id, expires_at, revoked_at")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (!apiKey) return null;
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) return null;

  return {
    userId: apiKey.user_id,
    organizationId: apiKey.organization_id ?? undefined,
  };
}
