import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

const ALLOWED_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"] as const;

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("preferred_agent_model")
    .eq("id", authResult.userId)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }

  return NextResponse.json({ preferredModel: data.preferred_agent_model });
}

export async function PATCH(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const body = await request.json();
  const model = body.model;

  if (!model || !ALLOWED_MODELS.includes(model)) {
    return NextResponse.json(
      { error: `model must be one of: ${ALLOWED_MODELS.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ preferred_agent_model: model })
    .eq("id", authResult.userId);

  if (error) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }

  return NextResponse.json({ preferredModel: model });
}
