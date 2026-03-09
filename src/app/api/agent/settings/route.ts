import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { ALLOWED_MODEL_IDS } from "@/lib/agent-models";

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("preferred_agent_model, show_thinking, chrome_mcp_enabled")
    .eq("id", authResult.userId)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }

  return NextResponse.json({
    preferredModel: data.preferred_agent_model,
    showThinking: data.show_thinking ?? true,
    chromeMcpEnabled: data.chrome_mcp_enabled ?? true,
  });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const body = await request.json();
  const { model, showThinking, chromeMcpEnabled } = body;

  // Build the update patch
  const patch: Record<string, unknown> = {};

  if (model !== undefined) {
    if (!ALLOWED_MODEL_IDS.includes(model)) {
      return NextResponse.json(
        { error: `model must be one of: ${ALLOWED_MODEL_IDS.join(", ")}` },
        { status: 400 }
      );
    }
    patch.preferred_agent_model = model;
  }

  if (showThinking !== undefined) {
    if (typeof showThinking !== "boolean") {
      return NextResponse.json(
        { error: "showThinking must be a boolean" },
        { status: 400 }
      );
    }
    patch.show_thinking = showThinking;
  }

  if (chromeMcpEnabled !== undefined) {
    if (typeof chromeMcpEnabled !== "boolean") {
      return NextResponse.json(
        { error: "chromeMcpEnabled must be a boolean" },
        { status: 400 }
      );
    }
    patch.chrome_mcp_enabled = chromeMcpEnabled;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", authResult.userId);

  if (error) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }

  return NextResponse.json({
    ...(model !== undefined ? { preferredModel: model } : {}),
    ...(showThinking !== undefined ? { showThinking } : {}),
    ...(chromeMcpEnabled !== undefined ? { chromeMcpEnabled } : {}),
  });
}
