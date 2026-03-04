import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Generate PKCE code_verifier and code_challenge (S256).
 */
export async function generatePkce(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const codeVerifier = base64url(bytes);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = base64url(new Uint8Array(digest));

  return { codeVerifier, codeChallenge };
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Call the DCR endpoint to register a new OAuth client.
 */
export async function registerOAuthClient(
  registrationUrl: string,
  redirectUri: string
): Promise<{ clientId: string; clientSecret: string | null }> {
  const res = await fetch(registrationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      client_name: "Switchboard",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DCR failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    clientId: data.client_id,
    clientSecret: data.client_secret ?? null,
  };
}

/**
 * Get cached client credentials or register via DCR.
 */
export async function getOrRegisterClient(
  integrationId: string,
  registrationUrl: string,
  redirectUri: string
): Promise<{ clientId: string; clientSecret: string | null }> {
  // Check cache first
  const { data: existing } = await supabaseAdmin
    .from("proxy_oauth_clients")
    .select("client_id, client_secret")
    .eq("integration_id", integrationId)
    .single();

  if (existing) {
    return {
      clientId: existing.client_id,
      clientSecret: existing.client_secret,
    };
  }

  // Register new client
  const credentials = await registerOAuthClient(registrationUrl, redirectUri);

  // Cache for future use
  await supabaseAdmin.from("proxy_oauth_clients").upsert(
    {
      integration_id: integrationId,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    },
    { onConflict: "integration_id" }
  );

  return credentials;
}
