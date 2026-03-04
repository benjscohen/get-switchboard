import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import { encrypt } from "@/lib/encryption";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { type, targetId, apiKey } = (await req.json()) as {
    type: "custom-mcp" | "proxy";
    targetId: string;
    apiKey: string;
  };

  if (!type || !targetId || !apiKey) {
    return NextResponse.json(
      { error: "type, targetId, and apiKey are required" },
      { status: 400 }
    );
  }

  if (type === "custom-mcp") {
    // Verify server exists and is accessible (global or user's org)
    const { data: server } = await supabaseAdmin
      .from("custom_mcp_servers")
      .select("id")
      .eq("id", targetId)
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
          server_id: targetId,
          api_key: encrypt(apiKey),
        },
        { onConflict: "user_id,server_id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "proxy") {
    // Validate integration exists and is per_user
    const integration = allProxyIntegrations.find(
      (i) => i.id === targetId && i.keyMode === "per_user"
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
          integration_id: targetId,
          api_key: encrypt(apiKey.trim()),
        },
        { onConflict: "user_id,integration_id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const targetId = searchParams.get("targetId");

  if (!type || !targetId) {
    return NextResponse.json(
      { error: "type and targetId are required" },
      { status: 400 }
    );
  }

  if (type === "custom-mcp") {
    await supabaseAdmin
      .from("custom_mcp_user_keys")
      .delete()
      .eq("user_id", auth.userId)
      .eq("server_id", targetId);
  } else if (type === "proxy") {
    await supabaseAdmin
      .from("proxy_user_keys")
      .delete()
      .eq("user_id", auth.userId)
      .eq("integration_id", targetId);
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
