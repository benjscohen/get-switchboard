import { NextRequest, NextResponse } from "next/server";
import { integrationRegistry } from "@/lib/integrations/registry";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { OAUTH_STATE_COOKIE, OAUTH_COOKIE_OPTIONS } from "@/lib/oauth-state";
import { getAppOrigin } from "@/lib/app-url";

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

  const integration = integrationRegistry.get(integrationId);
  if (!integration) {
    return NextResponse.json(
      { error: "Unknown integration" },
      { status: 400 }
    );
  }

  const { oauth } = integration;
  const clientId = process.env[oauth.clientIdEnvVar];
  if (!clientId) {
    return NextResponse.json(
      { error: "Integration not configured" },
      { status: 500 }
    );
  }

  // Generate CSRF state
  const state = crypto.randomUUID();

  // Store state + metadata in a cookie
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, JSON.stringify({
    state,
    integrationId,
    userId: authResult.userId,
  }), OAUTH_COOKIE_OPTIONS);

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getAppOrigin(req)}/api/integrations/callback`,
    response_type: "code",
    scope: oauth.scopes.join(" "),
    state,
    ...oauth.extraAuthParams,
  });

  return NextResponse.redirect(`${oauth.authUrl}?${params.toString()}`);
}
