import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { integrationRegistry } from "@/lib/integrations/registry";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  cookieStore.set("oauth_state", JSON.stringify({
    state,
    integrationId,
    userId: session.user.id,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${req.nextUrl.origin}/api/integrations/callback`,
    response_type: "code",
    scope: oauth.scopes.join(" "),
    state,
    ...oauth.extraAuthParams,
  });

  return NextResponse.redirect(`${oauth.authUrl}?${params.toString()}`);
}
