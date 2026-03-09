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
    const access = await verifySessionAccess(id, auth.organizationId, auth.userId, "status");
    if (!access.ok) return access.response;

    if (access.session.status !== "idle") {
      return NextResponse.json(
        { error: "Only idle sessions can be marked as done" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("agent_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to complete session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
