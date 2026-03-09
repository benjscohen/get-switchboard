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
import { buildRetryDisabledBlocks, buildPlanExpiredBlocks } from "./slack-blocks.js";
import { buildThreadKey, getRunningSession, findRunningSessionBySessionId } from "./session-registry.js";
import { cleanupOldArchives } from "./workspace-storage.js";
import type { SlackFile } from "./types.js";
import { logger } from "./logger.js";
import {
  isRedisEnabled,
  markProcessedRedis,
  getSessionOwner,
  publishFollowUp,
  subscribeFollowUps,
  startHeartbeatLoop,
  shutdownRedis,
  getInstanceId,
  type FollowUpPayload,
} from "./redis.js";

// ---------------------------------------------------------------------------
// Deduplication: track event IDs for 5 minutes to prevent double-processing
// ---------------------------------------------------------------------------

const processedEvents = new Set<string>();

async function markProcessed(eventId: string): Promise<boolean> {
  // Use Redis for cross-instance dedup when available
  if (isRedisEnabled()) {
    return markProcessedRedis(eventId);
  }
  // Fallback: in-memory dedup (single-instance mode)
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
  if (!(await markProcessed(eventId))) return;

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
        }).catch((err) => logger.error({ err }, "Failed to store plan feedback"));
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
      logger.info({ threadKey }, "[follow-up] injection failed, falling through to new session");
      await slack.removeReaction(channelId, messageTs, "eyes").catch(() => {});
    }
  }

  // Cross-instance follow-up routing: if no local session but Redis knows the owner
  if (threadTs && isRedisEnabled()) {
    const owner = await getSessionOwner(buildThreadKey(channelId, threadTs));
    if (owner && owner.instanceId !== getInstanceId()) {
      // Session lives on another instance — forward via pub/sub
      logger.info({ threadKey: buildThreadKey(channelId, threadTs), targetInstance: owner.instanceId }, "[follow-up] forwarding to remote instance");
      await slack.addReaction(channelId, messageTs, "eyes").catch(() => {});
      await publishFollowUp(owner.instanceId, {
        threadKey: buildThreadKey(channelId, threadTs),
        sessionId: owner.sessionId,
        slackUserId,
        text,
        files,
        messageTs,
      });
      return;
    }
  }

  // Process asynchronously — Bolt already acknowledged the event
  processMessage(slackUserId, channelId, text, files, messageTs, threadTs).catch(
    (err) => {
      logger.error({ err }, "Unhandled error in processMessage");
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
      .catch((err) => logger.error({ err }, "Failed to update retry button"));
  }

  // Fire and forget
  retrySession(sessionId, body.user.id).catch((err) =>
    logger.error({ err }, "Retry session failed"),
  );
});

// Handle "Stop" button clicks on streaming status messages
app.action("kill_session", async ({ action, ack, body }) => {
  await ack();
  const sessionId = (action as { value?: string }).value;
  if (!sessionId) return;

  const running = findRunningSessionBySessionId(sessionId);
  if (!running) {
    logger.warn({ sessionId }, "kill_session: no running session");
    return;
  }

  // Verify the clicking user owns the session
  const slackUserId = body.user.id;
  let lookup: db.LookupResult;
  try {
    lookup = await db.lookupUserBySlackId(slackUserId);
  } catch {
    logger.error({ slackUserId }, "kill_session: failed to look up user");
    return;
  }
  if (!lookup.ok) return;

  // Mark as user-initiated kill, then abort
  running.killedByUser = true;
  if (running.abortController) {
    running.abortController.abort();
  }
  running.close();

  logger.info({ slackUserId, sessionId }, "[kill_session] User killed session");
});

// Handle "Approve" button clicks on plan approval messages
app.action("approve_plan", async ({ action, ack, body }) => {
  await ack();
  const sessionId = (action as { value?: string }).value;
  if (!sessionId) return;

  const running = findRunningSessionBySessionId(sessionId);
  if (!running?.pendingPlanApproval) {
    logger.warn({ sessionId }, "approve_plan: no pending approval");

    // Session expired or already processed — update the Slack message to show expired state
    const channelId = body.channel?.id;
    const msg = "message" in body ? (body as unknown as Record<string, unknown>).message as { ts?: string; text?: string } : null;
    if (channelId && msg?.ts) {
      const expiredBlocks = buildPlanExpiredBlocks(msg.text || "(plan text unavailable)");
      await slack
        .updateMessage(channelId, msg.ts, msg.text || "Plan expired", expiredBlocks)
        .catch((err) => logger.error({ err }, "Failed to update expired plan"));
    }
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
      logger.error({ key }, "Missing required env var");
      process.exit(1);
    }
  }
  logger.info({ mcpUrl: process.env.SWITCHBOARD_MCP_URL?.trim() }, "MCP URL");
  logger.info({ keyPrefix: process.env.ANTHROPIC_API_KEY?.slice(0, 12) }, "Anthropic key");

  logger.info("Recovering stale sessions from previous run...");
  await recoverStaleSessions();

  // Clean up old workspace archives in the background
  cleanupOldArchives().then((n) => {
    if (n > 0) logger.info({ count: n }, "Cleaned up old workspace archives");
  }).catch((err) => logger.error({ err }, "Workspace cleanup failed"));

  const jobsEnabled = process.env.ENABLE_SCHEDULED_JOBS === "true";
  if (jobsEnabled) {
    startScheduler();
    startReaper();
  } else {
    logger.info("[jobs] Scheduled jobs disabled (set ENABLE_SCHEDULED_JOBS=true to enable)");
  }

  // Phase 2: Redis-based scaling
  if (isRedisEnabled()) {
    startHeartbeatLoop();
    subscribeFollowUps(async (payload: FollowUpPayload) => {
      const { threadKey, sessionId, slackUserId, text, files, messageTs } = payload;
      const running = getRunningSession(threadKey);
      if (running) {
        await injectFollowUp(threadKey, sessionId, slackUserId, text, files as SlackFile[], messageTs);
      } else {
        logger.warn({ threadKey, sessionId }, "[redis] received follow-up but no local session");
      }
    });
    logger.info({ instanceId: getInstanceId() }, "[redis] scaling enabled");
  }

  await app.start();
  logger.info(
    { jobs: jobsEnabled ? "on" : "off", activeSessions: await getActiveSessionCount() },
    "Switchboard Agent Worker running (socket mode)",
  );
}

// Graceful shutdown
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, "shutting down");
    await shutdownRedis();
    process.exit(0);
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
