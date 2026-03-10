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

    if (access.session.status !== "completed") {
      return NextResponse.json(
        { error: "Only completed sessions can be reopened" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("agent_sessions")
      .update({ status: "idle", completed_at: null })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to reopen session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
