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
// Memory instructions
// ---------------------------------------------------------------------------

function buildMemoryInstructions(todayDate: string): string {
  return `
You have a persistent memory system via Switchboard MCP tools. Follow these rules:

*Environment*: Your Switchboard files (memories, /CLAUDE.md, etc.) are copied into this environment at startup for fast local reads — but this environment is ephemeral. Local writes are lost when the session ends. To persist anything, you MUST use Switchboard MCP tools.

1. *Start of conversation*: Call recall_memories (no arguments) BEFORE your first response. This loads your core memory and recent daily logs.

2. *Before finishing your response*: Call save_memory with key "daily/${todayDate}" to append a brief summary of this interaction to today's daily log. Read the existing log first, then append — never overwrite.

3. *When you learn something important*: Call save_memory with key "MEMORY" to update core memory. Read it first, add new info under the right section, write back the full content.

4. *For /CLAUDE.md updates*: Use the Switchboard file_write MCP tool (path: "/CLAUDE.md"). Do NOT write to the local filesystem.

5. *All persistence goes through Switchboard*: Use save_memory, recall_memories, file_write, and file_read MCP tools. Never write memory or .claude files to the local filesystem — they will be lost.

The Switchboard MCP server instructions contain full memory conventions (MEMORY.md structure, daily log format). Follow those conventions.
`.trim();
}

// ---------------------------------------------------------------------------
// Dev environment instructions
// ---------------------------------------------------------------------------

const DEV_ENVIRONMENT_INSTRUCTIONS = `
You have a dev environment with: git, Python 3 (FastAPI, pandas, numpy pre-installed), Node.js 20, PostgreSQL client (psql), Terraform, build tools (gcc/g++/make), SQLite, and common shell utilities.

You have sudo access to install any additional packages:
- System packages: sudo apt-get update && sudo apt-get install -y <package>
- Python: pip install --user or use a venv
- Node: npm install
- Jupyter: pip install --user jupyter

For private GitHub repos or any service requiring credentials:
1. Use the vault_get_secret MCP tool to retrieve the user's stored credentials
2. Configure git auth via environment variable or credential helper
3. Never include secrets in your final response to the user
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

export function buildSystemPrompt(claudeMdContent: string | null, todayDate?: string): string {
  const sections: string[] = [];

  sections.push(
    "You are a helpful AI assistant with full dev environment access and the user's Switchboard integrations via MCP tools. " +
      "You can clone repos, write and run code, edit files, search the web, and use all available tools to help with the user's request.",
  );

  const date = todayDate ?? new Date().toISOString().split("T")[0];
  sections.push(buildMemoryInstructions(date));

  sections.push(DEV_ENVIRONMENT_INSTRUCTIONS);

  sections.push(
    "Before performing write actions via MCP tools that affect external services (sending emails, Slack messages, creating calendar events, etc.), " +
      "describe what you are about to do and ask the user for confirmation. " +
      "Local file operations (creating files, running scripts, installing packages) do not need confirmation.",
  );

  if (claudeMdContent) {
    sections.push(`The user has provided the following custom instructions:\n\n${claudeMdContent}`);
  }

  sections.push(SLACK_FORMAT_INSTRUCTIONS);

  return sections.join("\n\n");
}
