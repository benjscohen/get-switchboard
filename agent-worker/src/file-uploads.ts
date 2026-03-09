import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as slack from "./slack.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// FILE_UPLOAD directive parsing
// ---------------------------------------------------------------------------

const FILE_UPLOAD_RE = /^FILE_UPLOAD:(.*)$/gm;

export interface FileUpload {
  path: string;
}

export interface ExtractResult {
  cleanText: string;
  uploads: FileUpload[];
}

export interface UploadResult {
  path: string;
  filename: string;
  success: boolean;
  error?: string;
}

/**
 * Extract FILE_UPLOAD:/path directives from agent response text.
 * Returns the cleaned text (directives stripped) and the list of file paths.
 */
export function extractFileUploads(text: string): ExtractResult {
  const uploads: FileUpload[] = [];

  const cleanText = text
    .replace(FILE_UPLOAD_RE, (_match, filePath: string) => {
      const trimmed = filePath.trim();
      if (trimmed) {
        uploads.push({ path: trimmed });
      }
      return "";
    })
    // Collapse runs of 3+ newlines (left by stripped directives) into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanText, uploads };
}

/**
 * Upload extracted files to a Slack channel/thread.
 * Returns per-file results so callers can report failures to the user.
 */
export async function uploadExtractedFiles(
  uploads: FileUpload[],
  channelId: string,
  threadTs?: string,
  sessionId?: string,
): Promise<UploadResult[]> {
  const tag = sessionId ?? "?";
  const results = await Promise.allSettled(
    uploads.map(async (upload): Promise<UploadResult> => {
      const filename = path.basename(upload.path);
      try {
        // Verify the file exists and is readable before uploading
        await fs.access(upload.path, fs.constants.R_OK);
        const content = await fs.readFile(upload.path);
        if (content.length === 0) {
          const msg = "File is empty (0 bytes)";
          console.error(`[session ${tag}] FILE_UPLOAD failed for ${upload.path}: ${msg}`);
          return { path: upload.path, filename, success: false, error: msg };
        }
        await slack.uploadFile({ channelId, threadTs, filename, content, title: filename });
        logger.info({ sessionId: tag, filename, bytes: content.length }, "uploaded FILE_UPLOAD");
        return { path: upload.path, filename, success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ sessionId: tag, path: upload.path, err }, "FILE_UPLOAD failed");
        return { path: upload.path, filename, success: false, error: msg };
      }
    }),
  );

  // Unwrap settled results (all are fulfilled since we catch internally)
  return results.map((r) => (r.status === "fulfilled" ? r.value : {
    path: "unknown",
    filename: "unknown",
    success: false,
    error: r.status === "rejected" ? String(r.reason) : "Unknown error",
  }));
}
