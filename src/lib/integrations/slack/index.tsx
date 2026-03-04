import type { ProxyIntegrationConfig } from "../types";

function SlackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" className="shrink-0">
      <path d="M3.362 10.11c0 .926-.756 1.681-1.681 1.681S0 11.036 0 10.111.756 8.43 1.68 8.43h1.682zm.846 0c0-.924.756-1.68 1.681-1.68s1.681.756 1.681 1.68v4.21c0 .924-.756 1.68-1.68 1.68a1.685 1.685 0 0 1-1.682-1.68z" fill="#E01E5A" />
      <path d="M5.89 3.362c-.926 0-1.682-.756-1.682-1.681S4.964 0 5.89 0s1.68.756 1.68 1.68v1.682zm0 .846c.924 0 1.68.756 1.68 1.681S6.814 7.57 5.89 7.57H1.68C.757 7.57 0 6.814 0 5.89c0-.926.756-1.682 1.68-1.682z" fill="#36C5F0" />
      <path d="M12.638 5.89c0-.926.755-1.682 1.68-1.682S16 4.964 16 5.889s-.756 1.681-1.68 1.681h-1.681zm-.848 0c0 .924-.755 1.68-1.68 1.68A1.685 1.685 0 0 1 8.43 5.89V1.68C8.43.757 9.186 0 10.11 0c.926 0 1.681.756 1.681 1.68z" fill="#2EB67D" />
      <path d="M10.11 12.638c.926 0 1.682.756 1.682 1.681S11.036 16 10.11 16s-1.681-.756-1.681-1.68v-1.682zm0-.847c-.924 0-1.68-.755-1.68-1.68s.756-1.681 1.68-1.681h4.21c.924 0 1.68.756 1.68 1.68 0 .926-.756 1.681-1.68 1.681z" fill="#ECB22E" />
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
    scopeParamName: "user_scope",
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
