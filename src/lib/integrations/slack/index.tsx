import type { ProxyIntegrationConfig } from "../types";

function SlackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path d="M3.8 11.25a1.65 1.65 0 1 1 0-3.3h1.65v1.65a1.65 1.65 0 0 1-1.65 1.65Zm4.35-1.65a1.65 1.65 0 0 1 3.3 0v4.15a1.65 1.65 0 1 1-3.3 0V9.6Z" fill="#E01E5A" />
      <path d="M6.5 3.8a1.65 1.65 0 1 1 3.3 0v1.65H8.15A1.65 1.65 0 0 1 6.5 3.8Zm1.65 4.35a1.65 1.65 0 0 1 0 3.3H4.0a1.65 1.65 0 1 1 0-3.3h4.15Z" fill="#36C5F0" />
      <path d="M14.2 6.5a1.65 1.65 0 1 1 0 3.3h-1.65V8.15A1.65 1.65 0 0 1 14.2 6.5Zm-4.35 1.65a1.65 1.65 0 0 1-3.3 0V4.0a1.65 1.65 0 1 1 3.3 0v4.15Z" fill="#2EB67D" />
      <path d="M11.5 14.2a1.65 1.65 0 1 1-3.3 0v-1.65h1.65a1.65 1.65 0 0 1 1.65 1.65Zm-1.65-4.35a1.65 1.65 0 0 1 0-3.3H14a1.65 1.65 0 1 1 0 3.3H9.85Z" fill="#ECB22E" />
    </svg>
  );
}

export const slackIntegration: ProxyIntegrationConfig = {
  id: "slack",
  name: "Slack",
  description:
    "Search messages, send messages, read channels, and manage canvases in Slack",
  icon: SlackIcon,
  serverUrl: "https://mcp.slack.com/mcp",
  keyMode: "per_user",
  oauth: {
    authUrl: "https://slack.com/oauth/v2_user/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.user.access",
    clientIdEnvVar: "SLACK_CLIENT_ID",
    clientSecretEnvVar: "SLACK_CLIENT_SECRET",
    scopes: [
      "search:read.public",
      "search:read.private",
      "search:read.mpim",
      "search:read.im",
      "search:read.files",
      "search:read.users",
      "chat:write",
      "channels:history",
      "groups:history",
      "mpim:history",
      "im:history",
      "canvases:read",
      "canvases:write",
      "users:read",
      "users:read.email",
    ],
  },
  fallbackTools: [
    {
      name: "slack_search_public",
      description: "Search public Slack channels for messages.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "slack_search_public_and_private",
      description: "Search all Slack channels (public and private) for messages.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "slack_send_message",
      description: "Send a message to a Slack channel.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "Channel ID" },
          text: { type: "string", description: "Message text" },
        },
        required: ["channel_id", "text"],
      },
    },
    {
      name: "slack_read_channel",
      description: "Read recent messages from a Slack channel.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "Channel ID" },
        },
        required: ["channel_id"],
      },
    },
    {
      name: "slack_search_channels",
      description: "Search for Slack channels by name.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Channel name search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "slack_search_users",
      description: "Search for Slack users.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "User search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "slack_read_thread",
      description: "Read replies in a Slack thread.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "Channel ID" },
          thread_ts: { type: "string", description: "Thread timestamp" },
        },
        required: ["channel_id", "thread_ts"],
      },
    },
    {
      name: "slack_read_user_profile",
      description: "Get a Slack user's profile information.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User ID" },
        },
        required: ["user_id"],
      },
    },
    {
      name: "slack_create_canvas",
      description: "Create a new Slack canvas.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Canvas title" },
          content: { type: "string", description: "Canvas content in markdown" },
        },
        required: ["title"],
      },
    },
    {
      name: "slack_read_canvas",
      description: "Read a Slack canvas.",
      inputSchema: {
        type: "object",
        properties: {
          canvas_id: { type: "string", description: "Canvas ID" },
        },
        required: ["canvas_id"],
      },
    },
    {
      name: "slack_send_message_draft",
      description: "Draft a message for user review before sending.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "Channel ID" },
          text: { type: "string", description: "Draft message text" },
        },
        required: ["channel_id", "text"],
      },
    },
    {
      name: "slack_schedule_message",
      description: "Schedule a Slack message for later.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "Channel ID" },
          text: { type: "string", description: "Message text" },
          post_at: { type: "number", description: "Unix timestamp to send at" },
        },
        required: ["channel_id", "text", "post_at"],
      },
    },
  ],
};
