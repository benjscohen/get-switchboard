import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "crypto";
import type { UserLookup, MessageRow } from "./types.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// AES-256-GCM decryption (ported from main app's encryption.ts)
// Format: v1:iv_base64url:tag_base64url:ciphertext_base64url
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY environment variable is not set");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded)",
    );
  }
  return buf;
}

function decrypt(value: string): string {
  // Passthrough for unencrypted values (safe deployment before migration)
  if (!value.startsWith(`${VERSION}:`)) {
    return value;
  }

  const parts = value.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted token format");
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// User lookup: Slack user ID -> Switchboard user + agent key
// ---------------------------------------------------------------------------

export async function lookupUserBySlackId(
  slackUserId: string,
): Promise<UserLookup | null> {
  // 1. Find user_id from Slack connection
  const { data: connection, error: connErr } = await supabase
    .from("connections")
    .select("user_id")
    .eq("integration_id", "slack")
    .eq("provider_user_id", slackUserId)
    .maybeSingle();

  if (connErr) {
    console.error("Error looking up Slack connection:", connErr);
    return null;
  }
  if (!connection) {
    return null;
  }

  const userId = connection.user_id as string;

  // 2. Get profile for org ID and preferred model
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("organization_id, preferred_agent_model")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    console.error("Error looking up profile:", profileErr);
    return null;
  }

  const organizationId = profile.organization_id as string;
  const model = (profile.preferred_agent_model as string) || "claude-sonnet-4-20250514";

  // 3. Get the user's active agent API key
  const { data: apiKey, error: keyErr } = await supabase
    .from("api_keys")
    .select("encrypted_raw_key")
    .eq("user_id", userId)
    .eq("is_agent_key", true)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (keyErr) {
    console.error("Error looking up agent key:", keyErr);
    return null;
  }
  if (!apiKey) {
    return null;
  }

  const agentKey = decrypt(apiKey.encrypted_raw_key as string);

  return { userId, organizationId, agentKey, model };
}

// ---------------------------------------------------------------------------
// Agent session management
// ---------------------------------------------------------------------------

export async function createSession(data: {
  userId: string;
  organizationId: string;
  slackChannelId: string;
  slackThreadTs: string | null;
  prompt: string;
  model: string;
}): Promise<string> {
  const { data: row, error } = await supabase
    .from("agent_sessions")
    .insert({
      user_id: data.userId,
      organization_id: data.organizationId,
      slack_channel_id: data.slackChannelId,
      slack_thread_ts: data.slackThreadTs,
      prompt: data.prompt,
      model: data.model,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return row.id as string;
}

export async function updateSession(
  id: string,
  patch: Partial<{
    status: string;
    result: string;
    error: string;
    claude_session_id: string;
    total_turns: number;
    completed_at: string;
    updated_at: string;
  }>,
): Promise<void> {
  const { error } = await supabase
    .from("agent_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error(`Failed to update session ${id}:`, error);
  }
}

export async function createMessage(data: MessageRow): Promise<void> {
  const { error } = await supabase.from("agent_messages").insert({
    session_id: data.sessionId,
    role: data.role,
    content: data.content,
    slack_ts: data.slackTs,
    metadata: data.metadata,
  });

  if (error) {
    console.error("Failed to create message:", error);
  }
}

// ---------------------------------------------------------------------------
// Crash recovery: find sessions that were running when the worker died
// ---------------------------------------------------------------------------

export async function getStaleRunningSessions(): Promise<
  Array<{
    id: string;
    slack_channel_id: string;
    slack_thread_ts: string | null;
  }>
> {
  const { data, error } = await supabase
    .from("agent_sessions")
    .select("id, slack_channel_id, slack_thread_ts")
    .eq("status", "running");

  if (error) {
    console.error("Error fetching stale sessions:", error);
    return [];
  }

  return (data ?? []) as Array<{
    id: string;
    slack_channel_id: string;
    slack_thread_ts: string | null;
  }>;
}
