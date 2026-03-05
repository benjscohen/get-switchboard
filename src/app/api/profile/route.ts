import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("discovery_mode")
    .eq("id", auth.userId)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }

  return NextResponse.json({ discoveryMode: data.discovery_mode });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  if (typeof body.discoveryMode !== "boolean") {
    return NextResponse.json({ error: "discoveryMode must be a boolean" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ discovery_mode: body.discoveryMode })
    .eq("id", auth.userId);

  if (error) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({ discoveryMode: body.discoveryMode });
}
