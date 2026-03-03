import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { integrationRegistry } from "@/lib/integrations/registry";

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
  const raw = cookieStore.get("oauth_state")?.value;
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
  cookieStore.delete("oauth_state");

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

  // Upsert connection
  await prisma.connection.upsert({
    where: {
      userId_integrationId: {
        userId: stored.userId,
        integrationId: stored.integrationId,
      },
    },
    create: {
      userId: stored.userId,
      integrationId: stored.integrationId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      tokenType: tokens.token_type ?? "Bearer",
      scope: tokens.scope ?? null,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      tokenType: tokens.token_type ?? "Bearer",
      scope: tokens.scope ?? undefined,
    },
  });

  return NextResponse.redirect(
    `${req.nextUrl.origin}/dashboard?connected=${stored.integrationId}`
  );
}
