import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { validatePermissionsPayload } from "@/lib/permissions";
import { getFullCatalog } from "@/lib/integrations/catalog";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const { id } = await params;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("permissions_mode")
    .eq("id", id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { data: accessRows } = await supabaseAdmin
    .from("user_integration_access")
    .select("integration_id, allowed_tools")
    .eq("user_id", id);

  const catalog = await getFullCatalog();

  return NextResponse.json({
    permissionsMode: profile.permissions_mode,
    integrations: (accessRows ?? []).map((a) => ({
      integrationId: a.integration_id,
      allowedTools: a.allowed_tools,
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      tools: c.tools.map((t) => t.name),
    })),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const { id } = await params;

  // Cannot set own permissions to custom
  if (id === authResult.userId) {
    return NextResponse.json(
      { error: "Cannot modify your own permissions" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { permissionsMode, integrations } = body as {
    permissionsMode: string;
    integrations: Array<{ integrationId: string; allowedTools: string[] }>;
  };

  if (!["full", "custom", "read_only"].includes(permissionsMode)) {
    return NextResponse.json(
      { error: "permissionsMode must be 'full', 'custom', or 'read_only'" },
      { status: 400 }
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (permissionsMode === "full" || permissionsMode === "read_only") {
    // Clear all access rows and set mode
    await supabaseAdmin
      .from("user_integration_access")
      .delete()
      .eq("user_id", id);

    await supabaseAdmin
      .from("profiles")
      .update({ permissions_mode: permissionsMode })
      .eq("id", id);

    return NextResponse.json({
      permissionsMode,
      integrations: [],
    });
  }

  // Validate integrations payload
  if (!Array.isArray(integrations)) {
    return NextResponse.json(
      { error: "integrations must be an array" },
      { status: 400 }
    );
  }

  const validation = await validatePermissionsPayload(integrations);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid permissions", details: validation.errors },
      { status: 400 }
    );
  }

  // Delete existing access rows and insert new ones
  await supabaseAdmin
    .from("user_integration_access")
    .delete()
    .eq("user_id", id);

  if (integrations.length > 0) {
    await supabaseAdmin
      .from("user_integration_access")
      .insert(
        integrations.map((entry) => ({
          user_id: id,
          integration_id: entry.integrationId,
          allowed_tools: entry.allowedTools,
        }))
      );
  }

  await supabaseAdmin
    .from("profiles")
    .update({ permissions_mode: "custom" })
    .eq("id", id);

  return NextResponse.json({
    permissionsMode: "custom",
    integrations,
  });
}
