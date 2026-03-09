import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { integrationRegistry } from "./registry";
import { proxyIntegrationRegistry } from "./proxy-registry";
import { logger } from "@/lib/logger";

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

  // Resolve OAuth credentials — builtin or proxy integration
  let tokenUrl: string;
  let clientId: string;
  let clientSecret: string | undefined;

  const integration = integrationRegistry.get(connection.integrationId);
  if (integration) {
    const { oauth } = integration;
    const envClientId = process.env[oauth.clientIdEnvVar];
    const envClientSecret = process.env[oauth.clientSecretEnvVar];
    if (!envClientId || !envClientSecret) {
      throw new Error(
        `Missing OAuth credentials for ${connection.integrationId}`
      );
    }
    tokenUrl = oauth.tokenUrl;
    clientId = envClientId;
    clientSecret = envClientSecret;
  } else {
    const proxyIntegration = proxyIntegrationRegistry.get(connection.integrationId);
    if (!proxyIntegration?.oauth) {
      throw new Error(`Unknown integration: ${connection.integrationId}`);
    }

    const { oauth } = proxyIntegration;

    if (oauth.clientIdEnvVar) {
      // Static OAuth credentials from env vars
      const envClientId = process.env[oauth.clientIdEnvVar];
      const envClientSecret = oauth.clientSecretEnvVar
        ? process.env[oauth.clientSecretEnvVar]
        : undefined;
      if (!envClientId) {
        throw new Error(
          `Missing OAuth credentials for ${connection.integrationId}`
        );
      }
      tokenUrl = oauth.tokenUrl;
      clientId = envClientId;
      clientSecret = envClientSecret;
    } else {
      // DCR flow — get credentials from DB
      const { data: clientRow } = await supabaseAdmin
        .from("proxy_oauth_clients")
        .select("client_id, client_secret")
        .eq("integration_id", connection.integrationId)
        .single();

      if (!clientRow) {
        throw new Error(
          `No OAuth client registered for ${connection.integrationId}`
        );
      }

      tokenUrl = oauth.tokenUrl;
      clientId = clientRow.client_id;
      clientSecret = clientRow.client_secret ?? undefined;
    }
  }

  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
    client_id: clientId,
  };
  if (clientSecret) body.client_secret = clientSecret;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ integrationId: connection.integrationId, responseBody: text }, "Token refresh failed");
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
