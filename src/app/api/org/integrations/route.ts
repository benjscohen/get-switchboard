import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";

export async function GET() {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const { data: orgKeys } = await supabaseAdmin
    .from("integration_org_keys")
    .select("integration_id, enabled")
    .eq("organization_id", auth.organizationId);

  const keyMap = new Map(
    (orgKeys ?? []).map((k) => [k.integration_id, k.enabled])
  );

  const integrations = allProxyIntegrations.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    toolCount: i.toolCount,
    configured: keyMap.has(i.id),
    enabled: keyMap.get(i.id) ?? false,
  }));

  return NextResponse.json(integrations);
}

export async function PUT(request: Request) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const { integrationId, apiKey, enabled } = body as {
    integrationId?: string;
    apiKey?: string;
    enabled?: boolean;
  };

  if (!integrationId) {
    return NextResponse.json(
      { error: "integrationId is required" },
      { status: 400 }
    );
  }

  // Validate integration exists
  const valid = allProxyIntegrations.some((i) => i.id === integrationId);
  if (!valid) {
    return NextResponse.json(
      { error: "Unknown integration" },
      { status: 400 }
    );
  }

  // If only toggling enabled/disabled (no new key)
  if (apiKey === undefined && enabled !== undefined) {
    const { error } = await supabaseAdmin
      .from("integration_org_keys")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("organization_id", auth.organizationId)
      .eq("integration_id", integrationId);

    if (error) {
      return NextResponse.json(
        { error: "No key configured to toggle" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return NextResponse.json(
      { error: "apiKey is required" },
      { status: 400 }
    );
  }

  const encrypted = encrypt(apiKey.trim());

  const { error } = await supabaseAdmin
    .from("integration_org_keys")
    .upsert(
      {
        organization_id: auth.organizationId,
        integration_id: integrationId,
        api_key: encrypted,
        enabled: enabled ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,integration_id" }
    );

  if (error) {
    console.error("[org/integrations] upsert error:", error);
    return NextResponse.json(
      { error: "Failed to save key" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(request.url);
  const integrationId = searchParams.get("integrationId");

  if (!integrationId) {
    return NextResponse.json(
      { error: "integrationId is required" },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("integration_org_keys")
    .delete()
    .eq("organization_id", auth.organizationId)
    .eq("integration_id", integrationId);

  return NextResponse.json({ ok: true });
}
