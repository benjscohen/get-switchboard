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
    const access = await verifySessionAccess(id, auth.organizationId, "status");
    if (!access.ok) return access.response;

    // Only idle sessions accept responses
    if (access.session.status !== "idle") {
      return NextResponse.json({ error: "Session is not waiting for input" }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { message } = body as { message?: string };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Insert respond command and user message in parallel
    const [commandResult, messageResult] = await Promise.all([
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
    ]);

    if (commandResult.error) throw commandResult.error;
    if (messageResult.error) throw messageResult.error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to respond to session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
