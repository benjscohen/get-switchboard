import { NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/bearer-auth";
import { formatFilesAsMarkdown } from "@/lib/files/service";

export async function GET(req: Request) {
  const auth = await authenticateBearer(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await formatFilesAsMarkdown(auth);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
