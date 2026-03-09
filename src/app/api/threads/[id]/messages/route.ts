import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySessionAccess } from "@/lib/threads/session-helpers";
import type { ThreadMessage } from "@/lib/threads/types";

function mapMessage(row: Record<string, unknown>): ThreadMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as "user" | "assistant" | "tool",
    content: row.content as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    const access = await verifySessionAccess(id, auth.organizationId, auth.userId);
    if (!access.ok) return access.response;

    // Build messages query
    let query = supabaseAdmin
      .from("agent_messages")
      .select("id, session_id, role, content, metadata, created_at")
      .eq("session_id", id);

    // Support incremental fetch via ?after=<ISO timestamp>
    const after = request.nextUrl.searchParams.get("after");
    if (after) {
      query = query.gt("created_at", after);
    }

    // Support pagination via ?before=<message_id>
    const beforeId = request.nextUrl.searchParams.get("before");
    if (beforeId) {
      const { data: beforeMsg } = await supabaseAdmin
        .from("agent_messages")
        .select("created_at")
        .eq("id", beforeId)
        .single();

      if (beforeMsg) {
        query = query.lt("created_at", beforeMsg.created_at);
      }
    }

    const { data: messages, error: messagesError } = await query
      .order("created_at", { ascending: true })
      .limit(200);

    if (messagesError) throw messagesError;

    return NextResponse.json((messages ?? []).map(mapMessage));
  } catch (err) {
    console.error("Failed to fetch messages:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
