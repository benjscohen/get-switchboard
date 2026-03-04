import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  // List active custom MCP servers: global (null org_id) + user's org
  const { data: servers } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id, name, slug, description, auth_type, key_mode, user_key_instructions, status, organization_id")
    .eq("status", "active")
    .or(`organization_id.is.null,organization_id.eq.${auth.organizationId}`)
    .order("name");

  const { data: userKeys } = await supabaseAdmin
    .from("custom_mcp_user_keys")
    .select("server_id")
    .eq("user_id", auth.userId);

  const keySet = new Set((userKeys ?? []).map((k) => k.server_id));

  // Check which servers have shared keys
  const serverIds = (servers ?? []).map((s) => s.id);
  const { data: serversWithKeys } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id")
    .in("id", serverIds)
    .not("shared_api_key", "is", null);

  const sharedKeySet = new Set((serversWithKeys ?? []).map((s) => s.id));

  return NextResponse.json(
    (servers ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      authType: s.auth_type,
      keyMode: s.key_mode ?? "shared",
      userKeyInstructions: s.user_key_instructions ?? null,
      hasPersonalKey: keySet.has(s.id),
      hasSharedKey: sharedKeySet.has(s.id),
      isOrgServer: s.organization_id !== null,
    }))
  );
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { serverId, apiKey } = (await req.json()) as {
    serverId: string;
    apiKey: string;
  };

  if (!serverId || !apiKey) {
    return NextResponse.json(
      { error: "serverId and apiKey are required" },
      { status: 400 }
    );
  }

  // Verify server exists and is accessible (global or user's org)
  const { data: server } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id")
    .eq("id", serverId)
    .eq("status", "active")
    .or(`organization_id.is.null,organization_id.eq.${auth.organizationId}`)
    .single();

  if (!server) {
    return NextResponse.json(
      { error: "MCP server not found" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("custom_mcp_user_keys")
    .upsert(
      {
        user_id: auth.userId,
        server_id: serverId,
        api_key: encrypt(apiKey),
      },
      { onConflict: "user_id,server_id" }
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
  const serverId = searchParams.get("serverId");

  if (!serverId) {
    return NextResponse.json(
      { error: "serverId is required" },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("custom_mcp_user_keys")
    .delete()
    .eq("user_id", auth.userId)
    .eq("server_id", serverId);

  return NextResponse.json({ ok: true });
}
