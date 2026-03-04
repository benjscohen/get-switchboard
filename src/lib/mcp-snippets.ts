export interface McpClient {
  label: string;
  id: string;
  hint: string;
}

export const MCP_CLIENTS: McpClient[] = [
  {
    label: "Claude Desktop",
    id: "claude-desktop",
    hint: "claude_desktop_config.json",
  },
  {
    label: "Claude Code",
    id: "claude-code",
    hint: "CLI command",
  },
  {
    label: "Cursor",
    id: "cursor",
    hint: ".cursor/mcp.json",
  },
];

function buildJsonConfig(
  url: string,
  apiKey: string,
  extraFields?: Record<string, string>
): string {
  return JSON.stringify(
    {
      mcpServers: {
        switchboard: {
          ...extraFields,
          url,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2
  );
}

export function generateSnippet(
  origin: string,
  apiKey: string,
  clientId: string
): string {
  const url = `${origin}/api/mcp/http`;

  switch (clientId) {
    case "claude-desktop":
      return buildJsonConfig(url, apiKey);

    case "claude-code":
      return `claude mcp add --transport http switchboard ${url} --header "Authorization: Bearer ${apiKey}"`;

    case "cursor":
      return buildJsonConfig(url, apiKey, { type: "streamable-http" });

    default:
      return "";
  }
}

export function generatePrompt(
  origin: string,
  apiKey: string,
  clientId: string
): string {
  const snippet = generateSnippet(origin, apiKey, clientId);

  switch (clientId) {
    case "claude-desktop":
      return `Add the Switchboard MCP server to my Claude Desktop config. Merge into claude_desktop_config.json without removing existing servers.\n\n${snippet}`;

    case "claude-code":
      return `Add the Switchboard MCP server to Claude Code by running this command:\n\n${snippet}`;

    case "cursor":
      return `Add the Switchboard MCP server to my Cursor config. Merge into .cursor/mcp.json without removing existing servers.\n\n${snippet}`;

    default:
      return snippet;
  }
}
