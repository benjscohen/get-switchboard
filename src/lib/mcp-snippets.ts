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

export function generateSnippet(
  origin: string,
  apiKey: string,
  clientId: string
): string {
  const url = `${origin}/api/mcp/sse`;

  switch (clientId) {
    case "claude-desktop":
      return JSON.stringify(
        {
          mcpServers: {
            switchboard: {
              url,
              headers: { Authorization: `Bearer ${apiKey}` },
            },
          },
        },
        null,
        2
      );

    case "claude-code":
      return `claude mcp add switchboard ${url} --header "Authorization: Bearer ${apiKey}"`;

    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            switchboard: {
              url,
              headers: { Authorization: `Bearer ${apiKey}` },
            },
          },
        },
        null,
        2
      );

    default:
      return "";
  }
}
