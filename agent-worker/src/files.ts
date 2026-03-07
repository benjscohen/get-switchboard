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
// Write SwitchboardFiles into a directory
// ---------------------------------------------------------------------------

async function writeFilesInto(dir: string, files: SwitchboardFile[]): Promise<void> {
  for (const file of files) {
    if (file.isFolder || file.content == null) continue;
    const filePath = path.join(dir, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, "utf-8");
  }
}

export async function writeFilesToDisk(
  files: SwitchboardFile[],
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-"));
  await writeFilesInto(tempDir, files);
  return tempDir;
}

export async function writeFilesToStableDir(
  files: SwitchboardFile[],
  stableId: string,
): Promise<string> {
  const dir = path.join(os.tmpdir(), `sb-${stableId}`);
  await fs.mkdir(dir, { recursive: true });
  await writeFilesInto(dir, files);
  return dir;
}

// ---------------------------------------------------------------------------
// Session file lookup (Claude stores transcripts under ~/.claude/projects/)
// ---------------------------------------------------------------------------

export async function findSessionFile(
  claudeSessionId: string,
  baseDir: string = path.join(os.homedir(), ".claude", "projects"),
): Promise<string | null> {
  const target = `${claudeSessionId}.json`;
  console.log(`[files] findSessionFile: id=${claudeSessionId} HOME=${os.homedir()} baseDir=${baseDir}`);

  // Primary scan: ~/.claude/projects/<project>/sessions/<id>.json
  try {
    const projects = await fs.readdir(baseDir);
    console.log(`[files] findSessionFile: found ${projects.length} project dirs: ${projects.join(", ")}`);
    for (const project of projects) {
      const file = path.join(baseDir, project, "sessions", target);
      try {
        await fs.stat(file);
        console.log(`[files] findSessionFile: found via primary scan: ${file}`);
        return file;
      } catch {
        /* not in this project */
      }
    }
  } catch (err) {
    console.log(`[files] findSessionFile: baseDir readdir failed:`, err);
  }

  // Recursive fallback: search parent dir (~/.claude/) for <id>.json
  const parentDir = path.dirname(baseDir);
  console.log(`[files] findSessionFile: primary scan found nothing, recursive search in ${parentDir}`);
  try {
    const entries = (await fs.readdir(parentDir, { recursive: true })) as string[];
    for (const name of entries) {
      if (path.basename(name) === target) {
        const fullPath = path.join(parentDir, name);
        console.log(`[files] findSessionFile: found via recursive fallback: ${fullPath}`);
        return fullPath;
      }
    }
  } catch (err) {
    console.log(`[files] findSessionFile: recursive fallback failed:`, err);
  }

  console.log(`[files] findSessionFile: not found anywhere`);
  return null;
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
