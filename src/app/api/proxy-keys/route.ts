import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import { encrypt } from "@/lib/encryption";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const perUserIntegrations = allProxyIntegrations.filter(
    (i) => i.keyMode === "per_user"
  );

  const { data: userKeys } = await supabaseAdmin
    .from("proxy_user_keys")
    .select("integration_id")
    .eq("user_id", auth.userId);

  const keySet = new Set((userKeys ?? []).map((k) => k.integration_id));

  return NextResponse.json(
    perUserIntegrations.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      toolCount: i.toolCount,
      hasPersonalKey: keySet.has(i.id),
    }))
  );
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { integrationId, apiKey } = (await req.json()) as {
    integrationId: string;
    apiKey: string;
  };

  if (!integrationId || !apiKey) {
    return NextResponse.json(
      { error: "integrationId and apiKey are required" },
      { status: 400 }
    );
  }

  // Validate integration exists and is per_user
  const integration = allProxyIntegrations.find(
    (i) => i.id === integrationId && i.keyMode === "per_user"
  );
  if (!integration) {
    return NextResponse.json(
      { error: "Unknown per-user integration" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("proxy_user_keys")
    .upsert(
      {
        user_id: auth.userId,
        integration_id: integrationId,
        api_key: encrypt(apiKey.trim()),
      },
      { onConflict: "user_id,integration_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(req.url);
  const integrationId = searchParams.get("integrationId");

  if (!integrationId) {
    return NextResponse.json(
      { error: "integrationId is required" },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("proxy_user_keys")
    .delete()
    .eq("user_id", auth.userId)
    .eq("integration_id", integrationId);

  return NextResponse.json({ ok: true });
}
