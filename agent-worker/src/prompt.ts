import type { SwitchboardFile } from "./files.js";

// ---------------------------------------------------------------------------
// Slack formatting instructions
// ---------------------------------------------------------------------------

const SLACK_FORMAT_INSTRUCTIONS = `
Format responses for Slack:
- Do NOT use markdown tables (use code blocks for tabular data)
- Keep responses concise for Slack readability
`.trim();

const FILE_UPLOAD_INSTRUCTIONS = `
CRITICAL — How to send files to the user in Slack:

You are running inside a bot framework that intercepts FILE_UPLOAD directives in your response text and uploads the file to the Slack thread. This is the ONLY way to deliver files to the user. They cannot see your filesystem.

Step-by-step:
1. Write the file to disk using the Write tool (use an absolute path, e.g. /tmp/myfile.txt)
2. In your FINAL text response, include the directive FILE_UPLOAD:/absolute/path on its own line
3. The framework strips the directive line and uploads the file to Slack automatically
4. The user sees your clean text + the file attachment

Your final response text MUST look like this:

Here's the file you asked for!
FILE_UPLOAD:/tmp/myfile.txt

Key rules:
- The path MUST be absolute (starts with /)
- Each FILE_UPLOAD: goes on its own line
- Works for any file type: .txt, .csv, .png, .pdf, .py, .json, etc.
- You can include multiple FILE_UPLOAD: lines for multiple files
- If your response is ONLY a file with no message, just write the directive by itself
- NEVER describe the file without including FILE_UPLOAD — the user will not receive it
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
// Vault credential lookup instructions
// ---------------------------------------------------------------------------

const VAULT_CREDENTIALS_INSTRUCTIONS = `
When a task requires credentials or API keys, follow this order:
1. Use Switchboard MCP integrations first — tools like GitHub, Slack, Google, etc. already have the user's OAuth tokens and work without extra credentials.
2. If no MCP integration covers it, check the vault (vault_search_secrets or vault_list_secrets) for stored keys before asking the user.
3. Only ask the user if neither option has what you need.

Exception: for heavy git work (cloning, pushing, branching), check the vault for a GitHub PAT instead of using the GitHub MCP integration, which only covers lightweight operations like issues and PRs.

Never expose secret values in your responses.
`.trim();

// ---------------------------------------------------------------------------
// Feedback instructions
// ---------------------------------------------------------------------------

const FEEDBACK_INSTRUCTIONS = `
If you encounter a bug, confusing behavior, or a missing capability while using Switchboard MCP tools, call submit_feedback to report it. Be specific: include the tool name, what you expected, what actually happened, and any error messages. Also submit feedback if you think of a concrete improvement — describe the use case and what would help. This data goes directly to the Switchboard team to fix issues and improve the platform.
`.trim();

// ---------------------------------------------------------------------------
// Extract /CLAUDE.md from file list
// ---------------------------------------------------------------------------

export function extractClaudeMd(files: SwitchboardFile[]): string | null {
  const entry = files.find((f) => f.path === "/CLAUDE.md");
  return entry?.content ?? null;
}

// ---------------------------------------------------------------------------
// User identity (injected so the agent knows who it's talking to)
// ---------------------------------------------------------------------------

export interface UserIdentity {
  name?: string;
  email?: string;
  slackUserId?: string;
}

// ---------------------------------------------------------------------------
// Build system prompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(
  claudeMdContent: string | null,
  todayDate?: string,
  userIdentity?: UserIdentity,
): string {
  const sections: string[] = [];

  sections.push(
    "You are a helpful AI assistant with full dev environment access and the user's Switchboard integrations via MCP tools. " +
      "You can clone repos, write and run code, edit files, search the web, and use all available tools to help with the user's request.",
  );

  // Inject user identity so the agent knows who "me" is
  if (userIdentity && (userIdentity.name || userIdentity.email || userIdentity.slackUserId)) {
    const lines: string[] = ["The user you are currently speaking with:"];
    if (userIdentity.name) lines.push(`- Name: ${userIdentity.name}`);
    if (userIdentity.email) lines.push(`- Email: ${userIdentity.email}`);
    if (userIdentity.slackUserId) lines.push(`- Slack user ID: <@${userIdentity.slackUserId}> (use this to @mention or DM them)`);
    lines.push('When the user says "me", "my", "send it to me", etc., they mean THIS person. Do not guess or pick a different user.');
    sections.push(lines.join("\n"));
  }

  sections.push(FILE_UPLOAD_INSTRUCTIONS);

  sections.push(SLACK_FORMAT_INSTRUCTIONS);

  const date = todayDate ?? new Date().toISOString().split("T")[0];
  sections.push(buildMemoryInstructions(date));

  sections.push(DEV_ENVIRONMENT_INSTRUCTIONS);

  sections.push(VAULT_CREDENTIALS_INSTRUCTIONS);

  sections.push(
    "Before performing write actions via MCP tools that affect external services (sending emails, Slack messages, creating calendar events, etc.), " +
      "describe what you are about to do and ask the user for confirmation. " +
      "Local file operations (creating files, running scripts, installing packages) do not need confirmation.",
  );

  if (claudeMdContent) {
    sections.push(`The user has provided the following custom instructions:\n\n${claudeMdContent}`);
  }

  sections.push(FEEDBACK_INSTRUCTIONS);

  return sections.join("\n\n");
}
