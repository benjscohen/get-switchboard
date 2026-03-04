import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { integrationRegistry } from "@/lib/integrations/registry";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { OAUTH_STATE_COOKIE } from "@/lib/oauth-state";
import { encrypt } from "@/lib/encryption";
import { getAppOrigin } from "@/lib/app-url";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      `${getAppOrigin(req)}/dashboard?error=missing_params`
    );
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!raw) {
    return NextResponse.redirect(
      `${getAppOrigin(req)}/dashboard?error=missing_state`
    );
  }

  let stored: {
    state: string;
    integrationId: string;
    userId: string;
    codeVerifier?: string;
    isProxy?: boolean;
  };
  try {
    stored = JSON.parse(raw);
  } catch {
    return NextResponse.redirect(
      `${getAppOrigin(req)}/dashboard?error=invalid_state`
    );
  }

  // Clean up state cookie
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (stored.state !== state) {
    return NextResponse.redirect(
      `${getAppOrigin(req)}/dashboard?error=state_mismatch`
    );
  }

  const redirectUri = `${getAppOrigin(req)}/api/integrations/callback`;
  let tokenUrl: string;
  let tokenBody: Record<string, string>;

  if (stored.isProxy) {
    // Proxy OAuth integration — get client credentials from DB
    const proxyIntegration = proxyIntegrationRegistry.get(stored.integrationId);
    if (!proxyIntegration?.oauth) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/dashboard?error=unknown_integration`
      );
    }

    const { data: clientRow } = await supabaseAdmin
      .from("proxy_oauth_clients")
      .select("client_id, client_secret")
      .eq("integration_id", stored.integrationId)
      .single();

    if (!clientRow) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/dashboard?error=not_configured`
      );
    }

    tokenUrl = proxyIntegration.oauth.tokenUrl;
    tokenBody = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientRow.client_id,
      ...(clientRow.client_secret ? { client_secret: clientRow.client_secret } : {}),
      ...(stored.codeVerifier ? { code_verifier: stored.codeVerifier } : {}),
    };
  } else {
    // Builtin OAuth integration
    const integration = integrationRegistry.get(stored.integrationId);
    if (!integration) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/dashboard?error=unknown_integration`
      );
    }

    const { oauth } = integration;
    const clientId = process.env[oauth.clientIdEnvVar];
    const clientSecret = process.env[oauth.clientSecretEnvVar];

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/dashboard?error=not_configured`
      );
    }

    tokenUrl = oauth.tokenUrl;
    tokenBody = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    };
  }

  // Exchange code for tokens
  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(tokenBody),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("Token exchange failed:", tokenRes.status, errorBody);
    return NextResponse.redirect(
      `${getAppOrigin(req)}/dashboard?error=token_exchange_failed`
    );
  }

  const tokens = await tokenRes.json();

  // Encrypt tokens before storing
  const encryptedAccessToken = encrypt(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : null;

  // Upsert connection
  const { error: upsertError } = await supabaseAdmin
    .from("connections")
    .upsert(
      {
        user_id: stored.userId,
        integration_id: stored.integrationId,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        token_type: tokens.token_type ?? "Bearer",
        scope: tokens.scope ?? null,
      },
      { onConflict: "user_id,integration_id" }
    );

  if (upsertError) {
    console.error("Connection upsert failed:", upsertError);
    return NextResponse.redirect(
      `${getAppOrigin(req)}/dashboard?error=save_failed`
    );
  }

  return NextResponse.redirect(
    `${getAppOrigin(req)}/dashboard?connected=${stored.integrationId}`
  );
}
