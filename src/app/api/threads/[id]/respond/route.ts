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

    // Parse request — support both JSON and FormData
    let message: string;
    let files: File[] = [];
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      message = (formData.get("message") as string) ?? "";
      files = formData.getAll("files") as File[];
    } else {
      const body = await request.json();
      message = typeof body.message === "string" ? body.message : "";
    }

    if (!message.trim() && files.length === 0) {
      return NextResponse.json({ error: "message or files required" }, { status: 400 });
    }

    // Upload files to storage
    const fileAttachments: { name: string; storagePath: string; mimeType: string }[] = [];
    for (const file of files) {
      const storagePath = `${id}/uploads/${crypto.randomUUID()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("session-files")
        .upload(storagePath, buffer, { contentType: file.type });

      if (!uploadErr) {
        fileAttachments.push({ name: file.name, storagePath, mimeType: file.type });
      }
    }

    // Done sessions need a 'resume' command (no running in-memory process);
    // idle sessions use 'respond' (session is alive in the registry).
    const isDone = ["completed", "failed", "timeout"].includes(status);
    const command = isDone ? "resume" : "respond";

    const payload: Record<string, unknown> = { message: message.trim() };
    if (fileAttachments.length > 0) payload.fileAttachments = fileAttachments;

    const metadata: Record<string, unknown> = { source: "web", userId: auth.userId };
    if (fileAttachments.length > 0) metadata.fileAttachments = fileAttachments;

    // Insert command, user message, and optionally reactivate session
    const [commandResult, messageResult, ...rest] = await Promise.all([
      supabaseAdmin
        .from("session_commands")
        .insert({
          session_id: id,
          command,
          payload,
          status: "pending",
          created_by: auth.userId,
        }),
      supabaseAdmin
        .from("agent_messages")
        .insert({
          session_id: id,
          role: "user",
          content: message.trim(),
          metadata,
        }),
      ...(isDone
        ? [
            supabaseAdmin
              .from("agent_sessions")
              .update({ status: "pending", completed_at: null, close_requested: false })
              .eq("id", id),
          ]
        : [
            supabaseAdmin
              .from("agent_sessions")
              .update({ close_requested: false })
              .eq("id", id),
          ]),
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
