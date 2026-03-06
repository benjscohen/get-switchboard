import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import { encrypt } from "@/lib/encryption";
import { discoverTools, type ProxyAuth } from "@/lib/mcp/proxy-client";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { type, targetId, apiKey, customHeaders } = (await req.json()) as {
    type: "custom-mcp" | "proxy";
    targetId: string;
    apiKey?: string;
    customHeaders?: Record<string, string>;
  };

  if (!type || !targetId || (!apiKey && !customHeaders)) {
    return NextResponse.json(
      { error: "type, targetId, and either apiKey or customHeaders are required" },
      { status: 400 }
    );
  }

  if (type === "custom-mcp") {
    // Verify server exists and is accessible (global or user's org)
    const { data: server } = await supabaseAdmin
      .from("custom_mcp_servers")
      .select("id, server_url, auth_type")
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

    // Build upsert payload: either apiKey or customHeaders
    const upsertData: Record<string, unknown> = {
      user_id: auth.userId,
      server_id: targetId,
    };

    if (customHeaders && Object.keys(customHeaders).length > 0) {
      const encryptedHeaders: Record<string, string> = {};
      for (const [hk, hv] of Object.entries(customHeaders)) {
        encryptedHeaders[hk] = encrypt(hv);
      }
      upsertData.custom_headers = encryptedHeaders;
      upsertData.api_key = null;
    } else if (apiKey) {
      upsertData.api_key = encrypt(apiKey);
      upsertData.custom_headers = null;
    }

    const { error } = await supabaseAdmin
      .from("custom_mcp_user_keys")
      .upsert(upsertData, { onConflict: "user_id,server_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no tools discovered yet, trigger discovery
    const { count } = await supabaseAdmin
      .from("custom_mcp_tools")
      .select("id", { count: "exact", head: true })
      .eq("server_id", targetId);

    if (count === 0) {
      try {
        let discoveryAuth: ProxyAuth;
        if (customHeaders && Object.keys(customHeaders).length > 0) {
          discoveryAuth = { headers: customHeaders };
        } else if (apiKey) {
          discoveryAuth = apiKey;
        }

        const tools = await discoverTools(server.server_url, discoveryAuth);

        if (tools.length > 0) {
          await supabaseAdmin.from("custom_mcp_tools").insert(
            tools.map((t) => ({
              server_id: targetId,
              tool_name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
              enabled: true,
            }))
          );
        }

        await supabaseAdmin
          .from("custom_mcp_servers")
          .update({
            last_discovered_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", targetId);

        return NextResponse.json({ ok: true, discoveredTools: tools.length });
      } catch {
        // Discovery failed but key was saved successfully — don't fail the request
      }
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
          api_key: encrypt(apiKey!.trim()),
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
