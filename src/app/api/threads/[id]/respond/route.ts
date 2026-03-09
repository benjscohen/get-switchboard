import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySessionAccess } from "@/lib/threads/session-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    const access = await verifySessionAccess(id, auth.organizationId, auth.userId, "status");
    if (!access.ok) return access.response;

    const status = access.session.status as string;
    const allowedStatuses = ["idle", "completed", "failed", "timeout"];

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "Session is not accepting input" }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { message } = body as { message?: string };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // If session is in a done state, reactivate it to idle
    const isDone = ["completed", "failed", "timeout"].includes(status);

    // Insert respond command, user message, and optionally reactivate session
    const [commandResult, messageResult, ...rest] = await Promise.all([
      supabaseAdmin
        .from("session_commands")
        .insert({
          session_id: id,
          command: "respond",
          payload: { message },
          status: "pending",
          created_by: auth.userId,
        }),
      supabaseAdmin
        .from("agent_messages")
        .insert({
          session_id: id,
          role: "user",
          content: message,
          metadata: { source: "web", userId: auth.userId },
        }),
      ...(isDone
        ? [
            supabaseAdmin
              .from("agent_sessions")
              .update({ status: "idle", completed_at: null })
              .eq("id", id),
          ]
        : []),
    ]);

    if (commandResult.error) throw commandResult.error;
    if (messageResult.error) throw messageResult.error;
    if (rest[0]?.error) throw rest[0].error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to respond to session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
