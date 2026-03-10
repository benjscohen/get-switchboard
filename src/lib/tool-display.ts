/**
 * Client-safe utility for displaying MCP tool calls with human-readable names and integration icons.
 */

interface ServerDisplayInfo {
  displayName: string;
  iconPath?: string;
}

const MCP_SERVER_MAP: Record<string, ServerDisplayInfo> = {
  switchboard: { displayName: "Switchboard", iconPath: "/integrations/switchboard.svg" },
  "chrome-devtools": { displayName: "Chrome DevTools", iconPath: "/integrations/chrome.svg" },
  slack: { displayName: "Slack", iconPath: "/integrations/slack.svg" },
  github: { displayName: "GitHub", iconPath: "/integrations/github.svg" },
  Railway: { displayName: "Railway", iconPath: "/integrations/railway.svg" },
  supabase: { displayName: "Supabase" },
  context7: { displayName: "Context7" },
  searchapi: { displayName: "SearchAPI" },
  claude_ai_Figma: { displayName: "Figma" },
  claude_ai_Clay: { displayName: "Clay" },
};

/**
 * Splits `mcp__serverName__toolName` into parts.
 * Returns `{ serverName: null, toolName: raw }` for non-MCP names.
 */
export function parseMcpToolName(raw: string): { serverName: string | null; toolName: string } {
  if (!raw.startsWith("mcp__")) {
    return { serverName: null, toolName: raw };
  }
  const withoutPrefix = raw.slice(5); // remove "mcp__"
  const sepIndex = withoutPrefix.indexOf("__");
  if (sepIndex === -1) {
    return { serverName: null, toolName: raw };
  }
  return {
    serverName: withoutPrefix.slice(0, sepIndex),
    toolName: withoutPrefix.slice(sepIndex + 2),
  };
}

/**
 * Converts `recall_memories` → `Recall memories`, `take-screenshot` → `Take screenshot`.
 */
export function humanizeToolName(name: string): string {
  const words = name.split(/[_-]+/);
  if (words.length === 0) return name;
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Looks up display name and icon path for a known MCP server.
 * Returns `null` for unknown servers.
 */
export function getServerDisplayInfo(serverName: string): ServerDisplayInfo | null {
  return MCP_SERVER_MAP[serverName] ?? null;
}
