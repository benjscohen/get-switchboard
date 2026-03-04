/**
 * One-time migration script to encrypt existing plaintext tokens in the connections table.
 *
 * Usage:
 *   npx tsx scripts/encrypt-existing-tokens.ts
 *
 * Requires TOKEN_ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY environment variables.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "../src/lib/encryption";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error("TOKEN_ENCRYPTION_KEY is required");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: connections, error } = await supabase
    .from("connections")
    .select("id, access_token, refresh_token");

  if (error) {
    console.error("Failed to fetch connections:", error.message);
    process.exit(1);
  }

  let encrypted = 0;
  let skipped = 0;

  for (const conn of connections ?? []) {
    const needsEncrypt =
      !conn.access_token.startsWith("v1:") ||
      (conn.refresh_token && !conn.refresh_token.startsWith("v1:"));

    if (!needsEncrypt) {
      skipped++;
      continue;
    }

    await supabase
      .from("connections")
      .update({
        access_token: conn.access_token.startsWith("v1:")
          ? conn.access_token
          : encrypt(conn.access_token),
        refresh_token:
          conn.refresh_token && !conn.refresh_token.startsWith("v1:")
            ? encrypt(conn.refresh_token)
            : conn.refresh_token,
      })
      .eq("id", conn.id);

    encrypted++;
  }

  console.log(
    `Done. Encrypted: ${encrypted}, Already encrypted: ${skipped}`
  );
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
