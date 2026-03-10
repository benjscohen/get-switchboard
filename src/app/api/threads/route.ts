import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SessionStatus, ThreadSession, KanbanData, SearchResponse } from "@/lib/threads/types";

function mapSession(row: Record<string, unknown>): ThreadSession {
  return {
    id: row.id as string,
    status: row.status as SessionStatus,
    prompt: row.prompt as string,
    result: (row.result as string) ?? null,
    error: (row.error as string) ?? null,
    model: (row.model as string) ?? null,
    totalTurns: (row.total_turns as number) ?? null,
    title: (row.title as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string) ?? null,
  };
}

const THREAD_SELECT_COLUMNS =
  "id, status, prompt, result, error, model, total_turns, title, tags, created_at, updated_at, completed_at";

function baseQuery() {
  return supabaseAdmin.from("agent_sessions");
}

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = request.nextUrl;
  const searchQuery = searchParams.get("search");

  try {
    // Search mode
    if (searchQuery && searchQuery.trim()) {
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
      const offset = (page - 1) * limit;
      const escaped = escapeIlike(searchQuery.trim());

      const { data, error, count } = await baseQuery()
        .select(THREAD_SELECT_COLUMNS, { count: "exact" })
        .eq("organization_id", auth.organizationId)
        .eq("user_id", auth.userId)
        .or(`prompt.ilike.%${escaped}%,title.ilike.%${escaped}%`)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const total = count ?? 0;
      const response: SearchResponse = {
        results: (data ?? []).map(mapSession),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
      return NextResponse.json(response);
    }

    // Kanban mode
    const doneLimit = Math.min(100, Math.max(1, parseInt(searchParams.get("doneLimit") ?? "20", 10)));
    const doneOffset = Math.max(0, parseInt(searchParams.get("doneOffset") ?? "0", 10));

    const [activeResult, waitingResult, doneResult] = await Promise.all([
      baseQuery()
        .select(THREAD_SELECT_COLUMNS, { count: "exact" })
        .eq("organization_id", auth.organizationId)
        .eq("user_id", auth.userId)
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false }),
      baseQuery()
        .select(THREAD_SELECT_COLUMNS, { count: "exact" })
        .eq("organization_id", auth.organizationId)
        .eq("user_id", auth.userId)
        .in("status", ["idle", "failed", "timeout"])
        .order("updated_at", { ascending: false }),
      baseQuery()
        .select(THREAD_SELECT_COLUMNS, { count: "exact" })
        .eq("organization_id", auth.organizationId)
        .eq("user_id", auth.userId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .range(doneOffset, doneOffset + doneLimit - 1),
    ]);

    if (activeResult.error) throw activeResult.error;
    if (waitingResult.error) throw waitingResult.error;
    if (doneResult.error) throw doneResult.error;

    const data: KanbanData = {
      active: (activeResult.data ?? []).map(mapSession),
      waiting: (waitingResult.data ?? []).map(mapSession),
      done: (doneResult.data ?? []).map(mapSession),
      counts: {
        active: activeResult.count ?? activeResult.data?.length ?? 0,
        waiting: waitingResult.count ?? waitingResult.data?.length ?? 0,
        done: doneResult.count ?? doneResult.data?.length ?? 0,
      },
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
        tags: ["web"],
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
