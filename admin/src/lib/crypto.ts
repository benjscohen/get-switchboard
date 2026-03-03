import { randomBytes, createHash } from "crypto";

export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const bytes = randomBytes(32);
  const raw = `sk_live_${bytes.toString("base64url")}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, 12),
  };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
