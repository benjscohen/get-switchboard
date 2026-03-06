import { NextRequest, NextResponse } from "next/server";
import { integrationRegistry } from "@/lib/integrations/registry";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { OAUTH_STATE_COOKIE, OAUTH_COOKIE_OPTIONS } from "@/lib/oauth-state";
import { getAppOrigin } from "@/lib/app-url";
import { generatePkce, getOrRegisterClient } from "@/lib/oauth-pkce";
import { loadIntegrationScopes } from "@/lib/integration-scopes";
import { isUserInScope } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  // Rate limit: 50 req/min per userId
  const rl = checkRateLimit(`connect:${authResult.userId}`, 50, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const integrationId = req.nextUrl.searchParams.get("integration");
  if (!integrationId) {
    return NextResponse.json(
      { error: "Missing integration parameter" },
      { status: 400 }
    );
  }

  // Enforce integration access scopes
  const scopes = await loadIntegrationScopes(authResult.organizationId);
  const scopeId = proxyIntegrationRegistry.has(integrationId)
    ? `proxy:${integrationId}`
    : integrationId;
  if (!isUserInScope(scopes, authResult.userId, authResult.orgRole, scopeId)) {
    return NextResponse.json(
      { error: "You don't have access to this integration" },
      { status: 403 }
    );
  }

  const redirectUri = `${getAppOrigin(req)}/api/integrations/callback`;

  // Check builtin integrations first, then proxy integrations with OAuth
  const integration = integrationRegistry.get(integrationId);
  const proxyIntegration = !integration
    ? proxyIntegrationRegistry.get(integrationId)
    : undefined;

  if (integration) {
    // Builtin OAuth flow (existing)
    const { oauth } = integration;
    const clientId = process.env[oauth.clientIdEnvVar];
    if (!clientId) {
      return NextResponse.json(
        { error: "Integration not configured" },
        { status: 500 }
      );
    }

    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, JSON.stringify({
      state,
      integrationId,
      userId: authResult.userId,
    }), OAUTH_COOKIE_OPTIONS);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: oauth.scopes.join(" "),
      state,
      ...oauth.extraAuthParams,
    });
    if (oauth.optionalScopes?.length) {
      params.set("optional_scope", oauth.optionalScopes.join(" "));
    }

    return NextResponse.redirect(`${oauth.authUrl}?${params.toString()}`);
  }

  if (proxyIntegration?.oauth) {
    const { oauth } = proxyIntegration;
    let clientId: string;

    if (oauth.clientIdEnvVar) {
      // Static OAuth credentials from env vars
      clientId = process.env[oauth.clientIdEnvVar] ?? "";
      if (!clientId) {
        return NextResponse.json(
          { error: "Integration not configured" },
          { status: 500 }
        );
      }
    } else {
      // DCR flow (existing)
      const credentials = await getOrRegisterClient(
        integrationId,
        oauth.registrationUrl!,
        redirectUri
      );
      clientId = credentials.clientId;
    }

    const { codeVerifier, codeChallenge } = await generatePkce();
    const state = crypto.randomUUID();

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, JSON.stringify({
      state,
      integrationId,
      userId: authResult.userId,
      codeVerifier,
      isProxy: true,
    }), OAUTH_COOKIE_OPTIONS);

    const scopeParam = oauth.scopeParamName ?? "scope";
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      [scopeParam]: oauth.scopes.join(oauth.scopeSeparator ?? " "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return NextResponse.redirect(`${oauth.authUrl}?${params.toString()}`);
  }

  return NextResponse.json(
    { error: "Unknown integration" },
    { status: 400 }
  );
}
