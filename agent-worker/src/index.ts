import { App, LogLevel } from "@slack/bolt";
import {
  processMessage,
  injectFollowUp,
  recoverStaleSessions,
  retrySession,
  getActiveSessionCount,
} from "./agent.js";
import { startReaper } from "./reaper.js";
import { startScheduler } from "./scheduler.js";
import * as slack from "./slack.js";
import type { SlackAttachment } from "./slack.js";
import * as db from "./db.js";
import { buildRetryDisabledBlocks } from "./slack-blocks.js";
import { buildThreadKey, getRunningSession, findRunningSessionBySessionId } from "./session-registry.js";
import { cleanupOldArchives } from "./workspace-storage.js";
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
  // Only handle user messages in DMs (allow file_share subtype for image/file messages)
  if (message.subtype && message.subtype !== "file_share") return;
  if (!("user" in message) || !message.user) return;
  if (message.channel_type !== "im") return;

  // Deduplicate
  const eventId = body.event_id;
  if (!markProcessed(eventId)) return;

  const slackUserId = message.user;
  const channelId = message.channel;
  let text = ("text" in message ? message.text : "") || "";
  const messageTs = message.ts;
  const threadTs = "thread_ts" in message ? message.thread_ts : undefined;

  // Extract forwarded/shared message content from attachments
  if ("attachments" in message && Array.isArray(message.attachments) && message.attachments.length > 0) {
    const attachmentText = slack.formatAttachments(message.attachments as SlackAttachment[]);
    if (attachmentText) {
      text += attachmentText;
    }
  }

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

  // Check if there's a running session for this thread — inject follow-up if so
  if (threadTs) {
    const threadKey = buildThreadKey(channelId, threadTs);
    const running = getRunningSession(threadKey);
    if (running) {
      // Route text to plan feedback if waiting for approval
      if (running.pendingPlanApproval) {
        running.pendingPlanApproval.resolve({ action: "revise", feedback: text });
        await slack.addReaction(channelId, messageTs, "white_check_mark").catch(() => {});
        // Store feedback message in DB
        await db.createMessage({
          sessionId: running.sessionId,
          role: "user",
          content: text,
          slackTs: messageTs,
          metadata: { slackUserId, isPlanFeedback: true },
        }).catch((err) => console.error("Failed to store plan feedback:", err));
        return;
      }

      await slack.addReaction(channelId, messageTs, "eyes").catch(() => {});
      const injected = await injectFollowUp(
        threadKey,
        running.sessionId,
        slackUserId,
        text,
        files,
        messageTs,
      );
      if (injected) {
        running.pendingFollowUpTs.push(messageTs);
        return;
      }
      // If injection failed (session just closed), fall through to normal flow
      console.log(`[follow-up] injection failed for thread=${threadKey}, falling through to new session`);
      await slack.removeReaction(channelId, messageTs, "eyes").catch(() => {});
    }
  }

  // Process asynchronously — Bolt already acknowledged the event
  processMessage(slackUserId, channelId, text, files, messageTs, threadTs).catch(
    (err) => {
      console.error("Unhandled error in processMessage:", err);
    },
  );
});

// Handle "Retry" button clicks on error messages
app.action("retry_session", async ({ action, ack, body }) => {
  await ack();
  const sessionId = (action as { value?: string }).value;
  if (!sessionId) return;

  // Disable the button immediately to prevent double-clicks
  const channelId = body.channel?.id;
  const msg = "message" in body ? (body as unknown as Record<string, unknown>).message as { ts?: string; blocks?: Array<{ text?: { text?: string } }> } : null;
  if (channelId && msg?.ts) {
    const errorText = msg.blocks?.[0]?.text?.text?.replace("Sorry, something went wrong: ", "") || "Unknown error";
    const disabledBlocks = buildRetryDisabledBlocks(errorText);
    await slack
      .updateMessage(
        channelId,
        msg.ts,
        `Sorry, something went wrong: ${errorText}`,
        disabledBlocks,
      )
      .catch((err) => console.error("Failed to update retry button:", err));
  }

  // Fire and forget
  retrySession(sessionId, body.user.id).catch((err) =>
    console.error("Retry session failed:", err),
  );
});

// Handle "Approve" button clicks on plan approval messages
app.action("approve_plan", async ({ action, ack, body }) => {
  await ack();
  const sessionId = (action as { value?: string }).value;
  if (!sessionId) return;

  const running = findRunningSessionBySessionId(sessionId);
  if (!running?.pendingPlanApproval) {
    console.warn(`approve_plan: no pending approval for session ${sessionId}`);
    return;
  }

  // Resolve the promise — the hook in agent.ts will handle the rest
  running.pendingPlanApproval.resolve({ action: "approve" });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  // Verify required env vars
  const required = ["SLACK_BOT_TOKEN", "SLACK_SOCKET_TOKEN", "ANTHROPIC_API_KEY", "SWITCHBOARD_MCP_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing required env var: ${key}`);
      process.exit(1);
    }
  }
  console.log(`MCP URL: ${process.env.SWITCHBOARD_MCP_URL?.trim()}`);
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY?.slice(0, 12)}...`);

  console.log("Recovering stale sessions from previous run...");
  await recoverStaleSessions();

  // Clean up old workspace archives in the background
  cleanupOldArchives().then((n) => {
    if (n > 0) console.log(`Cleaned up ${n} old workspace archives`);
  }).catch((err) => console.error("Workspace cleanup failed:", err));

  startScheduler();
  startReaper();

  await app.start();
  console.log(
    `Switchboard Agent Worker running (socket mode, ${getActiveSessionCount()} active sessions)`,
  );
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
