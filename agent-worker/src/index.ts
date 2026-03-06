import { App, LogLevel } from "@slack/bolt";
import {
  processMessage,
  recoverStaleSessions,
  getActiveSessionCount,
} from "./agent.js";
import type { SlackFile } from "./types.js";

// ---------------------------------------------------------------------------
// Deduplication: track event IDs for 5 minutes to prevent double-processing
// ---------------------------------------------------------------------------

const processedEvents = new Set<string>();

function markProcessed(eventId: string): boolean {
  if (processedEvents.has(eventId)) {
    return false;
  }
  processedEvents.add(eventId);
  setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000);
  return true;
}

// ---------------------------------------------------------------------------
// Slack Bolt app (Socket Mode — no public URL needed)
// ---------------------------------------------------------------------------

const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_SOCKET_TOKEN!,
  socketMode: true,
  logLevel: LogLevel.WARN,
});

// Handle all DMs
app.message(async ({ message, body }) => {
  // Only handle plain user messages in DMs
  if (message.subtype || !("user" in message) || !message.user) return;
  if (message.channel_type !== "im") return;

  // Deduplicate
  const eventId = body.event_id;
  if (!markProcessed(eventId)) return;

  const slackUserId = message.user;
  const channelId = message.channel;
  const text = ("text" in message ? message.text : "") || "";
  const messageTs = message.ts;
  const threadTs = "thread_ts" in message ? message.thread_ts : undefined;

  // Extract file attachments
  const files: SlackFile[] = [];
  if ("files" in message && Array.isArray(message.files)) {
    for (const f of message.files) {
      files.push({
        id: f.id ?? "",
        name: f.name ?? "unknown",
        mimetype: f.mimetype ?? "application/octet-stream",
        urlPrivate: f.url_private ?? "",
        size: f.size ?? 0,
      });
    }
  }

  // Process asynchronously — Bolt already acknowledged the event
  processMessage(slackUserId, channelId, text, files, messageTs, threadTs).catch(
    (err) => {
      console.error("Unhandled error in processMessage:", err);
    },
  );
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  console.log("Recovering stale sessions from previous run...");
  await recoverStaleSessions();

  await app.start();
  console.log(
    `Switchboard Agent Worker running (socket mode, ${getActiveSessionCount()} active sessions)`,
  );
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
