import { query } from "@anthropic-ai/claude-code";
import * as slack from "./slack.js";
import * as db from "./db.js";
import { fetchUserFiles, writeFilesToDisk, cleanupTempDir } from "./files.js";
import { extractClaudeMd, buildSystemPrompt } from "./prompt.js";
import { buildErrorWithRetryBlocks } from "./slack-blocks.js";
import type { SlackFile, UserLookup } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SESSIONS = 10;
const TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

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

async function formatFiles(files: SlackFile[]): Promise<string> {
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
      const mcpUrl = process.env.SWITCHBOARD_MCP_URL!;
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

    // 13. Run Claude Code SDK
    let resultText: string;
    let totalTurns = 0;

    try {
      const systemPrompt = buildSystemPrompt(claudeMdContent);

      const buildQueryOptions = () => ({
        model: lookup.model,
        customSystemPrompt: systemPrompt,
        ...(tempDir ? { cwd: tempDir } : {}),
        mcpServers: {
          switchboard: {
            type: "http" as const,
            url: process.env.SWITCHBOARD_MCP_URL!,
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
          prompt: fullPrompt,
          options: buildQueryOptions(),
        });

        // Check MCP server status
        try {
          const mcpStatus = await conversation.mcpServerStatus();
          console.log("[mcp-status]", JSON.stringify(mcpStatus));
        } catch {
          console.log("[mcp-status] not available (non-streaming mode)");
        }

        // Iterate the async generator — capture session_id and final result
        let text = "";
        let turns = 0;
        let claudeSessionId: string | null = null;
        for await (const message of conversation) {
          // Capture session_id from any message
          if ("session_id" in message && message.session_id && !claudeSessionId) {
            claudeSessionId = message.session_id;
          }
          // Log system messages (often contain MCP connection info)
          if (message.type === "system") {
            console.log("[claude-code system]", JSON.stringify(message));
          }
          if (message.type === "result") {
            if (message.subtype === "success") {
              text = message.result;
              turns = message.num_turns;
            } else {
              console.error("[claude-code] error result:", JSON.stringify(message));
            }
          }
        }

        return { text, turns, claudeSessionId };
      };

      let result: { text: string; turns: number; claudeSessionId: string | null };
      try {
        result = await runConversation();
      } catch (err: unknown) {
        // If resume failed because the session no longer exists, retry without resume
        const isSessionNotFound =
          resumeSessionId &&
          err instanceof Error &&
          err.message.includes("No conversation found");

        if (isSessionNotFound) {
          console.warn(
            `[thread] Resume failed for session ${resumeSessionId}, starting fresh session`,
          );
          resumeSessionId = null;
          result = await runConversation();
        } else {
          throw err;
        }
      }

      resultText = result.text;
      totalTurns = result.turns;

      // Store claude session ID for future thread resumption
      if (result.claudeSessionId) {
        await db.updateSession(sessionId, { claude_session_id: result.claudeSessionId });
      }

      clearTimeout(timeoutId);

      if (!resultText) {
        resultText = "(No response generated)";
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      const isAbort =
        err instanceof Error && err.name === "AbortError";
      const errorMessage = isAbort
        ? "Request timed out after 4 hours."
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

    // 13. Success: post result as a new message (triggers notification)
    const resultTs = await slack.postMessage(
      channelId,
      truncateForSlack(resultText),
      replyThread,
    );
    await Promise.all([
      slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
      slack.addReaction(channelId, messageTs, "white_check_mark").catch(() => {}),
    ]);

    // 14. Update session as completed
    await db.updateSession(sessionId, {
      status: "completed",
      result: resultText,
      total_turns: totalTurns,
      completed_at: new Date().toISOString(),
    });

    // 15. Store assistant message
    await db.createMessage({
      sessionId,
      role: "assistant",
      content: resultText,
      slackTs: resultTs,
      metadata: { totalTurns },
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
