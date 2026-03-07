import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { supabase } from "./db.js";

const execFileAsync = promisify(execFile);

const BUCKET = "session-workspaces";
const MAX_ARCHIVE_SIZE = 500 * 1024 * 1024; // 500 MB

const TAR_EXCLUSIONS = [
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
  ".next",
  ".cache",
  "dist",
  "build",
  "attachments",
];

/**
 * Archive a workspace directory and upload to Supabase Storage.
 * Returns the storage path, or null if the workspace is empty/too large.
 */
export async function archiveWorkspace(opts: {
  workDir: string;
  userId: string;
  claudeSessionId: string;
}): Promise<string | null> {
  const { workDir, userId, claudeSessionId } = opts;
  const tmpTar = path.join(os.tmpdir(), `workspace-${claudeSessionId}.tar.gz`);
  const storagePath = `${userId}/${claudeSessionId}/workspace.tar.gz`;

  try {
    // Create tar archive
    const excludeArgs = TAR_EXCLUSIONS.flatMap((e) => ["--exclude", e]);
    await execFileAsync("tar", ["-czf", tmpTar, ...excludeArgs, "-C", workDir, "."], {
      timeout: 120_000,
    });

    // Check size
    const stat = await fs.stat(tmpTar);
    if (stat.size > MAX_ARCHIVE_SIZE) {
      console.warn(`[workspace] Archive too large (${Math.round(stat.size / 1024 / 1024)}MB), skipping`);
      return null;
    }

    // Upload to Supabase Storage
    const fileBuffer = await fs.readFile(tmpTar);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: "application/gzip",
        upsert: true,
      });

    if (error) {
      console.error("[workspace] Upload failed:", error.message);
      return null;
    }

    console.log(`[workspace] Archived ${storagePath} (${Math.round(stat.size / 1024)}KB)`);
    return storagePath;
  } catch (err) {
    console.error("[workspace] Archive failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(tmpTar, { force: true }).catch(() => {});
  }
}

/**
 * Restore a workspace from Supabase Storage to a target directory.
 */
export async function restoreWorkspace(opts: {
  archivePath: string;
  targetDir: string;
}): Promise<boolean> {
  const { archivePath, targetDir } = opts;
  const tmpTar = path.join(os.tmpdir(), `restore-${Date.now()}.tar.gz`);

  try {
    // Download from Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(archivePath);

    if (error || !data) {
      console.error("[workspace] Download failed:", error?.message);
      return false;
    }

    // Write to temp file and extract
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.writeFile(tmpTar, buffer);
    await fs.mkdir(targetDir, { recursive: true });
    await execFileAsync("tar", ["-xzf", tmpTar, "-C", targetDir], {
      timeout: 120_000,
    });

    console.log(`[workspace] Restored ${archivePath} → ${targetDir}`);
    return true;
  } catch (err) {
    console.error("[workspace] Restore failed:", err instanceof Error ? err.message : err);
    return false;
  } finally {
    await fs.rm(tmpTar, { force: true }).catch(() => {});
  }
}

/**
 * Delete a workspace archive from Supabase Storage.
 */
export async function deleteWorkspaceArchive(archivePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([archivePath]);
  if (error) {
    console.error("[workspace] Delete failed:", error.message);
  }
}

/**
 * Clean up workspace archives older than the specified number of days.
 * Queries sessions with archives that completed more than `olderThanDays` ago.
 */
export async function cleanupOldArchives(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const BATCH_SIZE = 100;
  let totalCleaned = 0;

  // Paginate until no more results
  while (true) {
    const { data: sessions, error } = await supabase
      .from("agent_sessions")
      .select("id, workspace_archive_path")
      .not("workspace_archive_path", "is", null)
      .lt("completed_at", cutoff)
      .limit(BATCH_SIZE);

    if (error || !sessions?.length) break;

    const paths = sessions.map((s) => s.workspace_archive_path as string);
    const ids = sessions.map((s) => s.id as string);

    // Delete storage objects + null out column in parallel
    const [removeResult] = await Promise.all([
      supabase.storage.from(BUCKET).remove(paths),
      supabase.from("agent_sessions").update({ workspace_archive_path: null }).in("id", ids),
    ]);
    if (removeResult.error) {
      console.error("[workspace] Bulk delete failed:", removeResult.error.message);
    }

    totalCleaned += ids.length;
    if (sessions.length < BATCH_SIZE) break;
  }

  if (totalCleaned > 0) {
    console.log(`[workspace] Cleaned up ${totalCleaned} old archives`);
  }
  return totalCleaned;
}
