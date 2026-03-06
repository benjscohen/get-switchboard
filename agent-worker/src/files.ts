import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwitchboardFile {
  path: string;
  content: string | null;
  isFolder: boolean;
}

interface FsApiResponse {
  markdown: string;
  files: Array<{
    id: string;
    path: string;
    name: string;
    isFolder: boolean;
    content: string | null;
    mimeType: string;
  }>;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Fetch user files from Switchboard API
// ---------------------------------------------------------------------------

export async function fetchUserFiles(
  agentKey: string,
): Promise<SwitchboardFile[] | null> {
  try {
    const mcpUrl = process.env.SWITCHBOARD_MCP_URL;
    if (!mcpUrl) {
      console.error("[files] SWITCHBOARD_MCP_URL not set");
      return null;
    }

    const origin = new URL(mcpUrl).origin;
    const res = await fetch(`${origin}/api/fs`, {
      headers: { Authorization: `Bearer ${agentKey}` },
    });

    if (!res.ok) {
      console.error(`[files] GET /api/fs failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as FsApiResponse;
    return data.files.map((f) => ({
      path: f.path,
      content: f.content,
      isFolder: f.isFolder,
    }));
  } catch (err) {
    console.error("[files] Failed to fetch user files:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write files to a temporary directory
// ---------------------------------------------------------------------------

export async function writeFilesToDisk(
  files: SwitchboardFile[],
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-"));

  for (const file of files) {
    if (file.isFolder || file.content == null) continue;

    const filePath = path.join(tempDir, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, "utf-8");
  }

  return tempDir;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    console.error("[files] Cleanup failed:", err);
  }
}
