import { query } from "@anthropic-ai/claude-code";
import * as slack from "./slack.js";
import * as db from "./db.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fetchUserFiles, writeFilesToStableDir, findSessionFile } from "./files.js";
import { extractClaudeMd, buildSystemPrompt } from "./prompt.js";
import { buildErrorWithRetryBlocks, buildPlanApprovalBlocks, buildPlanApprovedBlocks, buildPlanRevisingBlocks } from "./slack-blocks.js";
import { createMessageStream } from "./message-stream.js";
import { extractFileUploads, uploadExtractedFiles } from "./file-uploads.js";
import { StreamingStatusUpdater, type StreamEventLike } from "./streaming.js";
import { archiveWorkspace, restoreWorkspace } from "./workspace-storage.js";
import {
  buildThreadKey,
  getRunningSession,
  registerSession,
  unregisterSession,
} from "./session-registry.js";
import type { PlanDecision, PlanPhase } from "./session-registry.js";
import type { SlackFile } from "./types.js";

// ---------------------------------------------------------------------------
// Image / PDF / text detection helpers
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".tiff", ".ico",
]);

function isImageFile(file: SlackFile): boolean {
  return file.mimetype.startsWith("image/") || IMAGE_EXTENSIONS.has(getExtension(file.name));
}

function isPdfFile(file: SlackFile): boolean {
  return file.mimetype === "application/pdf" || getExtension(file.name) === ".pdf";
}

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

const MAX_TEXT_FILE_SIZE = 1024 * 1024; // 1 MB — for prompt embedding
const MAX_BINARY_FILE_SIZE = 100 * 1024 * 1024; // 100 MB — for disk save
const ATTACHMENTS_DIR = "attachments"; // subdirectory in tempDir for inbound files

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
  if (file.mimetype.startsWith("text/")) return true;
  const mime = file.mimetype;
  if (
    mime.includes("json") || mime.includes("xml") || mime.includes("javascript") ||
    mime.includes("typescript") || mime.includes("yaml") || mime.includes("csv") ||
    mime.includes("svg")
  ) return true;
  return TEXT_EXTENSIONS.has(getExtension(file.name));
}

/**
 * Deduplicate a filename within a directory by appending a counter suffix.
 */
async function uniqueFilename(dir: string, name: string): Promise<string> {
  let candidate = path.join(dir, name);
  try {
    await fs.access(candidate);
  } catch {
    return candidate; // doesn't exist — use as-is
  }
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let i = 1;
  while (true) {
    candidate = path.join(dir, `${base}-${i}${ext}`);
    try {
      await fs.access(candidate);
      i++;
    } catch {
      return candidate;
    }
  }
}

