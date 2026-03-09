import { query } from "@anthropic-ai/claude-code";
import * as slack from "./slack.js";
import * as db from "./db.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fetchUserFiles, writeFilesToStableDir, findSessionFile } from "./files.js";
import { extractClaudeMd, buildSystemPrompt } from "./prompt.js";
import { buildErrorWithRetryBlocks, buildPlanApprovalBlocks, buildPlanApprovedBlocks, buildPlanRevisingBlocks } from "./slack-blocks.js";
import { createMessageStream } from "./message-stream.js";
import { extractFileUploads, uploadExtractedFiles, type UploadResult } from "./file-uploads.js";
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
import { ensureChromeRunning, cleanupTabs, chromeMcpArgs } from "./chrome.js";
import { logger } from "./logger.js";
import { prepareWorkspaceForPlan } from "./plan-workspace.js";

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
        logger.error({ err, filename: file.name }, "Failed to download file");
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
        logger.info({ filename: file.name, destPath }, "[files] Saved attachment");
      } catch (err) {
        logger.error({ err, filename: file.name }, "Failed to save file");
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
      logger.info({ sessionId, label, bytes: transcript.length }, "Saved transcript");
    } else {
      logger.info({ sessionId, label }, "No session file found for transcript save");
    }
    return sessionFile;
  } catch (err) {
    logger.error({ err, sessionId, label }, "Failed to save transcript");
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
    logger.error({ err, sessionId }, "workspace archive failed");
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
  logger.info({ sessionId: running.sessionId, textLen: fullText.length }, "follow-up injected");

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
    logger.error({ err }, "User lookup failed");
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
        logger.info({ resumeSessionId }, "[thread] Resuming Claude session");
      }
    } catch (err) {
      logger.error({ err }, "Failed to look up thread session");
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
    logger.error({ err }, "Failed to create session");
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
  let chromeMcpEnabled = false;

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
      logger.info({ mcpUrl }, "[mcp-preflight] Testing");

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
        logger.info({ response: (await resp.text()).slice(0, 500) }, "[mcp-preflight] OK");
      } catch (firstErr) {
        logger.warn({ err: firstErr }, "[mcp-preflight] First attempt failed");
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const resp = await doPreflight();
          logger.info({ response: (await resp.text()).slice(0, 500) }, "[mcp-preflight] OK (retry)");
        } catch (retryErr) {
          logger.error({ err: retryErr }, "[mcp-preflight] FAILED after retry");
        }
      }
    } catch (err) {
      logger.error({ err }, "[mcp-preflight] Network error");
    }

    // 12. Pull user files for local read context
    try {
      const userFiles = await fetchUserFiles(lookup.agentKey);
      if (userFiles) {
        tempDir = await writeFilesToStableDir(userFiles, lookup.userId);
        claudeMdContent = extractClaudeMd(userFiles);
        logger.info({ fileCount: userFiles.length, tempDir }, "[files] Wrote files");
      }
    } catch (err) {
      logger.error({ err }, "[files] Failed to pull user files");
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
          logger.info({ resumeSessionId, filePath: saved.filePath }, "[thread] Restored transcript");
        }
      } catch (err) {
        logger.error({ err }, "[thread] Failed to restore transcript");
      }

      // 12c. Restore workspace files from storage if available
      if (tempDir) {
        try {
          const archivePath = await db.getWorkspaceArchivePath(resumeSessionId);
          if (archivePath) {
            const ok = await restoreWorkspace({ archivePath, targetDir: tempDir });
            if (ok) {
              logger.info({ resumeSessionId }, "[thread] Restored workspace");
            }
          }
        } catch (err) {
          logger.error({ err }, "[thread] Failed to restore workspace");
        }
      }
    }

    // 12d. Plan mode workspace preparation — clone repos before entering read-only plan mode
    if (planModeRequested && tempDir) {
      try {
        logger.info({ sessionId }, "[plan-prep] Starting workspace preparation");
        const statusMsg = await slack.postMessage(
          channelId,
          ":mag: Setting up workspace for planning...",
          replyThread,
        );

        const prepResult = await prepareWorkspaceForPlan({
          prompt: effectivePrompt,
          cwd: tempDir,
          model: lookup.model,
          mcpServerUrl: process.env.SWITCHBOARD_MCP_URL!.trim(),
          agentKey: lookup.agentKey,
        });

        if (prepResult.success) {
          logger.info({ sessionId, summary: prepResult.summary?.slice(0, 200) }, "[plan-prep] Workspace ready");
          await slack.updateMessage(
            channelId,
            statusMsg,
            `:white_check_mark: Workspace ready — now planning...`,
          ).catch(() => {});
        } else {
          logger.warn({ sessionId, error: prepResult.error }, "[plan-prep] Workspace prep failed (non-fatal)");
          await slack.updateMessage(
            channelId,
            statusMsg,
            `:warning: Workspace setup had issues — planning with available context...`,
          ).catch(() => {});
        }
      } catch (err) {
        logger.error({ err, sessionId }, "[plan-prep] Workspace prep threw (non-fatal)");
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
      abortController,
      killedByUser: false,
    };
    registerSession(threadKey, runningSession);
    logger.info({ sessionId, threadKey, activeCount }, "session registered");

    // 14b. Ensure headless Chrome is running for browser tools
    chromeMcpEnabled = process.env.ENABLE_CHROME_MCP !== "false" && lookup.chromeMcpEnabled !== false;
    if (chromeMcpEnabled) {
      try {
        await ensureChromeRunning();
      } catch (err) {
        logger.error({ err, sessionId }, "Chrome startup failed (non-fatal)");
      }
    }

    // 15. Run Claude Code SDK (multi-turn)
    let lastResultText: string | null = null;
    let checkedOff = false;
    let totalTurns = 0;
    let cachedSessionFilePath: string | null | undefined; // cached after first findSessionFile
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let planApproved = false;
    let planExecutionStarted = false;
    let approvedPlanText: string | null = null;
    let statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false, sessionId });

    try {
      const systemPrompt = buildSystemPrompt(claudeMdContent, undefined, {
        name: lookup.name,
        email: lookup.email,
        slackUserId,
      }, { planMode: planModeRequested });

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
            ...(chromeMcpEnabled ? {
              "chrome-devtools": {
                type: "stdio" as const,
                command: "chrome-devtools-mcp",
                args: chromeMcpArgs(),
              },
            } : {}),
          },
          abortController,
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
          stderr: (data: string) => {
            const redacted = data
              .replace(/Bearer [^\s"']+/g, "Bearer [REDACTED]")
              .replace(/sk_live_[^\s"']+/g, "sk_live_[REDACTED]");
            logger.error({ stderr: redacted }, "[claude-code stderr]");
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

                      logger.info({ sessionId, planLen: plan.length }, "Plan submitted");

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

                        logger.info({ sessionId }, "Plan approved — switching to bypassPermissions");
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

                        logger.info({ sessionId, feedback: decision.feedback.slice(0, 100) }, "Plan revision requested");

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
      statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false, sessionId });

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
          logger.info(
            { sessionId, elapsed, sinceLast, waiting: waitingForFollowUp, gateOpen: streamState.gateOpen, queued: streamState.queueLength, counts: Object.fromEntries(msgCounts) },
            "session heartbeat",
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
            logger.info({ mcpStatus }, "[mcp-status]");
          } catch (err) {
            logger.info({ err }, "[mcp-status] not available");
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
              logger.info({ message }, "[claude-code system]");
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
              logger.info(
                { sessionId, msgId: msg.message?.id, blockTypes, stopReason: msg.message?.stop_reason || "?" },
                "assistant message received",
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
                  logger.warn(
                    { sessionId, fallback: lastAssistantText ? `lastAssistantText (len=${lastAssistantText.length})` : "fallback" },
                    "result.result empty — using fallback",
                  );
                }
                logger.info(
                  { sessionId, len: text.length, preview: text.slice(0, 200) },
                  "result:success",
                );

                // Finalize streaming status line
                await statusUpdater.finalize();

                // Reset for next turn so follow-up messages get their own status line
                statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false, sessionId });

                lastAssistantText = ""; // reset for next turn
                lastResultText = text;
                totalTurns += message.num_turns;
                totalCost += message.total_cost_usd;
                if (message.usage) {
                  totalInputTokens += message.usage.input_tokens ?? 0;
                  totalOutputTokens += message.usage.output_tokens ?? 0;
                }

                // Plan mode → suppress ALL result:success messages during plan phase.
                // The plan itself is shown via approval blocks. Only the execution phase posts results.
                if (planModeRequested && !planExecutionStarted) {
                  logger.info({ sessionId, planPhase: runningSession.planPhase }, "plan phase result:success suppressed — will not post to Slack");

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
                if (uploads.length > 0) {
                  console.log(`[session ${sessionId}] FILE_UPLOAD: found ${uploads.length} directive(s): ${uploads.map((u) => u.path).join(", ")}`);
                } else if (text.includes("FILE_UPLOAD")) {
                  // The text mentions FILE_UPLOAD but regex didn't match — likely formatting issue
                  console.warn(`[session ${sessionId}] FILE_UPLOAD: text contains "FILE_UPLOAD" but no directives matched. Text preview: ${JSON.stringify(text.slice(Math.max(0, text.indexOf("FILE_UPLOAD") - 50), text.indexOf("FILE_UPLOAD") + 100))}`);
                }

                // Upload FILE_UPLOAD directive files first (independent of text post)
                let uploadResults: UploadResult[] = [];
                if (uploads.length > 0) {
                  uploadResults = await uploadExtractedFiles(uploads, channelId, replyThread, sessionId);

                  // Post visible warning to user for any failed uploads
                  const failures = uploadResults.filter((r) => !r.success);
                  if (failures.length > 0) {
                    const failureMsg = failures.map((f) => `• ${f.filename}: ${f.error}`).join("\n");
                    try {
                      await slack.postMessage(
                        channelId,
                        `:warning: Failed to upload ${failures.length} file(s):\n${failureMsg}`,
                        replyThread,
                      );
                    } catch (warnErr) {
                      logger.error({ err: warnErr, sessionId }, "failed to post upload failure warning");
                    }
                  }

                  // Log summary
                  const successes = uploadResults.filter((r) => r.success);
                  if (successes.length > 0) {
                    logger.info({ sessionId, count: successes.length, files: successes.map((s) => s.filename) }, "FILE_UPLOAD summary");
                  }
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
                    logger.info({ sessionId, resultTs }, "posted to Slack");

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
                        logger.info({ sessionId }, "uploaded full response as response.md");
                      } catch (uploadErr) {
                        logger.error({ err: uploadErr, sessionId }, "failed to upload response.md");
                      }
                    }
                  } else {
                    logger.info({ sessionId }, "no text to post (file-only response)");
                    const uploadSummary = uploadResults.length > 0
                      ? uploadResults.map((r) => r.success ? `[Uploaded ${r.filename}]` : `[Failed: ${r.filename} — ${r.error}]`).join("\n")
                      : uploads.map((u) => `[Uploaded ${u.path}]`).join("\n");
                    await db.createMessage({
                      sessionId,
                      role: "assistant",
                      content: uploadSummary,
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
                  logger.error({ err: slackErr, sessionId }, "failed to post result to Slack");
                  // Retry with plain text (no markdown conversion, truncated)
                  if (slackText) {
                    try {
                      await slack.postMessage(channelId, cleanText.slice(0, 3900), replyThread);
                    } catch (retryErr) {
                      logger.error({ err: retryErr, sessionId }, "retry also failed");
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
                logger.error({ message }, "[claude-code] error result");
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
          logger.info(
            { sessionId, elapsed, counts: Object.fromEntries(msgCounts), hasResult: !!lastResultText, resultLen: lastResultText?.length ?? 0 },
            "conversation done",
          );
          if (!lastResultText) {
            logger.warn(
              { sessionId, recentMessages },
              "no result text captured",
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
          logger.warn(
            { err, resumeSessionId },
            "[thread] Resume failed, starting fresh",
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
        logger.info({ sessionId }, "plan approved — starting execution with clean context");

        // Post execution-started message + remove plan-phase reaction in parallel
        await Promise.all([
          slack.postMessage(channelId, ":rocket: Plan approved — executing now...", replyThread),
          slack.removeReaction(channelId, messageTs, "memo").catch(() => {}),
        ]);

        stream.close();

        // Fresh status updater for the execution phase
        statusUpdater = new StreamingStatusUpdater({ channelId, threadTs: replyThread, enabled: lookup.showThinking !== false, sessionId });

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
        logger.warn({ sessionId }, "fallback — no result text after conversation completed");
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
        logger.info({ sessionId }, "idle session aborted by timeout — completing silently");
        await statusUpdater.finalize().catch(() => {});
        await db.updateSession(sessionId, {
          status: "completed",
          ...(lastResultText ? { result: lastResultText } : {}),
          total_turns: totalTurns,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          completed_at: new Date().toISOString(),
        }).catch(() => {});
        return;
      }

      logger.error({ sessionId, errType: err instanceof Error ? err.constructor?.name : typeof err, err }, "session error caught");

      const isUserKill = isAbort && runningSession.killedByUser;

      if (isUserKill) {
        // User clicked Stop — clean finalization, no error message
        await statusUpdater.finalizeKilled().catch(() => {});

        // Swap eyes → stop_sign on the original message
        await Promise.all([
          slack.removeReaction(channelId, messageTs, "eyes").catch(() => {}),
          slack.addReaction(channelId, messageTs, "octagonal_sign").catch(() => {}),
        ]);

        await db.updateSession(sessionId, {
          status: "completed",
          result: "Session stopped by user.",
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          completed_at: new Date().toISOString(),
        }).catch(() => {});

        logger.info({ sessionId }, "cleanly stopped by user");
      } else {
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
      }

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
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, sessionId }, "Unexpected error in session");
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
    logger.info({ sessionId, threadKey, activeCount }, "session unregistered");
    // tempDir is stable (keyed by userId) and reused across sessions — no cleanup

    // Clean up Chrome tabs opened during this session
    if (chromeMcpEnabled) {
      cleanupTabs().catch((err) => {
        logger.error({ err, sessionId }, "Chrome tab cleanup failed");
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Crash recovery: mark stale running sessions as failed
// ---------------------------------------------------------------------------

export async function recoverStaleSessions(): Promise<void> {
  const staleSessions = await db.getStaleRunningSessions();
  if (staleSessions.length === 0) {
    logger.info("No stale sessions to recover.");
    return;
  }

  const idleSessions = staleSessions.filter((s) => s.status === "idle");
  const runningSessions = staleSessions.filter((s) => s.status === "running");
  logger.info({ runningCount: runningSessions.length, idleCount: idleSessions.length }, "Recovering stale sessions");

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
          logger.error(
            { err, sessionId: session.id },
            "Failed to notify Slack for stale session",
          ),
        );
    }
  }));

  logger.info("Stale session recovery complete.");
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
    logger.error({ sessionId }, "Retry: session not found");
    return;
  }

  if (session.status !== "failed" && session.status !== "timeout") {
    logger.warn({ sessionId, status: session.status }, "Retry: session has non-retryable status, skipping");
    return;
  }

  // 2. Look up Slack user (fresh credentials)
  const lookup = await db.lookupUserBySlackId(triggerSlackUserId);
  if (!lookup.ok) {
    logger.error({ slackUserId: triggerSlackUserId, reason: lookup.reason }, "Retry: Slack user not found");
    return;
  }

  // 3. Verify the clicking user owns the session
  if (lookup.userId !== session.user_id) {
    logger.warn({ sessionOwner: session.user_id, clicker: lookup.userId }, "Retry: user mismatch");
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
