// ---------------------------------------------------------------------------
// Streaming status updater for Slack
//
// Posts a single "status line" message in a Slack thread and updates it
// in-place as the agent works. Tool calls ACCUMULATE into a visible log
// so users can see the full activity history at a glance — like Claude Code.
//
// Lifecycle:
//   1. First meaningful event → post status message
//   2. Subsequent events → update in-place with accumulated log (throttled)
//   3. finalize() → append summary footer
// ---------------------------------------------------------------------------

import * as slack from "./slack.js";
import { buildStatusWithStopBlocks, buildStatusStoppedBlocks } from "./slack-blocks.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum interval between Slack chat.update calls */
const THROTTLE_MS = 3_000;

/** Max characters for the tool input preview */
const MAX_INPUT_PREVIEW = 80;

/** Max completed tools to show before collapsing older entries */
const MAX_VISIBLE_TOOLS = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StreamEventLike = {
  type: string;
  content_block?: {
    type: string;
    name?: string;
    id?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
  index?: number;
};

export interface StatusUpdaterOptions {
  channelId: string;
  threadTs: string;
  enabled?: boolean;
  /** When set, the status line includes a "Stop" button tied to this session. */
  sessionId?: string;
}

/** A completed tool call for the accumulated log. */
export interface CompletedToolEntry {
  name: string;
  preview: string;
  isSubAgent: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable preview from a tool's input object.
 * Returns a short string like: `searching for "handleAuth" in src/`
 */
export function formatToolInputPreview(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const parts: string[] = [];

  // Common patterns by tool name
  const name = toolName.toLowerCase();

  if (name.includes("read") || name === "read") {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("edit") || name.includes("multiedit") || name === "edit") {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("write") || name === "write") {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("grep") || name === "grep") {
    if (input.pattern) parts.push(`"${input.pattern}"`);
    if (input.path) parts.push(`in ${input.path}`);
  } else if (name.includes("glob") || name === "glob") {
    if (input.pattern) parts.push(String(input.pattern));
    if (input.path) parts.push(`in ${input.path}`);
  } else if (name.includes("bash") || name === "bash") {
    if (input.command) parts.push(String(input.command));
  } else if (name.includes("task") || name === "task") {
    if (input.description) parts.push(String(input.description));
  } else if (name.includes("websearch") || name === "websearch") {
    if (input.query) parts.push(`"${input.query}"`);
  } else if (name.includes("webfetch") || name === "webfetch") {
    if (input.url) parts.push(String(input.url));
  } else if (name.includes("notebookedit") || name === "notebookedit") {
    if (input.notebook_path) parts.push(String(input.notebook_path));
  }

  // Fallback: show first string-valued key
  if (parts.length === 0) {
    for (const [, v] of Object.entries(input)) {
      if (typeof v === "string" && v.length > 0) {
        parts.push(v);
        break;
      }
    }
  }

  const preview = parts.join(" ");
  if (preview.length > MAX_INPUT_PREVIEW) {
    return preview.slice(0, MAX_INPUT_PREVIEW - 1) + "…";
  }
  return preview;
}

/**
 * Format a friendly tool name for display.
 * Strips MCP server prefixes (e.g. "switchboard__file_read" → "file_read")
 */
export function formatToolName(rawName: string): string {
  // Strip MCP prefix (mcp__servername__toolname → toolname)
  let name = rawName;
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    name = parts.length >= 3 ? parts.slice(2).join("__") : parts[parts.length - 1];
  }
  return name;
}

/**
 * Detect whether a tool call is a sub-agent invocation (Task tool).
 */
export function isSubAgentTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return lower === "task" || lower.includes("task");
}

/**
 * Format a single completed tool line for the accumulated log.
 */
export function formatCompletedToolLine(entry: CompletedToolEntry): string {
  const icon = entry.isSubAgent ? ":robot_face:" : ":white_check_mark:";
  const label = entry.isSubAgent ? `*${entry.name}* (sub-agent)` : `*${entry.name}*`;
  return entry.preview
    ? `${icon} ${label} — ${entry.preview}`
    : `${icon} ${label}`;
}

/**
 * Format the currently-active tool line (spinner style).
 */
export function formatActiveToolLine(name: string, preview?: string, isSubAgent?: boolean): string {
  const icon = isSubAgent ? ":robot_face:" : ":gear:";
  const label = isSubAgent ? `*${name}* (sub-agent)` : `*${name}*`;
  return preview
    ? `${icon} ${label} — ${preview}`
    : `${icon} ${label}`;
}

/**
 * Build the full accumulated status text from completed + active tool state.
 */
export function buildAccumulatedStatus(
  completedTools: CompletedToolEntry[],
  activeTool?: { name: string; preview?: string; isSubAgent?: boolean },
  footer?: string,
): string {
  const lines: string[] = [];

  // Collapse older entries if too many
  if (completedTools.length > MAX_VISIBLE_TOOLS) {
    const hidden = completedTools.length - MAX_VISIBLE_TOOLS;
    lines.push(`_… ${hidden} earlier tool calls_`);
    for (const entry of completedTools.slice(hidden)) {
      lines.push(formatCompletedToolLine(entry));
    }
  } else {
    for (const entry of completedTools) {
      lines.push(formatCompletedToolLine(entry));
    }
  }

  // Active tool (currently running)
  if (activeTool) {
    lines.push(formatActiveToolLine(activeTool.name, activeTool.preview, activeTool.isSubAgent));
  }

  // Footer (done / error)
  if (footer) {
    lines.push(footer);
  }

  return lines.join("\n");
}

