import { query } from "@anthropic-ai/claude-code";
import * as slack from "./slack.js";
import * as db from "./db.js";
import { fetchUserFiles, writeFilesToDisk, cleanupTempDir } from "./files.js";
import { extractClaudeMd, buildSystemPrompt } from "./prompt.js";
import { buildErrorWithRetryBlocks } from "./slack-blocks.js";
import { createMessageStream } from "./message-stream.js";
import {
  buildThreadKey,
  getRunningSession,
  registerSession,
  unregisterSession,
} from "./session-registry.js";
import type { SlackFile, UserLookup } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SESSIONS = 10;
const TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — close session after no follow-ups
const SDK_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes — abort if SDK goes silent

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".py",
  ".js",
  ".ts",
  ".json",
  ".csv",
  ".html",
  ".css",
  ".sql",
  ".yaml",
  ".yml",
  ".xml",
  ".log",
  ".sh",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".c",
  ".cpp",
  ".h",
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Concurrency tracking
// ---------------------------------------------------------------------------

let activeCount = 0;

export function getActiveSessionCount(): number {
  return activeCount;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function isTextFile(file: SlackFile): boolean {
  const ext = getExtension(file.name);
  return TEXT_EXTENSIONS.has(ext) || file.mimetype.startsWith("text/");
}

export async function formatFiles(files: SlackFile[]): Promise<string> {
  if (files.length === 0) return "";

  const parts: string[] = [];
  for (const file of files) {
    if (!isTextFile(file)) {
      parts.push(`\n[Attached file: ${file.name} (${file.mimetype}, binary)]`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      try {
        const downloaded = await slack.downloadFile(file.urlPrivate);
        const truncated = downloaded.content.slice(0, MAX_FILE_SIZE);
        parts.push(
          `\n--- ${file.name} (truncated to ${MAX_FILE_SIZE} bytes) ---\n${truncated}\n--- end ${file.name} ---`,
        );
      } catch (err) {
        console.error(`Failed to download file ${file.name}:`, err);
        parts.push(
          `\n[Attached file: ${file.name} (${file.mimetype}, download failed)]`,
        );
      }
      continue;
    }
    try {
      const downloaded = await slack.downloadFile(file.urlPrivate);
      if (downloaded.content === "[Binary file]") {
        parts.push(
          `\n[Attached file: ${file.name} (${file.mimetype}, binary)]`,
        );
      } else {
        parts.push(
          `\n--- ${file.name} ---\n${downloaded.content}\n--- end ${file.name} ---`,
        );
      }
    } catch (err) {
      console.error(`Failed to download file ${file.name}:`, err);
      parts.push(
        `\n[Attached file: ${file.name} (${file.mimetype}, download failed)]`,
      );
    }
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Slack message length helper
// ---------------------------------------------------------------------------

const SLACK_MAX_TEXT = 39_000; // Slack limit is 40k; leave some margin

function truncateForSlack(text: string): string {
  if (text.length <= SLACK_MAX_TEXT) return text;
  return (
    text.slice(0, SLACK_MAX_TEXT) +
    "\n\n... (response truncated due to Slack message length limit)"
  );
}

// ---------------------------------------------------------------------------
// Centralized error handler
// ---------------------------------------------------------------------------

async function postErrorWithRetry(opts: {
  channelId: string;
  messageTs: string;
  replyThread: string;
  errorMessage: string;
  sessionId?: string;
  status?: "failed" | "timeout";
}): Promise<void> {
  const { channelId, messageTs, replyThread, errorMessage, sessionId, status } = opts;

  // Always fix emoji state
  await Promise.all([
    slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
    slack.addReaction(channelId, messageTs, "x").catch(() => {}),
  ]);

  // Post error — with retry button if we have a session, plain text otherwise
  if (sessionId) {
    const blocks = buildErrorWithRetryBlocks(errorMessage, sessionId);
    const errorTs = await slack.postMessage(
      channelId,
      `Sorry, something went wrong: ${errorMessage}`,
      replyThread,
      blocks,
    );
    await db.createMessage({
      sessionId,
      role: "assistant",
      content: errorMessage,
      slackTs: errorTs,
      metadata: { error: true },
    });
    await db
      .updateSession(sessionId, {
        status: status || "failed",
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .catch(() => {});
  } else {
    await slack.postMessage(
      channelId,
      `Sorry, something went wrong: ${errorMessage}`,
      replyThread,
    );
  }
}

// ---------------------------------------------------------------------------
// Follow-up injection into a running session
// ---------------------------------------------------------------------------

export async function injectFollowUp(
  threadKey: string,
  sessionId: string,
  slackUserId: string,
  text: string,
  files: SlackFile[],
  messageTs: string,
): Promise<boolean> {
  const running = getRunningSession(threadKey);
  if (!running) return false;

  const fileContent = await formatFiles(files);
  const fullText = fileContent ? `${text}\n${fileContent}` : text;

  // Store user message in DB
  await db.createMessage({
    sessionId: running.sessionId,
    role: "user",
    content: fullText,
    slackTs: messageTs,
    metadata: { slackUserId, fileCount: files.length, isFollowUp: true },
  });

  // Push into the running session's async generator
  return new Promise<boolean>((outerResolve) => {
    const pushed = running.pushMessage({
      text: fullText,
      messageTs,
      resolve: () => outerResolve(true),
    });
    if (!pushed) {
      // Session already closed (race condition)
      outerResolve(false);
    }
  });
}

// ---------------------------------------------------------------------------
// Main message handler
// ---------------------------------------------------------------------------

export async function processMessage(
  slackUserId: string,
  channelId: string,
  text: string,
  files: SlackFile[],
  messageTs: string,
  threadTs?: string,
  retryOf?: string,
): Promise<void> {
  // 1. React with eyes to acknowledge receipt
  await slack.addReaction(channelId, messageTs, "eyes").catch(() => {});

  // 2. Look up the Switchboard user
  let lookup: UserLookup | null;
  try {
    lookup = await db.lookupUserBySlackId(slackUserId);
  } catch (err) {
    console.error("User lookup failed:", err);
    await postErrorWithRetry({
      channelId,
      messageTs,
      replyThread: threadTs || messageTs,
      errorMessage: "Something went wrong looking up your account. Please try again later.",
    });
    return;
  }

  if (!lookup) {
    await Promise.all([
      slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
      slack.addReaction(channelId, messageTs, "x").catch(() => {}),
    ]);
    await slack.postMessage(
      channelId,
      "I don't recognize your Slack account. Please connect Slack in your Switchboard dashboard first: https://www.get-switchboard.com",
      threadTs || messageTs,
    );
    return;
  }

  // 3. Check global concurrency limit
  if (activeCount >= MAX_CONCURRENT_SESSIONS) {
    await postErrorWithRetry({
      channelId,
      messageTs,
      replyThread: threadTs || messageTs,
      errorMessage: "I'm currently handling a lot of requests. Please try again in a moment.",
    });
    return;
  }

  // 5. Look up previous Claude session for this thread (for resume)
  let resumeSessionId: string | null = null;
  if (threadTs) {
    try {
      resumeSessionId = await db.getThreadSession(channelId, threadTs);
      if (resumeSessionId) {
        console.log(`[thread] Resuming Claude session ${resumeSessionId}`);
      }
    } catch (err) {
      console.error("Failed to look up thread session:", err);
    }
  }

  // 6. Download and format file attachments (skip on retry — prompt already has file content)
  let fullPrompt: string;
  if (retryOf) {
    fullPrompt = text;
  } else {
    const fileContent = await formatFiles(files);
    fullPrompt = fileContent ? `${text}\n${fileContent}` : text;
  }

  // 7. Create session row
  let sessionId: string;
  try {
    sessionId = await db.createSession({
      userId: lookup.userId,
      organizationId: lookup.organizationId,
      slackChannelId: channelId,
      slackThreadTs: threadTs || messageTs,
      slackMessageTs: messageTs,
      prompt: fullPrompt,
      model: lookup.model,
      ...(retryOf ? { retryOf } : {}),
    });
  } catch (err) {
    console.error("Failed to create session:", err);
    await postErrorWithRetry({
      channelId,
      messageTs,
      replyThread: threadTs || messageTs,
      errorMessage: "Failed to start a new session. Please try again.",
    });
    return;
  }

  // 8. Track concurrency
  activeCount++;

  const replyThread = threadTs || messageTs;

  let tempDir: string | null = null;
  let claudeMdContent: string | null = null;

  try {
    // 9. Update session to running
    await db.updateSession(sessionId, { status: "running" });

    // 10. Store user message
    await db.createMessage({
      sessionId,
      role: "user",
      content: fullPrompt,
      slackTs: messageTs,
      metadata: {
        slackUserId,
        fileCount: files.length,
      },
    });

    // 11. Pre-flight MCP connectivity check
    try {
      const mcpUrl = process.env.SWITCHBOARD_MCP_URL!.trim();
      console.log(`[mcp-preflight] Testing ${mcpUrl} ...`);
      const preflight = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${lookup.agentKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "switchboard-agent-preflight", version: "1.0.0" },
          },
        }),
      });
      console.log(`[mcp-preflight] status=${preflight.status} content-type=${preflight.headers.get("content-type")}`);
      if (!preflight.ok) {
        const body = await preflight.text();
        console.error(`[mcp-preflight] FAILED: ${body}`);
      } else {
        const body = await preflight.text();
        console.log(`[mcp-preflight] OK: ${body.slice(0, 500)}`);
      }
    } catch (err) {
      console.error("[mcp-preflight] Network error:", err);
    }

    // 12. Pull user files for local read context
    try {
      const userFiles = await fetchUserFiles(lookup.agentKey);
      if (userFiles) {
        tempDir = await writeFilesToDisk(userFiles);
        claudeMdContent = extractClaudeMd(userFiles);
        console.log(`[files] Wrote ${userFiles.length} file(s) to ${tempDir}`);
      }
    } catch (err) {
      console.error("[files] Failed to pull user files:", err);
    }

    // 13. Set up timeout via AbortController
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);

    // 14. Create message stream + register in session registry
    const threadKey = buildThreadKey(channelId, threadTs || messageTs);
    const stream = createMessageStream(fullPrompt);

    const runningSession = {
      sessionId,
      claudeSessionId: null as string | null,
      pushMessage: stream.pushMessage,
      close: stream.close,
    };
    registerSession(threadKey, runningSession);

    // Idle timeout: close the stream if no follow-up arrives within IDLE_TIMEOUT_MS
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.log(`[session ${sessionId}] Idle timeout — closing stream`);
        stream.close();
      }, IDLE_TIMEOUT_MS);
    };

    // 15. Run Claude Code SDK (multi-turn)
    let lastResultText: string | null = null;
    let totalTurns = 0;
    let totalCost = 0;

    try {
      const systemPrompt = buildSystemPrompt(claudeMdContent);

      const buildQueryOptions = () => ({
        model: lookup.model,
        customSystemPrompt: systemPrompt,
        ...(tempDir ? { cwd: tempDir } : {}),
        mcpServers: {
          switchboard: {
            type: "http" as const,
            url: process.env.SWITCHBOARD_MCP_URL!.trim(),
            headers: {
              Authorization: `Bearer ${lookup.agentKey}`,
            },
          },
        },
        permissionMode: "bypassPermissions" as const,
        abortController,
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        stderr: (data: string) => {
          const redacted = data
            .replace(/Bearer [^\s"']+/g, "Bearer [REDACTED]")
            .replace(/sk_live_[^\s"']+/g, "sk_live_[REDACTED]");
          console.error("[claude-code stderr]", redacted);
        },
      });

      const runConversation = async () => {
        const conversation = query({
          prompt: stream.iterable,
          options: buildQueryOptions(),
        });

        // Diagnostic counters — set up BEFORE mcpServerStatus so heartbeat runs even if it hangs
        const startTime = Date.now();
        const msgCounts = new Map<string, number>();
        const recentMessages: string[] = []; // last 10 type:subtype labels
        let lastMessageAt = Date.now();
        let waitingForFollowUp = false; // true after result:success — waiting for user, not SDK

        // Independent heartbeat — fires even when the for-await loop is stuck
        const heartbeat = setInterval(() => {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const sinceLast = Math.round((Date.now() - lastMessageAt) / 1000);
          console.log(
            `[session ${sessionId}] heartbeat ${elapsed}s — last_msg=${sinceLast}s ago — waiting=${waitingForFollowUp} — counts=${JSON.stringify(Object.fromEntries(msgCounts))}`,
          );

          if (!waitingForFollowUp && Date.now() - lastMessageAt > SDK_INACTIVITY_TIMEOUT_MS) {
            console.error(
              `[session ${sessionId}] SDK inactivity timeout — no messages for ${sinceLast}s, aborting`,
            );
            clearInterval(heartbeat);
            abortController.abort();
          }
        }, 30_000);

        try {
        // Check MCP server status (with timeout — SDK hangs here if process already exited)
        try {
          const mcpStatus = await Promise.race([
            conversation.mcpServerStatus(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("mcpServerStatus timeout")), 10_000),
            ),
          ]);
          console.log("[mcp-status]", JSON.stringify(mcpStatus));
        } catch (err) {
          console.log("[mcp-status] not available:", err instanceof Error ? err.message : err);
        }

        // Iterate — handle multiple result messages (one per user turn)
        let claudeSessionId: string | null = null;
        let lastAssistantText = ""; // text from intermediate assistant turns (fallback for empty result)
        for await (const message of conversation) {
          // Track message counts
          const label = `${message.type}:${"subtype" in message ? (message as { subtype?: string }).subtype : "-"}`;
          msgCounts.set(label, (msgCounts.get(label) || 0) + 1);
          recentMessages.push(label);
          if (recentMessages.length > 10) recentMessages.shift();
          lastMessageAt = Date.now();
          waitingForFollowUp = false;

          // Capture session_id from any message
          if ("session_id" in message && message.session_id && !claudeSessionId) {
            claudeSessionId = message.session_id;
            stream.setSessionId(claudeSessionId);
            runningSession.claudeSessionId = claudeSessionId;
            await db.updateSession(sessionId, { claude_session_id: claudeSessionId });
          }

          if (message.type === "system") {
            console.log("[claude-code system]", JSON.stringify(message));
          }

          // Log assistant message metadata and capture text content
          if (message.type === "assistant") {
            const msg = message as {
              message?: {
                id?: string;
                content?: Array<{ type: string; text?: string }>;
                stop_reason?: string;
              };
            };
            const blocks = msg.message?.content || [];
            const blockTypes = blocks.map((b) => b.type).join(",") || "?";
            console.log(
              `[session ${sessionId}] assistant msg id=${msg.message?.id} blocks=[${blockTypes}] stop=${msg.message?.stop_reason || "?"}`,
            );

            // Accumulate text from assistant messages — SDK result.result may be
            // empty when text was produced in an intermediate turn (before tool calls)
            const textContent = blocks
              .filter((b) => b.type === "text" && b.text)
              .map((b) => b.text!)
              .join("");
            if (textContent) lastAssistantText = textContent;
          }

          if (message.type === "result") {
            if (message.subtype === "success") {
              const text = message.result || lastAssistantText || "(No response generated)";
              if (!message.result) {
                console.warn(
                  `[session ${sessionId}] result.result empty — using ${lastAssistantText ? `lastAssistantText (len=${lastAssistantText.length})` : "fallback"}`,
                );
              }
              console.log(
                `[session ${sessionId}] result:success — len=${text.length} preview=${JSON.stringify(text.slice(0, 200))}`,
              );
              lastAssistantText = ""; // reset for next turn
              lastResultText = text;
              totalTurns += message.num_turns;
              totalCost += message.total_cost_usd;

              try {
                const resultTs = await slack.postMessage(
                  channelId,
                  truncateForSlack(slack.markdownToSlack(text)),
                  replyThread,
                );
                console.log(`[session ${sessionId}] posted to Slack ts=${resultTs}`);

                await db.createMessage({
                  sessionId,
                  role: "assistant",
                  content: text,
                  slackTs: resultTs,
                  metadata: { turns: message.num_turns, cost: message.total_cost_usd },
                });
              } catch (slackErr) {
                console.error(`[session ${sessionId}] failed to post result to Slack:`, slackErr);
                // Retry with plain text (no markdown conversion, truncated)
                try {
                  await slack.postMessage(channelId, text.slice(0, 3900), replyThread);
                } catch (retryErr) {
                  console.error(`[session ${sessionId}] retry also failed:`, retryErr);
                }
              }

              // Mark as waiting for user follow-up — suppresses SDK inactivity timeout
              waitingForFollowUp = true;
              resetIdleTimer();
            } else {
              // Error result — surface to user via retry flow
              console.error("[claude-code] error result:", JSON.stringify(message));
              throw new Error(
                `Agent encountered an error (${message.subtype}): ${
                  "error" in message && message.error
                    ? String(message.error)
                    : "no details available"
                }`,
              );
            }
          }
        }

        // Summary log after loop completes
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `[session ${sessionId}] conversation done — elapsed=${elapsed}s counts=${JSON.stringify(Object.fromEntries(msgCounts))} hasResult=${!!lastResultText} resultLen=${lastResultText?.length ?? 0}`,
        );
        if (!lastResultText) {
          console.warn(
            `[session ${sessionId}] no result text captured — recent messages: [${recentMessages.join(", ")}]`,
          );
        }

        return { claudeSessionId };
        } finally {
          clearInterval(heartbeat);
        }
      };

      try {
        await runConversation();
      } catch (err: unknown) {
        // If we were trying to resume and it failed for ANY reason, retry fresh.
        // Resume failures are expected — sessions expire on the API side after idle timeout.
        if (resumeSessionId) {
          console.warn(
            `[thread] Resume failed for session ${resumeSessionId}, starting fresh:`,
            err instanceof Error ? err.message : err,
          );
          resumeSessionId = null;
          await runConversation();
        } else {
          throw err;
        }
      }

      clearTimeout(timeoutId);
      if (idleTimer) clearTimeout(idleTimer);

      if (!lastResultText) {
        console.warn(`[session ${sessionId}] fallback — no result text after conversation completed`);
        lastResultText = "(No response generated — the agent completed without producing output. Please try again.)";
        await slack.postMessage(
          channelId,
          lastResultText,
          replyThread,
        );
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (idleTimer) clearTimeout(idleTimer);
      stream.close();

      const isAbort =
        err instanceof Error && err.name === "AbortError";
      const errorMessage = isAbort
        ? "The agent stopped responding and was automatically terminated. Please try again."
        : err instanceof Error
          ? err.message
          : "An unknown error occurred";

      await postErrorWithRetry({
        channelId,
        messageTs,
        replyThread,
        errorMessage,
        sessionId,
        status: isAbort ? "timeout" : "failed",
      });

      return;
    }

    // 16. Finalize: mark completed + swap emoji on the original message
    await Promise.all([
      slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
      slack.addReaction(channelId, messageTs, "white_check_mark").catch(() => {}),
    ]);

    await db.updateSession(sessionId, {
      status: "completed",
      result: lastResultText,
      total_turns: totalTurns,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Unexpected error in session ${sessionId}:`, err);
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred";

    await postErrorWithRetry({
      channelId,
      messageTs,
      replyThread,
      errorMessage,
      sessionId,
    }).catch(() => {});
  } finally {
    activeCount--;
    unregisterSession(buildThreadKey(channelId, threadTs || messageTs));
    if (tempDir) {
      cleanupTempDir(tempDir).catch((err) =>
        console.error("[files] Cleanup failed:", err),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Crash recovery: mark stale running sessions as failed
// ---------------------------------------------------------------------------

export async function recoverStaleSessions(): Promise<void> {
  const staleSessions = await db.getStaleRunningSessions();
  if (staleSessions.length === 0) {
    console.log("No stale sessions to recover.");
    return;
  }

  console.log(`Recovering ${staleSessions.length} stale session(s)...`);

  await Promise.all(staleSessions.map(async (session) => {
    const errorMsg = "Worker restarted — session was interrupted.";

    await db.updateSession(session.id, {
      status: "failed",
      error: errorMsg,
      completed_at: new Date().toISOString(),
    });

    // Try to fix emoji on the original user message (may fail for old messages)
    if (session.slack_channel_id && session.slack_message_ts) {
      await Promise.all([
        slack.removeReaction(session.slack_channel_id, session.slack_message_ts, "eyes").catch(() => {}),
        slack.addReaction(session.slack_channel_id, session.slack_message_ts, "x").catch(() => {}),
      ]);
    }

    // Post error with retry button in Slack thread
    if (session.slack_channel_id && session.slack_thread_ts) {
      const blocks = buildErrorWithRetryBlocks(errorMsg, session.id);
      await slack
        .postMessage(
          session.slack_channel_id,
          `Sorry, something went wrong: ${errorMsg}`,
          session.slack_thread_ts,
          blocks,
        )
        .catch((err) =>
          console.error(
            `Failed to notify Slack for stale session ${session.id}:`,
            err,
          ),
        );
    }
  }));

  console.log("Stale session recovery complete.");
}

// ---------------------------------------------------------------------------
// Retry a failed session
// ---------------------------------------------------------------------------

export async function retrySession(
  sessionId: string,
  triggerSlackUserId: string,
): Promise<void> {
  // 1. Look up the failed session
  const session = await db.getSessionById(sessionId);
  if (!session) {
    console.error(`Retry: session ${sessionId} not found`);
    return;
  }

  if (session.status !== "failed" && session.status !== "timeout") {
    console.warn(`Retry: session ${sessionId} has status ${session.status}, skipping`);
    return;
  }

  // 2. Look up Slack user (fresh credentials)
  const lookup = await db.lookupUserBySlackId(triggerSlackUserId);
  if (!lookup) {
    console.error(`Retry: Slack user ${triggerSlackUserId} not found`);
    return;
  }

  // 3. Verify the clicking user owns the session
  if (lookup.userId !== session.user_id) {
    console.warn(`Retry: user mismatch — session owner ${session.user_id}, clicker ${lookup.userId}`);
    return;
  }

  // 4. Replay the original prompt through processMessage
  const messageTs = session.slack_message_ts || session.slack_thread_ts || "";
  const threadTs = session.slack_thread_ts || undefined;

  await processMessage(
    triggerSlackUserId,
    session.slack_channel_id,
    session.prompt,
    [], // no files — prompt already contains embedded file content
    messageTs,
    threadTs,
    sessionId, // retryOf
  );
}
