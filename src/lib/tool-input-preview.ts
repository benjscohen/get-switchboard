/**
 * Extracts human-readable previews from tool input JSON.
 * Ported from agent-worker/src/streaming.ts — pure function, zero deps.
 */

const MAX_INPUT_PREVIEW = 80;

export function formatToolInputPreview(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const parts: string[] = [];
  const name = toolName.toLowerCase();

  if (name.includes("read") || name === "read") {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("edit") || name.includes("multiedit") || name === "edit") {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("write") || name === "write") {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("grep") || name === "grep") {
    if (input.pattern) parts.push(`"${input.pattern}"`);
    if (input.path) parts.push(`in ${input.path}`);
  } else if (name.includes("glob") || name === "glob") {
    if (input.pattern) parts.push(String(input.pattern));
    if (input.path) parts.push(`in ${input.path}`);
  } else if (name.includes("bash") || name === "bash") {
    if (input.command) parts.push(String(input.command));
  } else if (name.includes("task") || name === "task") {
    if (input.description) parts.push(String(input.description));
  } else if (name.includes("websearch") || name === "websearch") {
    if (input.query) parts.push(`"${input.query}"`);
  } else if (name.includes("webfetch") || name === "webfetch") {
    if (input.url) parts.push(String(input.url));
  } else if (name.includes("notebookedit") || name === "notebookedit") {
    if (input.notebook_path) parts.push(String(input.notebook_path));
  } else if (name === "execute_sql") {
    if (input.sql) parts.push(String(input.sql));
  } else if (name === "query_database" || name === "query-database") {
    if (input.sql) parts.push(String(input.sql));
    else if (input.query) parts.push(String(input.query));
  }

  // Fallback: first string value
  if (parts.length === 0) {
    for (const [, v] of Object.entries(input)) {
      if (typeof v === "string" && v.length > 0) {
        parts.push(v);
        break;
      }
    }
  }

  const preview = parts.join(" ");
  if (preview.length > MAX_INPUT_PREVIEW) {
    return preview.slice(0, MAX_INPUT_PREVIEW - 1) + "\u2026";
  }
  return preview;
}
