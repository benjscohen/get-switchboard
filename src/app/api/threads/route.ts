import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SessionStatus, ThreadSession, KanbanData } from "@/lib/threads/types";

function mapSession(row: Record<string, unknown>): ThreadSession {
  return {
    id: row.id as string,
    status: row.status as SessionStatus,
    prompt: row.prompt as string,
    result: (row.result as string) ?? null,
    error: (row.error as string) ?? null,
    model: (row.model as string) ?? null,
    totalTurns: (row.total_turns as number) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string) ?? null,
  };
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const [activeResult, waitingResult, doneResult] = await Promise.all([
      supabaseAdmin
        .from("agent_sessions")
        .select("id, status, prompt, result, error, model, total_turns, created_at, updated_at, completed_at")
        .eq("organization_id", auth.organizationId)
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("agent_sessions")
        .select("id, status, prompt, result, error, model, total_turns, created_at, updated_at, completed_at")
        .eq("organization_id", auth.organizationId)
        .eq("status", "idle")
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("agent_sessions")
        .select("id, status, prompt, result, error, model, total_turns, created_at, updated_at, completed_at")
        .eq("organization_id", auth.organizationId)
        .in("status", ["completed", "failed", "timeout"])
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(50),
    ]);

    if (activeResult.error) throw activeResult.error;
    if (waitingResult.error) throw waitingResult.error;
    if (doneResult.error) throw doneResult.error;

    const data: KanbanData = {
      active: (activeResult.data ?? []).map(mapSession),
      waiting: (waitingResult.data ?? []).map(mapSession),
      done: (doneResult.data ?? []).map(mapSession),
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch threads:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
