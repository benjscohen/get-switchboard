import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { integrationRegistry } from "@/lib/integrations/registry";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { OAUTH_STATE_COOKIE } from "@/lib/oauth-state";
import { encrypt } from "@/lib/encryption";
import { getAppOrigin } from "@/lib/app-url";
import { loadIntegrationScopes } from "@/lib/integration-scopes";
import { isUserInScope } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      `${getAppOrigin(req)}/tools?error=missing_params`
    );
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!raw) {
    return NextResponse.redirect(
      `${getAppOrigin(req)}/tools?error=missing_state`
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
      `${getAppOrigin(req)}/tools?error=invalid_state`
    );
  }

  // Clean up state cookie
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (stored.state !== state) {
    return NextResponse.redirect(
      `${getAppOrigin(req)}/tools?error=state_mismatch`
    );
  }

  // Defense-in-depth: verify the user still has access to this integration
  const { data: userProfile } = await supabaseAdmin
    .from("profiles")
    .select("organization_id, org_role")
    .eq("id", stored.userId)
    .single();

  if (userProfile?.organization_id) {
    const scopes = await loadIntegrationScopes(userProfile.organization_id);
    const scopeId = stored.isProxy
      ? `proxy:${stored.integrationId}`
      : stored.integrationId;
    if (!isUserInScope(scopes, stored.userId, userProfile.org_role, scopeId)) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/tools?error=access_denied`
      );
    }
  }

  const redirectUri = `${getAppOrigin(req)}/api/integrations/callback`;
  let tokenUrl: string;
  let tokenBody: Record<string, string>;

  if (stored.isProxy) {
    // Proxy OAuth integration — get client credentials from DB
    const proxyIntegration = proxyIntegrationRegistry.get(stored.integrationId);
    if (!proxyIntegration?.oauth) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/tools?error=unknown_integration`
      );
    }

    const { oauth } = proxyIntegration;
    let proxyClientId: string;
    let proxyClientSecret: string | undefined;

    if (oauth.clientIdEnvVar) {
      // Static OAuth credentials from env vars
      proxyClientId = process.env[oauth.clientIdEnvVar] ?? "";
      proxyClientSecret = oauth.clientSecretEnvVar
        ? process.env[oauth.clientSecretEnvVar]
        : undefined;
      if (!proxyClientId) {
        return NextResponse.redirect(
          `${getAppOrigin(req)}/tools?error=not_configured`
        );
      }
    } else {
      // DCR flow — get credentials from DB
      const { data: clientRow } = await supabaseAdmin
        .from("proxy_oauth_clients")
        .select("client_id, client_secret")
        .eq("integration_id", stored.integrationId)
        .single();

      if (!clientRow) {
        return NextResponse.redirect(
          `${getAppOrigin(req)}/tools?error=not_configured`
        );
      }
      proxyClientId = clientRow.client_id;
      proxyClientSecret = clientRow.client_secret ?? undefined;
    }

    tokenUrl = oauth.tokenUrl;
    tokenBody = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: proxyClientId,
      ...(proxyClientSecret ? { client_secret: proxyClientSecret } : {}),
      ...(stored.codeVerifier ? { code_verifier: stored.codeVerifier } : {}),
    };
  } else {
    // Builtin OAuth integration
    const integration = integrationRegistry.get(stored.integrationId);
    if (!integration) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/tools?error=unknown_integration`
      );
    }

    const { oauth } = integration;
    const clientId = process.env[oauth.clientIdEnvVar];
    const clientSecret = process.env[oauth.clientSecretEnvVar];

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${getAppOrigin(req)}/tools?error=not_configured`
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
      `${getAppOrigin(req)}/tools?error=token_exchange_failed`
    );
  }

  const tokens = await tokenRes.json();

  // Slack v2 nests user tokens under authed_user
  // Slack v2 nests under authed_user; Intercom uses "token" field
  const accessToken: string | undefined =
    tokens.access_token ?? tokens.authed_user?.access_token ?? tokens.token;
  const refreshToken: string | undefined =
    tokens.refresh_token ?? tokens.authed_user?.refresh_token;
  const expiresIn: number | undefined =
    tokens.expires_in ?? tokens.authed_user?.expires_in;
  const tokenType: string | undefined =
    tokens.token_type ?? tokens.authed_user?.token_type;
  const scope: string | undefined =
    tokens.scope ?? tokens.authed_user?.scope;

  // Capture provider user ID (e.g. Slack's authed_user.id)
  const providerUserId: string | undefined =
    tokens.authed_user?.id ?? tokens.user_id;

  if (!accessToken) {
    console.error("No access token in response:", JSON.stringify(tokens));
    return NextResponse.redirect(
      `${getAppOrigin(req)}/tools?error=token_exchange_failed`
    );
  }

  // Encrypt tokens before storing
  const encryptedAccessToken = encrypt(accessToken);
  const encryptedRefreshToken = refreshToken
    ? encrypt(refreshToken)
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
        expires_at: expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
        token_type: tokenType ?? "Bearer",
        scope: scope ?? null,
        provider_user_id: providerUserId ?? null,
      },
      { onConflict: "user_id,integration_id" }
    );

  if (upsertError) {
    console.error("Connection upsert failed:", upsertError);
    return NextResponse.redirect(
      `${getAppOrigin(req)}/tools?error=save_failed`
    );
  }

  return NextResponse.redirect(
    `${getAppOrigin(req)}/tools?connected=${stored.integrationId}`
  );
}
