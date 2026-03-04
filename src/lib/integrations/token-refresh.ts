import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { integrationRegistry } from "./registry";

type Connection = {
  id: string;
  integrationId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

const BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export async function getValidTokens(
  connection: Connection
): Promise<{ accessToken: string; refreshToken?: string }> {
  const now = Date.now();
  const expired =
    connection.expiresAt && connection.expiresAt.getTime() - BUFFER_MS < now;

  if (!expired) {
    return {
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken ?? undefined,
    };
  }

  if (!connection.refreshToken) {
    throw new Error("Token expired and no refresh token available");
  }

  const integration = integrationRegistry.get(connection.integrationId);
  if (!integration) {
    throw new Error(`Unknown integration: ${connection.integrationId}`);
  }

  const { oauth } = integration;
  const clientId = process.env[oauth.clientIdEnvVar];
  const clientSecret = process.env[oauth.clientSecretEnvVar];

  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing OAuth credentials for ${connection.integrationId}`
    );
  }

  const res = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Token refresh failed for ${connection.integrationId}:`, text);
    throw new Error("Token refresh failed. Please reconnect the integration.");
  }

  const data = await res.json();

  const updatedTokens = {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? connection.refreshToken,
  };

  await supabaseAdmin
    .from("connections")
    .update({
      access_token: encrypt(updatedTokens.accessToken),
      refresh_token: encrypt(updatedTokens.refreshToken),
      expires_at: data.expires_in
        ? new Date(now + data.expires_in * 1000).toISOString()
        : null,
    })
    .eq("id", connection.id);

  return updatedTokens;
}
