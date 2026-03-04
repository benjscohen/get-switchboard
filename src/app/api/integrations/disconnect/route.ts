import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authenticated) return authResult.response;

  const body = await req.json();
  const { integrationId } = body as { integrationId?: string };

  if (!integrationId) {
    return NextResponse.json(
      { error: "Missing integrationId" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  await supabase
    .from("connections")
    .delete()
    .eq("user_id", authResult.userId)
    .eq("integration_id", integrationId);

  return NextResponse.json({ success: true });
}