/**
 * Build the status text for a given phase.
 * Kept for backward compatibility — used for simple single-line statuses.
 */
export function buildStatusText(
  phase: "thinking" | "tool" | "done" | "error",
  opts?: { toolName?: string; toolPreview?: string; toolCount?: number; elapsed?: number; errorMessage?: string },
): string {
  switch (phase) {
    case "thinking":
      return ":hourglass_flowing_sand: Thinking…";
    case "tool": {
      const name = opts?.toolName ?? "unknown";
      const preview = opts?.toolPreview;
      return preview
        ? `:gear: Using tool: *${name}* — ${preview}`
        : `:gear: Using tool: *${name}*`;
    }
    case "done": {
      const tools = opts?.toolCount ?? 0;
      const secs = opts?.elapsed ?? 0;
      const toolStr = tools === 1 ? "1 tool call" : `${tools} tool calls`;
      return `:white_check_mark: Done (${toolStr}, ${secs}s)`;
    }
    case "error": {
      return `:x: Error${opts?.errorMessage ? `: ${opts.errorMessage}` : ""}`;
    }
  }
}

// ---------------------------------------------------------------------------
// StreamingStatusUpdater
// ---------------------------------------------------------------------------

export class StreamingStatusUpdater {
  private readonly channelId: string;
  private readonly threadTs: string;
  private readonly enabled: boolean;
  private readonly sessionId: string | null;

  // Slack message state
  private statusTs: string | null = null;
  private currentText: string = "";
  private pendingText: string | null = null;

  // Throttle state
  private lastUpdateAt: number = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Metrics
  private toolCount: number = 0;
  private startTime: number = Date.now();

  // Track tool_use input accumulation
  private activeToolName: string | null = null;
  private activeToolInput: string = "";
  private activeToolIsSubAgent: boolean = false;
  private activeToolPreview: string = "";

  // Accumulated completed tool log
  private completedTools: CompletedToolEntry[] = [];

  // Track whether finalized
  private finalized: boolean = false;

  constructor(opts: StatusUpdaterOptions) {
    this.channelId = opts.channelId;
    this.threadTs = opts.threadTs;
    this.enabled = opts.enabled !== false;
    this.sessionId = opts.sessionId ?? null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Handle a stream_event from the Claude Code SDK.
   * Call this for every SDKPartialAssistantMessage.event.
   */
  handleStreamEvent(event: StreamEventLike): void {
    if (this.finalized || !this.enabled) return;

    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block?.type === "tool_use" && block.name) {
        // Finalize previous active tool (if any) before starting a new one
        this.finalizeActiveTool();

        this.toolCount++;
        const formatted = formatToolName(block.name);
        this.activeToolName = formatted;
        this.activeToolInput = "";
        this.activeToolIsSubAgent = isSubAgentTool(formatted);
        this.activeToolPreview = "";

        // Show accumulated log + new active tool
        this.rebuildStatus();
      } else if (block?.type === "text") {
        // Agent is generating text (thinking / composing response)
        if (this.toolCount === 0 && this.completedTools.length === 0) {
          this.setStatus(buildStatusText("thinking"));
        }
      }
    }

    if (event.type === "content_block_delta") {
      // Accumulate tool input JSON for preview
      if (this.activeToolName && event.delta?.partial_json) {
        this.activeToolInput += event.delta.partial_json;
        // Try to parse periodically for preview (only on first ~500 chars to avoid waste)
        if (this.activeToolInput.length < 500) {
          this.tryUpdateToolPreview();
        }
      }
    }

