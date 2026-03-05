import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { integrationRegistry } from "@/lib/integrations/registry";

// GET /api/integrations/tool-groups?integrationId=hubspot-crm
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const integrationId = req.nextUrl.searchParams.get("integrationId");
  if (!integrationId) {
    return NextResponse.json({ error: "integrationId required" }, { status: 400 });
  }

  const integration = integrationRegistry.get(integrationId);
  if (!integration?.toolGroups) {
    return NextResponse.json({ error: "Integration has no tool groups" }, { status: 404 });
  }

  const { data } = await supabaseAdmin
    .from("connections")
    .select("enabled_tool_groups")
    .eq("user_id", auth.userId)
    .eq("integration_id", integrationId)
    .single();

  return NextResponse.json({
    toolGroups: integration.toolGroups,
    enabledGroups: data?.enabled_tool_groups ?? null,
  });
}

// PATCH /api/integrations/tool-groups
// Body: { integrationId: string, enabledGroups: string[] | null }
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const body = await req.json();
  const { integrationId, enabledGroups } = body;

  if (!integrationId) {
    return NextResponse.json({ error: "integrationId required" }, { status: 400 });
  }

  const integration = integrationRegistry.get(integrationId);
  if (!integration?.toolGroups) {
    return NextResponse.json({ error: "Integration has no tool groups" }, { status: 404 });
  }

  if (enabledGroups !== null) {
    const validKeys = Object.keys(integration.toolGroups);
    const invalid = (enabledGroups as string[]).filter((k: string) => !validKeys.includes(k));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Invalid group keys: ${invalid.join(", ")}` }, { status: 400 });
    }
  }

  const { error } = await supabaseAdmin
    .from("connections")
    .update({ enabled_tool_groups: enabledGroups })
    .eq("user_id", auth.userId)
    .eq("integration_id", integrationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, enabledGroups });
}
