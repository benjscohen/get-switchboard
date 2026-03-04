import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { integrationRegistry } from "@/lib/integrations/registry";
import { OAUTH_STATE_COOKIE } from "@/lib/oauth-state";
import { encrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard?error=missing_params`
    );
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!raw) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard?error=missing_state`
    );
  }

  let stored: { state: string; integrationId: string; userId: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard?error=invalid_state`
    );
  }

  // Clean up state cookie
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (stored.state !== state) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard?error=state_mismatch`
    );
  }

  const integration = integrationRegistry.get(stored.integrationId);
  if (!integration) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard?error=unknown_integration`
    );
  }

  const { oauth } = integration;
  const clientId = process.env[oauth.clientIdEnvVar];
  const clientSecret = process.env[oauth.clientSecretEnvVar];

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard?error=not_configured`
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${req.nextUrl.origin}/api/integrations/callback`,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/dashboard?error=token_exchange_failed`
    );
  }

  const tokens = await tokenRes.json();

  // Encrypt tokens before storing
  const encryptedAccessToken = encrypt(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : null;

  // Upsert connection
  await supabaseAdmin
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

  return NextResponse.redirect(
    `${req.nextUrl.origin}/dashboard?connected=${stored.integrationId}`
  );
}
