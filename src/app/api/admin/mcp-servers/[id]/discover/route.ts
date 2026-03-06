import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";
import { discoverTools, type ProxyAuth } from "@/lib/mcp/proxy-client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  const { data: server } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id, server_url, shared_api_key, key_mode, auth_type, custom_headers")
    .eq("id", id)
    .single();

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  let discoveryAuth: ProxyAuth;
  if (server.auth_type === "custom_headers") {
    // Resolve custom headers: shared values from server, or admin's personal values for per_user mode
    const hdrs: Record<string, string> = {};
    if (Array.isArray(server.custom_headers)) {
      for (const h of server.custom_headers as Array<{ key: string; value?: string }>) {
        if (h.key && h.value) hdrs[h.key] = decrypt(h.value);
      }
    }
    if (server.key_mode === "per_user") {
      // Try the admin's own personal headers
      const { data: userKey } = await supabaseAdmin
        .from("custom_mcp_user_keys")
        .select("custom_headers")
        .eq("user_id", auth.userId)
        .eq("server_id", id)
        .single();

      if (userKey?.custom_headers && typeof userKey.custom_headers === "object") {
        for (const [hk, hv] of Object.entries(userKey.custom_headers as Record<string, string>)) {
          hdrs[hk] = decrypt(hv);
        }
      }

      if (Object.keys(hdrs).length === 0) {
        return NextResponse.json(
          { error: "Add your personal headers first (via dashboard) before refreshing tools" },
          { status: 400 }
        );
      }
    }
    if (Object.keys(hdrs).length > 0) discoveryAuth = { headers: hdrs };
  } else if (server.shared_api_key) {
    discoveryAuth = decrypt(server.shared_api_key);
  } else if (server.key_mode === "per_user") {
    // For per_user servers, try the admin's own personal key
    const { data: userKey } = await supabaseAdmin
      .from("custom_mcp_user_keys")
      .select("api_key")
      .eq("user_id", auth.userId)
      .eq("server_id", id)
      .single();

    if (!userKey?.api_key) {
      return NextResponse.json(
        { error: "Add your personal API key first (via dashboard) before refreshing tools" },
        { status: 400 }
      );
    }
    discoveryAuth = decrypt(userKey.api_key);
  }

  try {
    const tools = await discoverTools(server.server_url, discoveryAuth);

    // Upsert discovered tools (new ones added as disabled, existing ones updated)
    for (const tool of tools) {
      await supabaseAdmin
        .from("custom_mcp_tools")
        .upsert(
          {
            server_id: id,
            tool_name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          },
          { onConflict: "server_id,tool_name" }
        );
    }

    await supabaseAdmin
      .from("custom_mcp_servers")
      .update({
        last_discovered_at: new Date().toISOString(),
        status: "active",
        last_error: null,
      })
      .eq("id", id);

    return NextResponse.json({
      discovered: tools.length,
      tools: tools.map((t) => ({ toolName: t.name, description: t.description })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    await supabaseAdmin
      .from("custom_mcp_servers")
      .update({ status: "error", last_error: message })
      .eq("id", id);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