    if (event.type === "content_block_stop") {
      // Final attempt to parse tool input for preview
      if (this.activeToolName) {
        this.tryUpdateToolPreview();
      }
    }
  }

  /**
   * Handle a full assistant message from the SDK.
   * Used to detect when the agent is generating text (before tool calls).
   */
  handleAssistantMessage(): void {
    if (this.finalized || !this.enabled) return;
    // If we haven't posted anything yet, show thinking
    if (!this.statusTs && this.toolCount === 0) {
      this.setStatus(buildStatusText("thinking"));
    }
  }

  /**
   * Finalize the status line with a "Done" summary.
   * Call this on result:success.
   */
  async finalize(): Promise<void> {
    if (this.finalized || !this.enabled) return;
    this.finalized = true;
    this.clearFlushTimer();

    // Finalize any active tool
    this.finalizeActiveTool();

    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const footer = buildStatusText("done", { toolCount: this.toolCount, elapsed });

    if (this.completedTools.length > 0) {
      const text = buildAccumulatedStatus(this.completedTools, undefined, footer);
      await this.forceUpdate(text);
    } else {
      await this.forceUpdate(footer);
    }
  }

  /**
   * Finalize with an error state.
   */
  async finalizeError(errorMessage?: string): Promise<void> {
    if (this.finalized || !this.enabled) return;
    this.finalized = true;
    this.clearFlushTimer();

    this.finalizeActiveTool();

    const footer = buildStatusText("error", { errorMessage });

    if (this.completedTools.length > 0) {
      const text = buildAccumulatedStatus(this.completedTools, undefined, footer);
      await this.forceUpdate(text);
    } else {
      await this.forceUpdate(footer);
    }
  }

  /**
   * Finalize with a "stopped by user" state.
   * Called when the user clicks the Stop button.
   */
  async finalizeKilled(): Promise<void> {
    if (this.finalized || !this.enabled) return;
    this.finalized = true;
    this.clearFlushTimer();

    this.finalizeActiveTool();

    const elapsed = Math.round((Date.now() - this.startTime) / 1000);

    if (this.statusTs) {
      // Build final accumulated text for the stopped state
      const accumulatedText = this.completedTools.length > 0
        ? buildAccumulatedStatus(this.completedTools)
        : this.currentText || "";

      const blocks = buildStatusStoppedBlocks(accumulatedText, elapsed);
      const fallbackText = accumulatedText
        ? `${accumulatedText}\n:stop_sign: Stopped by user (${elapsed}s)`
        : `:stop_sign: Stopped by user (${elapsed}s)`;
      try {
        await slack.updateMessage(this.channelId, this.statusTs, fallbackText, blocks);
      } catch (err) {
        console.error("[streaming] Failed to update killed status:", err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Get the current tool count (for external logging / metrics).
   */
  getToolCount(): number {
    return this.toolCount;
  }

  /**
   * Get the list of completed tools (for external inspection / testing).
   */
  getCompletedTools(): ReadonlyArray<CompletedToolEntry> {
    return this.completedTools;
  }

  /**
   * Get the elapsed time in seconds.
   */
  getElapsedSeconds(): number {
    return Math.round((Date.now() - this.startTime) / 1000);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Move the active tool into the completed log.
   */
  private finalizeActiveTool(): void {
    if (this.activeToolName) {
      this.completedTools.push({
        name: this.activeToolName,
        preview: this.activeToolPreview,
        isSubAgent: this.activeToolIsSubAgent,
      });
      this.activeToolName = null;
      this.activeToolInput = "";
      this.activeToolIsSubAgent = false;
      this.activeToolPreview = "";
    }
  }

  /**
   * Rebuild the accumulated status text from current state.
   */
  private rebuildStatus(): void {
    const activeTool = this.activeToolName
      ? { name: this.activeToolName, preview: this.activeToolPreview || undefined, isSubAgent: this.activeToolIsSubAgent }
      : undefined;

    if (this.completedTools.length === 0 && !activeTool) return;

    const text = buildAccumulatedStatus(this.completedTools, activeTool);
    this.setStatus(text);
  }

  private tryUpdateToolPreview(): void {
    if (!this.activeToolName) return;
    try {
      // Attempt lenient parse (may be incomplete JSON — that's fine, we try anyway)
      const parsed = JSON.parse(this.activeToolInput);
      if (typeof parsed === "object" && parsed !== null) {
        const preview = formatToolInputPreview(this.activeToolName, parsed);
        if (preview) {
          this.activeToolPreview = preview;
          this.rebuildStatus();
        }
      }
    } catch {
      // JSON not complete yet — skip
    }
  }

  private setStatus(text: string): void {
    if (text === this.currentText && this.statusTs) return; // no change
    this.pendingText = text;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    // If we haven't posted yet, post immediately
    if (!this.statusTs) {
      void this.flush();
      return;
    }

    // Throttle: if enough time has passed, flush now
    const elapsed = Date.now() - this.lastUpdateAt;
    if (elapsed >= THROTTLE_MS) {
      void this.flush();
      return;
    }

    // Otherwise schedule a delayed flush (if not already scheduled)
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, THROTTLE_MS - elapsed);
    }
  }

  private async flush(): Promise<void> {
    const text = this.pendingText;
    if (!text) return;
    this.pendingText = null;

    try {
      // Only show the Stop button while the agent is actively working.
      // Once finalized (done / error), render a clean status line with no button.
      const blocks = this.sessionId && !this.finalized
        ? buildStatusWithStopBlocks(text, this.sessionId)
        : undefined;

      if (!this.statusTs) {
        // First post
        this.statusTs = await slack.postMessage(this.channelId, text, this.threadTs, blocks);
        this.currentText = text;
        this.lastUpdateAt = Date.now();
      } else if (text !== this.currentText) {
        // Update in-place
        await slack.updateMessage(this.channelId, this.statusTs, text, blocks);
        this.currentText = text;
        this.lastUpdateAt = Date.now();
      }
    } catch (err) {
      // Graceful degradation — don't break the agent if Slack update fails
      console.error("[streaming] Failed to update status:", err instanceof Error ? err.message : err);
    }
  }

  private async forceUpdate(text: string): Promise<void> {
    this.pendingText = text;
    await this.flush();
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