export async function formatFiles(files: SlackFile[], tempDir?: string | null): Promise<string> {
  if (files.length === 0) return "";

  // Pre-create attachments directory if we have binary files and a tempDir
  const attachDir = tempDir ? path.join(tempDir, ATTACHMENTS_DIR) : null;
  if (attachDir && files.some((f) => !isTextFile(f))) {
    await fs.mkdir(attachDir, { recursive: true });
  }

  const parts: string[] = [];
  for (const file of files) {
    // --- Text files: embed content in prompt ---
    if (isTextFile(file)) {
      try {
        const downloaded = await slack.downloadFile(file.urlPrivate);
        if (downloaded.content === "[Binary file]") {
          parts.push(`\n[Attached file: ${file.name} (${file.mimetype}, binary)]`);
        } else if (downloaded.content.length > MAX_TEXT_FILE_SIZE) {
          const truncated = downloaded.content.slice(0, MAX_TEXT_FILE_SIZE);
          parts.push(
            `\n--- ${file.name} (truncated to ${MAX_TEXT_FILE_SIZE} bytes) ---\n${truncated}\n--- end ${file.name} ---`,
          );
        } else {
          parts.push(
            `\n--- ${file.name} ---\n${downloaded.content}\n--- end ${file.name} ---`,
          );
        }
      } catch (err) {
        console.error(`Failed to download file ${file.name}:`, err);
        parts.push(`\n[Attached file: ${file.name} (${file.mimetype}, download failed)]`);
      }
      continue;
    }

    // --- Binary files (images, PDFs, etc.): save to disk if tempDir available ---
    if (attachDir && file.size <= MAX_BINARY_FILE_SIZE) {
      try {
        const downloaded = await slack.downloadFileAsBuffer(file.urlPrivate);
        const destPath = await uniqueFilename(attachDir, file.name);
        await fs.writeFile(destPath, downloaded.buffer);
        const relPath = path.relative(tempDir!, destPath);
        if (isImageFile(file)) {
          parts.push(
            `\n[Attached image: ${file.name} — saved to ${relPath}. Use the Read tool to view this image file.]`,
          );
        } else if (isPdfFile(file)) {
          parts.push(
            `\n[Attached PDF: ${file.name} — saved to ${relPath}. Use the Read tool to read this PDF file.]`,
          );
        } else {
          parts.push(
            `\n[Attached file: ${file.name} (${file.mimetype}) — saved to ${relPath}. Use the Read tool to access this file.]`,
          );
        }
        console.log(`[files] Saved attachment ${file.name} → ${destPath}`);
      } catch (err) {
        console.error(`Failed to save file ${file.name}:`, err);
        parts.push(`\n[Attached file: ${file.name} (${file.mimetype}, save failed)]`);
      }
      continue;
    }

    // --- Fallback: no tempDir or too large ---
    parts.push(`\n[Attached file: ${file.name} (${file.mimetype}, binary)]`);
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
// Transcript persistence helper
// ---------------------------------------------------------------------------

async function saveTranscriptIfExists(
  sessionId: string,
  claudeSessionId: string | null,
  cachedSessionFile: string | null | undefined,
  label: string,
): Promise<string | null> {
  if (!claudeSessionId) return cachedSessionFile ?? null;
  try {
    const sessionFile = cachedSessionFile ?? await findSessionFile(claudeSessionId);
    if (sessionFile) {
      const transcript = await fs.readFile(sessionFile, "utf-8");
      await db.saveSessionTranscript(sessionId, transcript, sessionFile);
      console.log(`[session ${sessionId}] Saved transcript ${label} (${transcript.length} bytes)`);
    } else {
      console.log(`[session ${sessionId}] No session file found for transcript save (${label})`);
    }
    return sessionFile;
  } catch (err) {
    console.error(`[session ${sessionId}] Failed to save transcript ${label}:`, err);
    return cachedSessionFile ?? null;
  }
}

// ---------------------------------------------------------------------------
// Workspace archive helper (non-fatal, used at eager + final save points)
// ---------------------------------------------------------------------------

async function saveWorkspaceArchive(
  workDir: string,
  userId: string,
  claudeSessionId: string,
  sessionId: string,
): Promise<void> {
  try {
    const archivePath = await archiveWorkspace({ workDir, userId, claudeSessionId });
    if (archivePath) {
      await db.updateSession(sessionId, { workspace_archive_path: archivePath });
    }
  } catch (err) {
    console.error(`[session ${sessionId}] workspace archive failed:`, err);
  }
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

  const fileContent = await formatFiles(files, running.tempDir);
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
  console.log(`[session ${running.sessionId}] follow-up injected — text_len=${fullText.length}`);

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
  let lookup: db.LookupResult;
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

  if (!lookup.ok) {
    await Promise.all([
      slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
      slack.addReaction(channelId, messageTs, "x").catch(() => {}),
    ]);

    const msg =
      lookup.reason === "no_connection"
        ? "It looks like your Slack account isn't connected to Switchboard yet. Connect Slack and enable the agent here: https://www.get-switchboard.com/mcp"
        : "Your Slack Agent isn't enabled yet. Turn it on here: https://www.get-switchboard.com/mcp";

    await slack.postMessage(channelId, msg, threadTs || messageTs);
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

  // 6. Detect plan mode prefix early (before file formatting, which needs tempDir)
  let planModeRequested = /^\s*plan\s*:/i.test(text);
  const textWithoutPlanPrefix = planModeRequested
    ? text.replace(/^\s*plan\s*:\s*/i, "")
    : text;
  if (planModeRequested) {
    await slack.addReaction(channelId, messageTs, "memo").catch(() => {});
  }

  // File formatting is deferred until after tempDir creation (step 12)
  // so binary files can be saved to disk.
  let effectivePrompt = textWithoutPlanPrefix;

  // 7. Create session row
  let sessionId: string;
  try {
    sessionId = await db.createSession({
      userId: lookup.userId,
      organizationId: lookup.organizationId,
      slackChannelId: channelId,
      slackThreadTs: threadTs || messageTs,
      slackMessageTs: messageTs,
      prompt: effectivePrompt,
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
      content: effectivePrompt,
      slackTs: messageTs,
      metadata: {
        slackUserId,
        fileCount: files.length,
        ...(planModeRequested ? { planMode: true } : {}),
      },
    });

    // 11. Pre-flight MCP connectivity check (retry once on failure — cold start may not be ready)
    try {
      const mcpUrl = process.env.SWITCHBOARD_MCP_URL!.trim();
      console.log(`[mcp-preflight] Testing ${mcpUrl} ...`);

      const doPreflight = async () => {
        const resp = await fetch(mcpUrl, {
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
        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`status=${resp.status} body=${body}`);
        }
        return resp;
      };

      try {
        const resp = await doPreflight();
        console.log(`[mcp-preflight] OK: ${(await resp.text()).slice(0, 500)}`);
      } catch (firstErr) {
        console.warn(`[mcp-preflight] First attempt failed: ${firstErr instanceof Error ? firstErr.message : firstErr}`);
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const resp = await doPreflight();
          console.log(`[mcp-preflight] OK (retry): ${(await resp.text()).slice(0, 500)}`);
        } catch (retryErr) {
          console.error(`[mcp-preflight] FAILED after retry: ${retryErr instanceof Error ? retryErr.message : retryErr}`);
        }
      }
    } catch (err) {
      console.error("[mcp-preflight] Network error:", err);
    }

    // 12. Pull user files for local read context
    try {
      const userFiles = await fetchUserFiles(lookup.agentKey);
      if (userFiles) {
        tempDir = await writeFilesToStableDir(userFiles, lookup.userId);
        claudeMdContent = extractClaudeMd(userFiles);
        console.log(`[files] Wrote ${userFiles.length} file(s) to ${tempDir}`);
      }
    } catch (err) {
      console.error("[files] Failed to pull user files:", err);
    }

    // 12a. Now that tempDir exists, format file attachments (skip on retry)
    if (!retryOf && files.length > 0) {
      const fileContent = await formatFiles(files, tempDir);
      if (fileContent) {
        effectivePrompt = `${effectivePrompt}\n${fileContent}`;
      }
    }

    // 12b. Restore session transcript from DB if resuming (survives deploys)
    if (resumeSessionId) {
      try {
        const saved = await db.getSessionTranscript(resumeSessionId);
        if (saved) {
          await fs.mkdir(path.dirname(saved.filePath), { recursive: true });
          await fs.writeFile(saved.filePath, saved.transcript, "utf-8");
          console.log(`[thread] Restored transcript for ${resumeSessionId} → ${saved.filePath}`);
        }
      } catch (err) {
        console.error(`[thread] Failed to restore transcript:`, err);
      }

      // 12c. Restore workspace files from storage if available
      if (tempDir) {
        try {
          const archivePath = await db.getWorkspaceArchivePath(resumeSessionId);
          if (archivePath) {
            const ok = await restoreWorkspace({ archivePath, targetDir: tempDir });
            if (ok) {
              console.log(`[thread] Restored workspace for ${resumeSessionId}`);
            }
          }
        } catch (err) {
          console.error(`[thread] Failed to restore workspace:`, err);
        }
      }
    }

    // 13. Set up timeout via AbortController
    const abortController = new AbortController();
    let timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);
    let sessionIsIdle = false; // true when agent completed reply and is waiting for user follow-up

    // 14. Create message stream + register in session registry
    const threadKey = buildThreadKey(channelId, threadTs || messageTs);
    let stream = createMessageStream(effectivePrompt);

    const runningSession = {
      sessionId,
      claudeSessionId: null as string | null,
      tempDir,
      pendingFollowUpTs: [] as string[],
      pushMessage: stream.pushMessage,
      close: stream.close,
      openGate: stream.openGate,
      isPlanMode: planModeRequested,
      planPhase: (planModeRequested ? "exploring" : "off") as PlanPhase,
      pendingPlanApproval: null as import("./session-registry.js").PendingPlanApproval | null,
      setPermissionMode: null as ((mode: import("@anthropic-ai/claude-code").PermissionMode) => Promise<void>) | null,
    };
    registerSession(threadKey, runningSession);
    console.log(`[session ${sessionId}] registered — thread=${threadKey} active=${activeCount}`);

    // 15. Run Claude Code SDK (multi-turn)
    let lastResultText: string | null = null;
    let checkedOff = false;
    let totalTurns = 0;
    let cachedSessionFilePath: string | null | undefined; // cached after first findSessionFile
    let totalCost = 0;
    let planApproved = false;
    let planExecutionStarted = false;
    let approvedPlanText: string | null = null;
    let statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false });

    try {
      const systemPrompt = buildSystemPrompt(claudeMdContent, undefined, {
        name: lookup.name,
        email: lookup.email,
        slackUserId,
      });

      const buildQueryOptions = () => {
        const baseOptions = {
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
          abortController,
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
          stderr: (data: string) => {
            const redacted = data
              .replace(/Bearer [^\s"']+/g, "Bearer [REDACTED]")
              .replace(/sk_live_[^\s"']+/g, "sk_live_[REDACTED]");
            console.error("[claude-code stderr]", redacted);
          },
        };

        if (planModeRequested) {
          return {
            ...baseOptions,
            permissionMode: "plan" as const,
            hooks: {
              PreToolUse: [
                {
                  matcher: "ExitPlanMode",
                  hooks: [
                    async (input: import("@anthropic-ai/claude-code").HookInput) => {
                      const toolInput = (input as import("@anthropic-ai/claude-code").PreToolUseHookInput).tool_input as { plan?: string };
                      const plan = toolInput?.plan || "(No plan provided)";

                      console.log(`[session ${sessionId}] Plan submitted (len=${plan.length})`);

                      // Post plan to Slack with approval button
                      const planBlocks = buildPlanApprovalBlocks(slack.markdownToSlack(plan), sessionId);
                      const planTs = await slack.postMessage(
                        channelId,
                        slack.markdownToSlack(plan),
                        replyThread,
                        planBlocks,
                      );

                      // Store plan as assistant message
                      await db.createMessage({
                        sessionId,
                        role: "assistant",
                        content: plan,
                        slackTs: planTs,
                        metadata: { isPlan: true },
                      });

                      // Transition to presented phase and block until user approves or provides revision feedback
                      runningSession.planPhase = "presented";
                      const decision = await new Promise<PlanDecision>((resolve) => {
                        runningSession.pendingPlanApproval = {
                          plan,
                          planMessageTs: planTs,
                          resolve,
                        };
                      });

                      runningSession.pendingPlanApproval = null;

                      if (decision.action === "approve") {
                        // Transition to approved phase
                        runningSession.planPhase = "approved";

                        // Update Slack message to show approved state
                        const approvedBlocks = buildPlanApprovedBlocks(slack.markdownToSlack(plan));
                        await slack.updateMessage(channelId, planTs, slack.markdownToSlack(plan), approvedBlocks).catch(() => {});

                        // Switch to full permissions
                        if (runningSession.setPermissionMode) {
                          await runningSession.setPermissionMode("bypassPermissions");
                        }

                        console.log(`[session ${sessionId}] Plan approved — switching to bypassPermissions`);
                        planApproved = true;
                        approvedPlanText = plan;
                        return {
                          hookSpecificOutput: {
                            hookEventName: "PreToolUse" as const,
                            permissionDecision: "allow" as const,
                          },
                        };
                      } else {
                        // Transition to revising phase
                        runningSession.planPhase = "revising";

                        // Update Slack message to show revising state
                        const revisingBlocks = buildPlanRevisingBlocks(slack.markdownToSlack(plan));
                        await slack.updateMessage(channelId, planTs, slack.markdownToSlack(plan), revisingBlocks).catch(() => {});

                        console.log(`[session ${sessionId}] Plan revision requested: ${decision.feedback.slice(0, 100)}`);

                        // Go back to exploring for the next iteration
                        runningSession.planPhase = "exploring";

                        return {
                          hookSpecificOutput: {
                            hookEventName: "PreToolUse" as const,
                            permissionDecision: "deny" as const,
                            permissionDecisionReason: decision.feedback,
                          },
                        };
                      }
                    },
                  ],
                },
              ],
            },
          };
        }

        return {
          ...baseOptions,
          permissionMode: "bypassPermissions" as const,
        };
      };

      // Reset streaming status updater for this conversation run
      statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false });

      const runConversation = async () => {
        const conversation = query({
          prompt: stream.iterable,
          options: {
            ...buildQueryOptions(),
            includePartialMessages: true,
          },
        });

        // Expose setPermissionMode so the plan approval hook can switch modes
        if (planModeRequested) {
          runningSession.setPermissionMode = (mode) => conversation.setPermissionMode(mode);
        }

        // Diagnostic counters — set up BEFORE mcpServerStatus so heartbeat runs even if it hangs
        const startTime = Date.now();
        const msgCounts = new Map<string, number>();
        const recentMessages: string[] = []; // last 10 type:subtype labels
        let lastMessageAt = Date.now();
        let waitingForFollowUp = false; // true after result:success — waiting for user, not SDK

        // Sync with outer scope so the catch block knows if we were idle
        const syncIdleState = (idle: boolean) => { waitingForFollowUp = idle; sessionIsIdle = idle; };

        // Independent heartbeat — logging-only (no inactivity abort; 4-hour hard ceiling is the only timeout)
        const heartbeat = setInterval(() => {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const sinceLast = Math.round((Date.now() - lastMessageAt) / 1000);
          const streamState = stream.getState();
          console.log(
            `[session ${sessionId}] heartbeat ${elapsed}s — last_msg=${sinceLast}s ago — waiting=${waitingForFollowUp} — gate=${streamState.gateOpen} — queued=${streamState.queueLength} — counts=${JSON.stringify(Object.fromEntries(msgCounts))}`,
          );
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
            if (waitingForFollowUp) {
              syncIdleState(false);
              await db.updateSession(sessionId, { status: "running" });
              // Restart the 4-hour timeout for this new active turn
              clearTimeout(timeoutId);
              timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);
            }

            // Stream events — update the live status line in Slack
            if (message.type === "stream_event") {
              statusUpdater.handleStreamEvent((message as { event: StreamEventLike }).event);
              continue;
            }

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
              statusUpdater.handleAssistantMessage();
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

                // Finalize streaming status line
                await statusUpdater.finalize();

                // Reset for next turn so follow-up messages get their own status line
                statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false });

                lastAssistantText = ""; // reset for next turn
                lastResultText = text;
                totalTurns += message.num_turns;
                totalCost += message.total_cost_usd;

                // Plan mode → suppress ALL result:success messages during plan phase.
                // The plan itself is shown via approval blocks. Only the execution phase posts results.
                if (planModeRequested && !planExecutionStarted) {
                  console.log(`[session ${sessionId}] plan phase result:success suppressed (phase=${runningSession.planPhase}) — will not post to Slack`);

                  await db.createMessage({
                    sessionId,
                    role: "assistant",
                    content: text,
                    slackTs: null,
                    metadata: { turns: message.num_turns, cost: message.total_cost_usd, isPlanSummary: true, planPhase: runningSession.planPhase },
                  });

                  continue;
                }

                // Extract FILE_UPLOAD directives before formatting
                const { cleanText, uploads } = extractFileUploads(text);

                // Upload FILE_UPLOAD directive files first (independent of text post)
                if (uploads.length > 0) {
                  await uploadExtractedFiles(uploads, channelId, replyThread, sessionId);
                }

                // Post text to Slack (skip if response was only FILE_UPLOAD directives)
                const slackText = cleanText
                  ? truncateForSlack(slack.markdownToSlack(cleanText))
                  : null;

                try {
                  if (slackText) {
                    const resultTs = await slack.postMessage(
                      channelId,
                      slackText,
                      replyThread,
                    );
                    console.log(`[session ${sessionId}] posted to Slack ts=${resultTs}`);

                    await db.createMessage({
                      sessionId,
                      role: "assistant",
                      content: cleanText,
                      slackTs: resultTs,
                      metadata: { turns: message.num_turns, cost: message.total_cost_usd },
                    });

                    // Upload full response as file if it was truncated
                    if (cleanText.length > SLACK_MAX_TEXT) {
                      try {
                        await slack.uploadFile({
                          channelId,
                          threadTs: replyThread,
                          filename: "response.md",
                          content: cleanText,
                          title: "Full response",
                        });
                        console.log(`[session ${sessionId}] uploaded full response as response.md`);
                      } catch (uploadErr) {
                        console.error(`[session ${sessionId}] failed to upload response.md:`, uploadErr);
                      }
                    }
                  } else {
                    console.log(`[session ${sessionId}] no text to post (file-only response)`);
                    await db.createMessage({
                      sessionId,
                      role: "assistant",
                      content: uploads.map((u) => `[Uploaded ${u.path}]`).join("\n"),
                      slackTs: null,
                      metadata: { turns: message.num_turns, cost: message.total_cost_usd },
                    });
                  }

                  // Swap eyes → checkmark on the message that triggered this reply
                  if (!checkedOff) {
                    // First result — check off the original user message
                    checkedOff = true;
                    await Promise.all([
                      slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
                      slack.addReaction(channelId, messageTs, "white_check_mark").catch(() => {}),
                    ]);
                  } else if (runningSession.pendingFollowUpTs.length > 0) {
                    // Subsequent result — check off the earliest pending follow-up
                    const followUpTs = runningSession.pendingFollowUpTs.shift()!;
                    await Promise.all([
                      slack.removeReaction(channelId, followUpTs, "eyes").catch(() => {}),
                      slack.addReaction(channelId, followUpTs, "white_check_mark").catch(() => {}),
                    ]);
                  }
                } catch (slackErr) {
                  console.error(`[session ${sessionId}] failed to post result to Slack:`, slackErr);
                  // Retry with plain text (no markdown conversion, truncated)
                  if (slackText) {
                    try {
                      await slack.postMessage(channelId, cleanText.slice(0, 3900), replyThread);
                    } catch (retryErr) {
                      console.error(`[session ${sessionId}] retry also failed:`, retryErr);
                    }
                  }
                }

                // Save transcript + workspace eagerly (survives deploys that kill the container before idle timeout)
                cachedSessionFilePath = await saveTranscriptIfExists(
                  sessionId, claudeSessionId, cachedSessionFilePath, "eager",
                );
                // Fire-and-forget: archive workspace without blocking idle timer
                if (tempDir && claudeSessionId) {
                  saveWorkspaceArchive(tempDir, lookup.userId, claudeSessionId, sessionId);
                }

                // Mark as waiting for user follow-up and open the gate for the next message
                syncIdleState(true);
                await db.updateSession(sessionId, { status: "idle" });
                // Clear the active-processing timeout — session is idle, not stuck
                clearTimeout(timeoutId);
                stream.openGate();
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

          // Final transcript + workspace save (captures any follow-up turns since the eager save)
          await Promise.all([
            saveTranscriptIfExists(sessionId, claudeSessionId, cachedSessionFilePath, "final"),
            tempDir && claudeSessionId
              ? saveWorkspaceArchive(tempDir, lookup.userId, claudeSessionId, sessionId)
              : Promise.resolve(),
          ]);

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
          // Recreate stream — the previous one's async generator is consumed/done
          stream.close();
          stream = createMessageStream(effectivePrompt);
          runningSession.pushMessage = stream.pushMessage;
          runningSession.close = stream.close;
          runningSession.openGate = stream.openGate;
          await runConversation();
        } else {
          throw err;
        }
      }

      // Plan approved — start fresh execution conversation with clean context.
      if (planModeRequested && planApproved && !planExecutionStarted) {
        console.log(`[session ${sessionId}] plan approved — starting execution with clean context`);

        // Post execution-started message + remove plan-phase reaction in parallel
        await Promise.all([
          slack.postMessage(channelId, ":rocket: Plan approved — executing now...", replyThread),
          slack.removeReaction(channelId, messageTs, "memo").catch(() => {}),
        ]);

        stream.close();

        // Fresh status updater for the execution phase
        statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false });

        const executionPrompt = [
          "The following plan was approved by the user. Execute it now.",
          "",
          "## Approved Plan",
          approvedPlanText,
          "",
          "Proceed with execution immediately — do not ask for further confirmation.",
        ].join("\n");

        stream = createMessageStream(executionPrompt);
        runningSession.pushMessage = stream.pushMessage;
        runningSession.close = stream.close;
        runningSession.openGate = stream.openGate;

        planModeRequested = false;   // buildQueryOptions() returns bypassPermissions
        planExecutionStarted = true;
        runningSession.planPhase = "off";
        runningSession.isPlanMode = false;

        await db.createMessage({
          sessionId,
          role: "user",
          content: executionPrompt,
          slackTs: null,
          metadata: { isAutoInjected: true, planExecution: true },
        });

        await runConversation();
      }

      // Finalize streaming status if not already done
      await statusUpdater.finalize();

      clearTimeout(timeoutId);

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
      stream.close();

      const isAbort =
        err instanceof Error &&
        (err.message.includes("aborted by user") ||
          err.message === "Operation aborted");

      // If the session was idle (agent already responded, waiting for user follow-up)
      // and got killed by timeout/reaper, silently complete — don't post a scary error.
      if (isAbort && sessionIsIdle) {
        console.log(`[session ${sessionId}] idle session aborted by timeout — completing silently (no error posted)`);
        await statusUpdater.finalize().catch(() => {});
        await db.updateSession(sessionId, {
          status: "completed",
          result: lastResultText,
          total_turns: totalTurns,
          completed_at: new Date().toISOString(),
        }).catch(() => {});
        return;
      }

      console.error(`[session ${sessionId}] error caught: type=${err instanceof Error ? err.constructor?.name : typeof err} message=${err instanceof Error ? err.message : String(err)}`);

      // Finalize streaming status with error state
      await statusUpdater.finalizeError(err instanceof Error ? err.message : "Unknown error").catch(() => {});

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

    // 16. Finalize: swap emoji on the original message if not already checked off
    if (!checkedOff) {
      await Promise.all([
        slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
        slack.addReaction(channelId, messageTs, "white_check_mark").catch(() => {}),
      ]);
    }

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
    const threadKey = buildThreadKey(channelId, threadTs || messageTs);
    unregisterSession(threadKey);
    console.log(`[session ${sessionId}] unregistered — thread=${threadKey} active=${activeCount}`);
    // tempDir is stable (keyed by userId) and reused across sessions — no cleanup
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

  const idleSessions = staleSessions.filter((s) => s.status === "idle");
  const runningSessions = staleSessions.filter((s) => s.status === "running");
  console.log(`Recovering ${runningSessions.length} running + ${idleSessions.length} idle stale session(s)...`);

  // Idle sessions: silently complete — agent was waiting for user input, not mid-reply
  await Promise.all(idleSessions.map(async (session) => {
    await db.updateSession(session.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    if (session.slack_channel_id && session.slack_message_ts) {
      await slack.removeReaction(session.slack_channel_id, session.slack_message_ts, "eyes").catch(() => {});
    }
  }));

  // Running sessions: mark failed + post error with retry
  await Promise.all(runningSessions.map(async (session) => {
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
  if (!lookup.ok) {
    console.error(`Retry: Slack user ${triggerSlackUserId} not found (${lookup.reason})`);
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
