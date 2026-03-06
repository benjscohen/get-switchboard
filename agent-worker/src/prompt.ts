import type { SwitchboardFile } from "./files.js";

// ---------------------------------------------------------------------------
// Slack formatting instructions
// ---------------------------------------------------------------------------

const SLACK_FORMAT_INSTRUCTIONS = `
Format all responses using Slack mrkdwn syntax:
- Bold: *bold* (not **bold**)
- Italic: _italic_ (not *italic*)
- Strikethrough: ~text~
- Code blocks: triple backticks with NO language specifier
- Inline code: \`code\`
- Lists: use the bullet character, not - or *
- Links: <url|text> (not [text](url))
- Do NOT use # headings (unsupported in Slack)
- Do NOT use markdown tables (use code blocks for tabular data)
- Keep responses concise for Slack readability
`.trim();

// ---------------------------------------------------------------------------
// Extract /CLAUDE.md from file list
// ---------------------------------------------------------------------------

export function extractClaudeMd(files: SwitchboardFile[]): string | null {
  const entry = files.find((f) => f.path === "/CLAUDE.md");
  return entry?.content ?? null;
}

// ---------------------------------------------------------------------------
// Build system prompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(claudeMdContent: string | null): string {
  const sections: string[] = [];

  sections.push(
    "You are a helpful AI assistant with access to the user's Switchboard integrations. " +
      "Use the available MCP tools to help with their request. " +
      "You also have read-only access to the user's Switchboard files in the current working directory for context.",
  );

  sections.push(
    "To create or update files and memories, use the MCP tools (save_memory, file_write). " +
      "The local files are read-only context — do not attempt to write to them directly.",
  );

  sections.push(
    "Before performing any write action via MCP tools (sending emails, Slack messages, creating calendar events, updating files, etc.), " +
      "describe what you are about to do and ask the user for confirmation. " +
      "Read-only actions (searching, listing, reading) do not need confirmation.",
  );

  if (claudeMdContent) {
    sections.push(`The user has provided the following custom instructions:\n\n${claudeMdContent}`);
  }

  sections.push(SLACK_FORMAT_INSTRUCTIONS);

  return sections.join("\n\n");
}
