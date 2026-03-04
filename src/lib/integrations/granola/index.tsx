import type { ProxyIntegrationConfig } from "../types";

function GranolaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <rect x="3" y="2" width="12" height="14" rx="2" fill="#6C5CE7" />
      <line x1="6" y1="6" x2="12" y2="6" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="9" x2="12" y2="9" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="12" x2="10" y2="12" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export const granolaIntegration: ProxyIntegrationConfig = {
  id: "granola",
  name: "Granola",
  description:
    "AI meeting notes — search, retrieve, and query your Granola meeting transcripts",
  icon: GranolaIcon,
  serverUrl: "https://mcp.granola.ai/mcp",
  keyMode: "per_user",
  oauth: {
    authUrl: "https://mcp-auth.granola.ai/oauth2/authorize",
    tokenUrl: "https://mcp-auth.granola.ai/oauth2/token",
    registrationUrl: "https://mcp-auth.granola.ai/oauth2/register",
    scopes: ["openid", "email", "profile", "offline_access"],
  },
  fallbackTools: [
    {
      name: "list_meetings",
      description: "List recent Granola meetings.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_meetings",
      description: "Get details for specific Granola meetings.",
      inputSchema: {
        type: "object",
        properties: {
          meeting_id: { type: "string", description: "The meeting ID" },
        },
        required: ["meeting_id"],
      },
    },
    {
      name: "get_meeting_transcript",
      description: "Get the full transcript of a Granola meeting.",
      inputSchema: {
        type: "object",
        properties: {
          meeting_id: { type: "string", description: "The meeting ID" },
        },
        required: ["meeting_id"],
      },
    },
    {
      name: "query_granola_meetings",
      description: "Search and query across your Granola meetings.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  ],
};
