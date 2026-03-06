import { NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/bearer-auth";
import { parseAndUpsertFiles, bulkWriteFiles } from "@/lib/files/service";

const MAX_FILES = 200;

export async function POST(req: Request) {
  const auth = await authenticateBearer(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Accept either { markdown: string } or { files: Array<{ path, content }> }
  if (body.markdown && typeof body.markdown === "string") {
    const result = await parseAndUpsertFiles(auth, body.markdown);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  }

  if (Array.isArray(body.files)) {
    if (body.files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files (max ${MAX_FILES})` },
        { status: 400 },
      );
    }

    const entries = body.files
      .filter((e: { path?: string }) => e?.path && typeof e.path === "string")
      .map((e: { path: string; content?: string; metadata?: Record<string, unknown> }) => ({
        path: e.path,
        content: e.content ?? "",
        metadata: e.metadata,
      }));

    const result = await bulkWriteFiles(auth, entries);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  }

  return NextResponse.json(
    { error: "Provide either 'markdown' (string) or 'files' (array)" },
    { status: 400 },
  );
}
