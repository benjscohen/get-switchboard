import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySessionAccess } from "@/lib/threads/session-helpers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    const access = await verifySessionAccess(id, auth.organizationId, "status");
    if (!access.ok) return access.response;

    // Only active sessions can be stopped
    if (!["pending", "running", "idle"].includes(access.session.status as string)) {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }

    // Insert stop command
    const { error: insertError } = await supabaseAdmin
      .from("session_commands")
      .insert({
        session_id: id,
        command: "stop",
        payload: {},
        status: "pending",
        created_by: auth.userId,
      });

    if (insertError) throw insertError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to stop session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
