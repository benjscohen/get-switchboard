import { NextRequest, NextResponse } from "next/server";
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
        .eq("user_id", auth.userId)
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("agent_sessions")
        .select("id, status, prompt, result, error, model, total_turns, created_at, updated_at, completed_at")
        .eq("organization_id", auth.organizationId)
        .eq("user_id", auth.userId)
        .eq("status", "idle")
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("agent_sessions")
        .select("id, status, prompt, result, error, model, total_turns, created_at, updated_at, completed_at")
        .eq("organization_id", auth.organizationId)
        .eq("user_id", auth.userId)
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

const MAX_PROMPT_LENGTH = 10_000;

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    // Parse request — support both JSON and FormData
    let prompt: string;
    let files: File[] = [];
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      prompt = ((formData.get("prompt") as string) ?? "").trim();
      files = formData.getAll("files") as File[];
    } else {
      const body = await request.json();
      prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    }

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt must be under ${MAX_PROMPT_LENGTH} characters` },
        { status: 400 },
      );
    }

    // 1. Create the agent session
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("agent_sessions")
      .insert({
        user_id: auth.userId,
        organization_id: auth.organizationId,
        slack_channel_id: "web",
        slack_thread_ts: null,
        slack_message_ts: null,
        prompt,
        model: null,
        status: "pending",
      })
      .select("id")
      .single();

    if (sessionErr || !session) {
      console.error("Failed to create session:", sessionErr);
      return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
    }

    const sessionId = session.id;

    // 2. Upload files to storage
    const fileAttachments: { name: string; storagePath: string; mimeType: string }[] = [];
    for (const file of files) {
      const storagePath = `${sessionId}/uploads/${crypto.randomUUID()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("session-files")
        .upload(storagePath, buffer, { contentType: file.type });

      if (!uploadErr) {
        fileAttachments.push({ name: file.name, storagePath, mimeType: file.type });
      }
    }

    const metadata: Record<string, unknown> = { source: "web", userId: auth.userId };
    if (fileAttachments.length > 0) metadata.fileAttachments = fileAttachments;

    const payload: Record<string, unknown> = { prompt };
    if (fileAttachments.length > 0) payload.fileAttachments = fileAttachments;

    // 3. Insert user message + start command in parallel
    const [msgResult, cmdResult] = await Promise.all([
      supabaseAdmin.from("agent_messages").insert({
        session_id: sessionId,
        role: "user",
        content: prompt,
        metadata,
      }),
      supabaseAdmin.from("session_commands").insert({
        session_id: sessionId,
        command: "start",
        payload,
        status: "pending",
        created_by: auth.userId,
      }),
    ]);

    if (msgResult.error) {
      console.error("Failed to insert user message:", msgResult.error);
    }
    if (cmdResult.error) {
      console.error("Failed to insert start command:", cmdResult.error);
      return NextResponse.json({ error: "Failed to queue start command" }, { status: 500 });
    }

    return NextResponse.json({ id: sessionId }, { status: 201 });
  } catch (err) {
    console.error("Failed to create thread:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
