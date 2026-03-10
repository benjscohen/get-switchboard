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
 * Maps tool name prefixes (from call_tool's inner tool_name) to integration display info.
 * Sorted longest-first for correct prefix matching.
 */
const INTEGRATION_ICON_MAP: Array<{ prefix: string; displayName: string; iconPath?: string }> = [
  { prefix: "google_calendar", displayName: "Google Calendar", iconPath: "/integrations/google.svg" },
  { prefix: "google_sheets", displayName: "Google Sheets", iconPath: "/integrations/google.svg" },
  { prefix: "google_slides", displayName: "Google Slides", iconPath: "/integrations/google.svg" },
  { prefix: "google_drive", displayName: "Google Drive", iconPath: "/integrations/google-drive.svg" },
  { prefix: "google_gmail", displayName: "Gmail", iconPath: "/integrations/gmail.svg" },
  { prefix: "google_docs", displayName: "Google Docs", iconPath: "/integrations/google.svg" },
  { prefix: "google_ads", displayName: "Google Ads", iconPath: "/integrations/google.svg" },
  { prefix: "linkedin_ads", displayName: "LinkedIn Ads" },
  { prefix: "salesforce", displayName: "Salesforce", iconPath: "/integrations/salesforce.svg" },
  { prefix: "shortcut", displayName: "Shortcut", iconPath: "/integrations/shortcut.svg" },
  { prefix: "granola", displayName: "Granola", iconPath: "/integrations/granola.svg" },
  { prefix: "hubspot", displayName: "HubSpot", iconPath: "/integrations/hubspot.svg" },
  { prefix: "railway", displayName: "Railway", iconPath: "/integrations/railway.svg" },
  { prefix: "datadog", displayName: "Datadog" },
  { prefix: "notion", displayName: "Notion", iconPath: "/integrations/notion.svg" },
  { prefix: "github", displayName: "GitHub", iconPath: "/integrations/github.svg" },
  { prefix: "slack", displayName: "Slack", iconPath: "/integrations/slack.svg" },
  { prefix: "asana", displayName: "Asana", iconPath: "/integrations/asana.svg" },
  { prefix: "gong", displayName: "Gong", iconPath: "/integrations/gong.svg" },
  { prefix: "jira", displayName: "Jira", iconPath: "/integrations/jira.svg" },
];

export interface CallToolDisplayInfo {
  toolName: string;
  displayName: string;
  integrationName: string | null;
  iconPath?: string;
  serverName?: string;
}

/**
 * Resolves a `call_tool` message's content JSON to extract the actual inner tool name,
 * its integration, and icon. Returns `null` if content can't be parsed.
 */
export function resolveCallToolDisplay(content: string): CallToolDisplayInfo | null {
  let toolName: string;
  try {
    const parsed = JSON.parse(content);
    toolName = parsed.tool_name ?? parsed.toolName;
    if (typeof toolName !== "string" || !toolName) return null;
  } catch {
    return null;
  }

  // Check for proxy double-underscore format: "serverSlug__actionName"
  const dunderIdx = toolName.indexOf("__");
  if (dunderIdx > 0) {
    const serverSlug = toolName.slice(0, dunderIdx);
    const actionPart = toolName.slice(dunderIdx + 2);
    // Look up integration by slug
    const match = INTEGRATION_ICON_MAP.find((e) => e.prefix === serverSlug);
    if (match) {
      return {
        toolName,
        displayName: humanizeToolName(actionPart),
        integrationName: match.displayName,
        iconPath: match.iconPath,
        serverName: serverSlug,
      };
    }
    // Unknown server via proxy — humanize the slug as integration name
    return {
      toolName,
      displayName: humanizeToolName(actionPart),
      integrationName: humanizeToolName(serverSlug),
      serverName: serverSlug,
    };
  }

  // Prefix match against INTEGRATION_ICON_MAP (already sorted longest-first)
  for (const entry of INTEGRATION_ICON_MAP) {
    if (toolName.startsWith(entry.prefix + "_") || toolName === entry.prefix) {
      const actionPart = toolName.slice(entry.prefix.length + 1) || toolName;
      return {
        toolName,
        displayName: humanizeToolName(actionPart),
        integrationName: entry.displayName,
        iconPath: entry.iconPath,
      };
    }
  }

  // Platform / unknown tool — humanize full name, use switchboard icon
  return {
    toolName,
    displayName: humanizeToolName(toolName),
    integrationName: null,
    iconPath: "/integrations/switchboard.svg",
  };
}

/**
 * Resolves a `discover_tools` message's content to a contextual display label.
 */
export function resolveDiscoverToolsDisplay(content: string): string {
  try {
    const parsed = JSON.parse(content);
    const query = parsed.query ?? parsed.integration;
    if (typeof query === "string" && query) {
      return `Discover: ${query}`;
    }
  } catch {
    // ignore
  }
  return "Browse integrations";
}

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

/**
 * Extracts a human-readable input preview from a tool message.
 * Handles call_tool (extracts inner tool), discover_tools, recall_memories, etc.
 */
export function getToolInputPreview(
  toolName: string,
  content: string,
  formatFn: (name: string, input: Record<string, unknown>) => string,
): string {
  const parsed = parseMcpToolName(toolName);
  const inner = parsed.toolName;

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content);
    if (typeof json !== "object" || json === null) return "";
  } catch {
    return "";
  }

  // call_tool: extract inner tool name + arguments
  if (inner === "call_tool") {
    const innerName = String(json.tool_name ?? json.toolName ?? "");
    const args = (json.arguments ?? json.args ?? {}) as Record<string, unknown>;
    if (innerName) return formatFn(innerName, args);
    return "";
  }

  // discover_tools
  if (inner === "discover_tools") {
    const q = json.query ?? json.integration;
    return typeof q === "string" && q ? q : "";
  }

  // recall_memories
  if (inner === "recall_memories") {
    const q = json.query;
    return typeof q === "string" && q ? q : "loading context";
  }

  // save_memory
  if (inner === "save_memory") {
    const key = json.key;
    return typeof key === "string" && key ? key : "";
  }

  // Default: pass content directly to format function
  return formatFn(inner, json);
}
