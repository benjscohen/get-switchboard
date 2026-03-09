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
 * Non-fatal: logs and continues if a file is missing or upload fails.
 */
export async function uploadExtractedFiles(
  uploads: FileUpload[],
  channelId: string,
  threadTs?: string,
  sessionId?: string,
): Promise<void> {
  const tag = sessionId ?? "?";
  await Promise.allSettled(
    uploads.map(async (upload) => {
      const filename = path.basename(upload.path);
      try {
        const content = await fs.readFile(upload.path);
        await slack.uploadFile({ channelId, threadTs, filename, content, title: filename });
        logger.info({ sessionId: tag, filename }, "uploaded FILE_UPLOAD");
      } catch (err) {
        logger.error({ sessionId: tag, path: upload.path, err }, "FILE_UPLOAD failed");
      }
    }),
  );
}
