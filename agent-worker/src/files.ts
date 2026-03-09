import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { logger } from "./logger.js";

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
      logger.error("[files] SWITCHBOARD_MCP_URL not set");
      return null;
    }

    const origin = new URL(mcpUrl).origin;
    const res = await fetch(`${origin}/api/fs`, {
      headers: { Authorization: `Bearer ${agentKey}` },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "[files] GET /api/fs failed");
      return null;
    }

    const data = (await res.json()) as FsApiResponse;
    return data.files.map((f) => ({
      path: f.path,
      content: f.content,
      isFolder: f.isFolder,
    }));
  } catch (err) {
    logger.error({ err }, "[files] Failed to fetch user files");
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
  // SDK may write .json or .jsonl — check both
  const candidates = [`${claudeSessionId}.jsonl`, `${claudeSessionId}.json`];
  logger.info({ claudeSessionId, home: os.homedir(), baseDir }, "[files] findSessionFile: searching");

  // Primary scan: ~/.claude/projects/<project>/sessions/<id>.{json,jsonl}
  try {
    const projects = await fs.readdir(baseDir);
    logger.info({ projectCount: projects.length, projects: projects.join(", ") }, "[files] findSessionFile: found project dirs");
    for (const project of projects) {
      for (const candidate of candidates) {
        const file = path.join(baseDir, project, "sessions", candidate);
        try {
          await fs.stat(file);
          logger.info({ file }, "[files] findSessionFile: found via primary scan");
          return file;
        } catch {
          /* not in this project */
        }
      }
    }
  } catch (err) {
    logger.info({ err }, "[files] findSessionFile: baseDir readdir failed");
  }

  // Recursive fallback: search parent dir (~/.claude/) for the file
  const parentDir = path.dirname(baseDir);
  const candidateSet = new Set(candidates);
  logger.info({ parentDir }, "[files] findSessionFile: primary scan found nothing, recursive search");
  try {
    const entries = (await fs.readdir(parentDir, { recursive: true })) as string[];
    for (const name of entries) {
      if (candidateSet.has(path.basename(name))) {
        const fullPath = path.join(parentDir, name);
        logger.info({ fullPath }, "[files] findSessionFile: found via recursive fallback");
        return fullPath;
      }
    }
  } catch (err) {
    logger.info({ err }, "[files] findSessionFile: recursive fallback failed");
  }

  logger.info("[files] findSessionFile: not found anywhere");
  return null;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    logger.error({ err }, "[files] Cleanup failed");
  }
}
