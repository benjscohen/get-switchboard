import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  const { data: server } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id")
    .eq("id", id)
    .single();

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const body = await req.json();
  const { tools } = body as {
    tools: Array<{ toolName: string; enabled: boolean }>;
  };

  if (!Array.isArray(tools)) {
    return NextResponse.json(
      { error: "tools must be an array" },
      { status: 400 }
    );
  }

  for (const tool of tools) {
    await supabaseAdmin
      .from("custom_mcp_tools")
      .update({ enabled: tool.enabled })
      .eq("server_id", id)
      .eq("tool_name", tool.toolName);
  }

  return NextResponse.json({ ok: true, updated: tools.length });
}
