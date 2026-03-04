import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { decrypt } from "@/lib/encryption";
import { discoverTools } from "@/lib/mcp/proxy-client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  const { data: server } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id, server_url, shared_api_key")
    .eq("id", id)
    .single();

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const apiKey = server.shared_api_key ? decrypt(server.shared_api_key) : undefined;

  try {
    const tools = await discoverTools(server.server_url, apiKey);

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
