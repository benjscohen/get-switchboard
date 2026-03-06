import { query } from "@anthropic-ai/claude-code";
import * as slack from "./slack.js";
import * as db from "./db.js";
import type { SlackFile, UserLookup } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SESSIONS = 10;
const MAX_TURNS = 25;
const MAX_BUDGET_USD = 2.0;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

const activeSessions = new Map<string, string>(); // userId -> sessionId
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
// Main message handler
// ---------------------------------------------------------------------------

export async function processMessage(
  slackUserId: string,
  channelId: string,
  text: string,
  files: SlackFile[],
  messageTs: string,
  threadTs?: string,
): Promise<void> {
  // 1. React with eyes to acknowledge receipt
  await slack.addReaction(channelId, messageTs, "eyes").catch(() => {});

  // 2. Look up the Switchboard user
  let lookup: UserLookup | null;
  try {
    lookup = await db.lookupUserBySlackId(slackUserId);
  } catch (err) {
    console.error("User lookup failed:", err);
    await slack.postMessage(
      channelId,
      "Something went wrong looking up your account. Please try again later.",
      threadTs || messageTs,
    );
    return;
  }

  if (!lookup) {
    await slack.postMessage(
      channelId,
      "I don't recognize your Slack account. Please connect Slack in your Switchboard dashboard first: https://app.get-switchboard.com/connections",
      threadTs || messageTs,
    );
    return;
  }

  // 3. Check for concurrent session
  if (activeSessions.has(lookup.userId)) {
    await slack.postMessage(
      channelId,
      "I'm still working on your last request. Please wait for it to finish before sending another.",
      threadTs || messageTs,
    );
    return;
  }

  // 4. Check global concurrency limit
  if (activeCount >= MAX_CONCURRENT_SESSIONS) {
    await slack.postMessage(
      channelId,
      "I'm currently handling a lot of requests. Please try again in a moment.",
      threadTs || messageTs,
    );
    return;
  }

  // 5. Download and format file attachments
  const fileContent = await formatFiles(files);
  const fullPrompt = fileContent ? `${text}\n${fileContent}` : text;

  // 6. Create session row
  let sessionId: string;
  try {
    sessionId = await db.createSession({
      userId: lookup.userId,
      organizationId: lookup.organizationId,
      slackChannelId: channelId,
      slackThreadTs: threadTs || messageTs,
      prompt: fullPrompt,
      model: lookup.model,
    });
  } catch (err) {
    console.error("Failed to create session:", err);
    await slack.postMessage(
      channelId,
      "Failed to start a new session. Please try again.",
      threadTs || messageTs,
    );
    return;
  }

  // 7. Track concurrency
  activeSessions.set(lookup.userId, sessionId);
  activeCount++;

  // 8. Post "Working on it..." message
  let statusTs: string;
  try {
    statusTs = await slack.postMessage(
      channelId,
      "Working on it...",
      threadTs || messageTs,
    );
  } catch (err) {
    console.error("Failed to post status message:", err);
    activeSessions.delete(lookup.userId);
    activeCount--;
    return;
  }

  const replyThread = threadTs || messageTs;

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

    // 11. Set up timeout via AbortController
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);

    // 12. Run Claude Code SDK
    let resultText: string;
    let totalTurns = 0;

    try {
      const conversation = query({
        prompt: fullPrompt,
        options: {
          model: lookup.model,
          customSystemPrompt:
            "You are a helpful AI assistant with access to the user's Switchboard integrations. Use the available MCP tools to help with their request.",
          mcpServers: {
            switchboard: {
              type: "http",
              url: process.env.SWITCHBOARD_MCP_URL!,
              headers: {
                Authorization: `Bearer ${lookup.agentKey}`,
              },
            },
          },
          allowedTools: ["mcp__switchboard__*"],
          permissionMode: "bypassPermissions",
          maxTurns: MAX_TURNS,
          abortController,
          stderr: (data: string) => console.error("[claude-code stderr]", data),
        },
      });

      // Iterate the async generator — the last 'result' message has the final text
      resultText = "";
      for await (const message of conversation) {
        console.log(`[claude-code] message type=${message.type}`);
        if (message.type === "result") {
          if (message.subtype === "success") {
            resultText = message.result;
            totalTurns = message.num_turns;
          } else {
            console.error("[claude-code] error result:", JSON.stringify(message));
          }
        }
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
        ? "Request timed out after 5 minutes."
        : err instanceof Error
          ? err.message
          : "An unknown error occurred";

      const status = isAbort ? "timeout" : "failed";

      await slack.updateMessage(
        channelId,
        statusTs,
        `Sorry, something went wrong: ${errorMessage}`,
      );
      await slack.addReaction(channelId, messageTs, "x").catch(() => {});

      await db.updateSession(sessionId, {
        status,
        error: errorMessage,
        completed_at: new Date().toISOString(),
      });

      await db.createMessage({
        sessionId,
        role: "assistant",
        content: errorMessage,
        slackTs: statusTs,
        metadata: { error: true },
      });

      return;
    }

    // 13. Success: update Slack message with result
    await slack.updateMessage(
      channelId,
      statusTs,
      truncateForSlack(resultText),
    );
    await slack.addReaction(channelId, messageTs, "white_check_mark").catch(() => {});

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
      slackTs: statusTs,
      metadata: { totalTurns },
    });
  } catch (err) {
    console.error(`Unexpected error in session ${sessionId}:`, err);
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred";

    await slack
      .updateMessage(
        channelId,
        statusTs,
        `Sorry, something went wrong: ${errorMessage}`,
      )
      .catch(() => {});
    await slack.addReaction(channelId, messageTs, "x").catch(() => {});

    await db
      .updateSession(sessionId, {
        status: "failed",
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .catch(() => {});
  } finally {
    activeSessions.delete(lookup.userId);
    activeCount--;
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

  for (const session of staleSessions) {
    await db.updateSession(session.id, {
      status: "failed",
      error: "Worker restarted — session was interrupted.",
      completed_at: new Date().toISOString(),
    });

    // Notify in Slack thread if possible
    if (session.slack_channel_id && session.slack_thread_ts) {
      await slack
        .postMessage(
          session.slack_channel_id,
          "Sorry, my previous session was interrupted by a restart. Please send your request again.",
          session.slack_thread_ts,
        )
        .catch((err) =>
          console.error(
            `Failed to notify Slack for stale session ${session.id}:`,
            err,
          ),
        );
    }
  }

  console.log("Stale session recovery complete.");
}
