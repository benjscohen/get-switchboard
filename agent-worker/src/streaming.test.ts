import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPostMessage = vi.fn().mockResolvedValue("status-ts-1");
const mockUpdateMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("./slack.js", () => ({
  postMessage: (...args: unknown[]) => mockPostMessage(...args),
  updateMessage: (...args: unknown[]) => mockUpdateMessage(...args),
}));

vi.mock("./slack-blocks.js", () => ({
  buildStatusWithStopBlocks: (text: string, sessionId: string) => [{ type: "section", text: { type: "mrkdwn", text }, accessory: { action_id: "kill_session", value: sessionId } }],
  buildStatusStoppedBlocks: (text: string, elapsed: number) => [{ type: "section", text: { type: "mrkdwn", text } }, { type: "context", elements: [{ type: "mrkdwn", text: `:stop_sign: Stopped by user (${elapsed}s)` }] }],
}));

import {
  StreamingStatusUpdater,
  formatToolInputPreview,
  formatToolName,
  buildStatusText,
  isSubAgentTool,
  formatCompletedToolLine,
  formatActiveToolLine,
  buildAccumulatedStatus,
  type StreamEventLike,
  type CompletedToolEntry,
} from "./streaming.js";

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe("formatToolName", () => {
  it("strips mcp__ prefix with server name", () => {
    expect(formatToolName("mcp__switchboard__file_read")).toBe("file_read");
  });

  it("handles double-underscored tool names after prefix", () => {
    expect(formatToolName("mcp__server__nested__tool")).toBe("nested__tool");
  });

  it("passes through plain tool names", () => {
    expect(formatToolName("Read")).toBe("Read");
    expect(formatToolName("Bash")).toBe("Bash");
    expect(formatToolName("grep")).toBe("grep");
  });

  it("handles mcp__ prefix with only two parts", () => {
    expect(formatToolName("mcp__toolname")).toBe("toolname");
  });
});

describe("formatToolInputPreview", () => {
  it("shows file path for Read tool", () => {
    expect(formatToolInputPreview("Read", { file_path: "/src/index.ts" })).toBe("/src/index.ts");
  });

  it("shows file path for Edit tool", () => {
    expect(formatToolInputPreview("Edit", { file_path: "/src/app.ts", old_string: "foo", new_string: "bar" }))
      .toBe("/src/app.ts");
  });

  it("shows file path for Write tool", () => {
    expect(formatToolInputPreview("Write", { file_path: "/tmp/output.txt", content: "hello" }))
      .toBe("/tmp/output.txt");
  });

  it("shows pattern and path for Grep tool", () => {
    expect(formatToolInputPreview("Grep", { pattern: "handleAuth", path: "src/" }))
      .toBe("\"handleAuth\" in src/");
  });

  it("shows pattern for Grep tool without path", () => {
    expect(formatToolInputPreview("Grep", { pattern: "TODO" })).toBe("\"TODO\"");
  });

  it("shows pattern and path for Glob tool", () => {
    expect(formatToolInputPreview("Glob", { pattern: "**/*.ts", path: "src/" }))
      .toBe("**/*.ts in src/");
  });

  it("shows command for Bash tool", () => {
    expect(formatToolInputPreview("Bash", { command: "npm test" })).toBe("npm test");
  });

  it("shows description for Task tool", () => {
    expect(formatToolInputPreview("Task", { description: "Research auth flow" }))
      .toBe("Research auth flow");
  });

  it("shows query for WebSearch tool", () => {
    expect(formatToolInputPreview("WebSearch", { query: "Slack API rate limits" }))
      .toBe("\"Slack API rate limits\"");
  });

  it("shows url for WebFetch tool", () => {
    expect(formatToolInputPreview("WebFetch", { url: "https://docs.slack.dev" }))
      .toBe("https://docs.slack.dev");
  });

  it("shows notebook path for NotebookEdit tool", () => {
    expect(formatToolInputPreview("NotebookEdit", { notebook_path: "/analysis.ipynb" }))
      .toBe("/analysis.ipynb");
  });

  it("falls back to first string value for unknown tools", () => {
    expect(formatToolInputPreview("custom_tool", { arg1: "hello world" })).toBe("hello world");
  });

  it("returns empty for tools with no string inputs", () => {
    expect(formatToolInputPreview("custom_tool", { count: 42, flag: true })).toBe("");
  });

  it("truncates long previews", () => {
    const longCommand = "a".repeat(200);
    const preview = formatToolInputPreview("Bash", { command: longCommand });
    expect(preview.length).toBeLessThanOrEqual(80);
    expect(preview).toMatch(/…$/);
  });

  it("handles case-insensitive tool names", () => {
    expect(formatToolInputPreview("read", { file_path: "/foo.ts" })).toBe("/foo.ts");
    expect(formatToolInputPreview("BASH", { command: "ls" })).toBe("ls");
  });
});

describe("buildStatusText", () => {
  it("builds thinking status", () => {
    expect(buildStatusText("thinking")).toBe(":hourglass_flowing_sand: Thinking…");
  });

  it("builds tool status without preview", () => {
    expect(buildStatusText("tool", { toolName: "Read" }))
      .toBe(":gear: Using tool: *Read*");
  });

  it("builds tool status with preview", () => {
    expect(buildStatusText("tool", { toolName: "Bash", toolPreview: "npm test" }))
      .toBe(":gear: Using tool: *Bash* — npm test");
  });

  it("builds done status with singular tool call", () => {
    expect(buildStatusText("done", { toolCount: 1, elapsed: 10 }))
      .toBe(":white_check_mark: Done (1 tool call, 10s)");
  });

  it("builds done status with plural tool calls", () => {
    expect(buildStatusText("done", { toolCount: 5, elapsed: 32 }))
      .toBe(":white_check_mark: Done (5 tool calls, 32s)");
  });

  it("builds done status with zero tool calls", () => {
    expect(buildStatusText("done", { toolCount: 0, elapsed: 3 }))
      .toBe(":white_check_mark: Done (0 tool calls, 3s)");
  });

  it("builds error status without message", () => {
    expect(buildStatusText("error")).toBe(":x: Error");
  });

  it("builds error status with message", () => {
    expect(buildStatusText("error", { errorMessage: "timeout" }))
      .toBe(":x: Error: timeout");
  });
});

// ---------------------------------------------------------------------------
// New accumulated status helper tests
// ---------------------------------------------------------------------------

describe("isSubAgentTool", () => {
  it("detects Task tool as sub-agent", () => {
    expect(isSubAgentTool("Task")).toBe(true);
  });

  it("detects lowercase task as sub-agent", () => {
    expect(isSubAgentTool("task")).toBe(true);
  });

  it("does not flag normal tools as sub-agent", () => {
    expect(isSubAgentTool("Read")).toBe(false);
    expect(isSubAgentTool("Bash")).toBe(false);
    expect(isSubAgentTool("Grep")).toBe(false);
  });
});

describe("formatCompletedToolLine", () => {
  it("formats a regular completed tool with preview", () => {
    const entry: CompletedToolEntry = { name: "Read", preview: "/src/index.ts", isSubAgent: false };
    expect(formatCompletedToolLine(entry)).toBe(":white_check_mark: *Read* — /src/index.ts");
  });

  it("formats a regular completed tool without preview", () => {
    const entry: CompletedToolEntry = { name: "Bash", preview: "", isSubAgent: false };
    expect(formatCompletedToolLine(entry)).toBe(":white_check_mark: *Bash*");
  });

  it("formats a sub-agent tool with robot icon", () => {
    const entry: CompletedToolEntry = { name: "Task", preview: "Research auth flow", isSubAgent: true };
    expect(formatCompletedToolLine(entry)).toBe(":robot_face: *Task* (sub-agent) — Research auth flow");
  });

  it("formats a sub-agent tool without preview", () => {
    const entry: CompletedToolEntry = { name: "Task", preview: "", isSubAgent: true };
    expect(formatCompletedToolLine(entry)).toBe(":robot_face: *Task* (sub-agent)");
  });
});

describe("formatActiveToolLine", () => {
  it("formats active tool with gear icon", () => {
    expect(formatActiveToolLine("Bash", "npm test")).toBe(":gear: *Bash* — npm test");
  });

  it("formats active tool without preview", () => {
    expect(formatActiveToolLine("Read")).toBe(":gear: *Read*");
  });

  it("formats active sub-agent with robot icon", () => {
    expect(formatActiveToolLine("Task", "Research flow", true)).toBe(":robot_face: *Task* (sub-agent) — Research flow");
  });
});

describe("buildAccumulatedStatus", () => {
  it("shows only active tool when no completed tools", () => {
    const text = buildAccumulatedStatus([], { name: "Read", preview: "/src/index.ts" });
    expect(text).toBe(":gear: *Read* — /src/index.ts");
  });

  it("shows completed + active tool", () => {
    const completed: CompletedToolEntry[] = [
      { name: "Read", preview: "/src/index.ts", isSubAgent: false },
    ];
    const text = buildAccumulatedStatus(completed, { name: "Bash", preview: "npm test" });
    expect(text).toBe(
      ":white_check_mark: *Read* — /src/index.ts\n:gear: *Bash* — npm test"
    );
  });

  it("shows completed tools with footer", () => {
    const completed: CompletedToolEntry[] = [
      { name: "Read", preview: "/src/index.ts", isSubAgent: false },
      { name: "Bash", preview: "npm test", isSubAgent: false },
    ];
    const text = buildAccumulatedStatus(completed, undefined, ":white_check_mark: Done (2 tool calls, 5s)");
    expect(text).toBe(
      ":white_check_mark: *Read* — /src/index.ts\n" +
      ":white_check_mark: *Bash* — npm test\n" +
      ":white_check_mark: Done (2 tool calls, 5s)"
    );
  });

  it("shows sub-agent tools distinctly", () => {
    const completed: CompletedToolEntry[] = [
      { name: "Read", preview: "/src/index.ts", isSubAgent: false },
      { name: "Task", preview: "Research auth", isSubAgent: true },
    ];
    const text = buildAccumulatedStatus(completed);
    expect(text).toContain(":robot_face: *Task* (sub-agent) — Research auth");
    expect(text).toContain(":white_check_mark: *Read*");
  });

  it("collapses older entries when exceeding MAX_VISIBLE_TOOLS", () => {
    const completed: CompletedToolEntry[] = [];
    for (let i = 0; i < 55; i++) {
      completed.push({ name: `Tool${i}`, preview: "", isSubAgent: false });
    }
    const text = buildAccumulatedStatus(completed);
    expect(text).toContain("_… 5 earlier tool calls_");
    // Should show the last 50 tools
    expect(text).toContain("*Tool54*");
    expect(text).toContain("*Tool5*");
    // First 5 should be hidden
    expect(text).not.toContain("*Tool4*");
  });
});

// ---------------------------------------------------------------------------
// StreamingStatusUpdater tests
// ---------------------------------------------------------------------------

describe("StreamingStatusUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createUpdater() {
    return new StreamingStatusUpdater({
      channelId: "C-TEST",
      threadTs: "thread-ts-1",
    });
  }

  function toolUseStartEvent(name: string): StreamEventLike {
    return {
      type: "content_block_start",
      content_block: { type: "tool_use", name, id: "tu-1" },
      index: 0,
    };
  }

  function textBlockStartEvent(): StreamEventLike {
    return {
      type: "content_block_start",
      content_block: { type: "text" },
      index: 0,
    };
  }

  function contentBlockStopEvent(): StreamEventLike {
    return { type: "content_block_stop", index: 0 };
  }

  function toolInputDeltaEvent(json: string): StreamEventLike {
    return {
      type: "content_block_delta",
      delta: { type: "input_json_delta", partial_json: json },
      index: 0,
    };
  }

  // -------------------------------------------------------------------------
  // First post behavior
  // -------------------------------------------------------------------------

  it("posts thinking status on first text block", async () => {
    const updater = createUpdater();
    updater.handleStreamEvent(textBlockStartEvent());

    // Flush microtasks
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      ":hourglass_flowing_sand: Thinking…",
      "thread-ts-1",
      undefined,
    );
  });

  it("posts active tool status on first tool_use block", async () => {
    const updater = createUpdater();
    updater.handleStreamEvent(toolUseStartEvent("Read"));

    await vi.advanceTimersByTimeAsync(0);

    expect(mockPostMessage).toHaveBeenCalledOnce();
    // First tool — no completed tools yet, just the active tool line
    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      ":gear: *Read*",
      "thread-ts-1",
      undefined,
    );
  });

  it("increments tool count for each tool_use start", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    updater.handleStreamEvent(contentBlockStopEvent());

    // Advance past throttle for second tool
    await vi.advanceTimersByTimeAsync(3_000);

    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(3_000);

    expect(updater.getToolCount()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Accumulated behavior
  // -------------------------------------------------------------------------

  it("accumulates completed tools into the status message", async () => {
    const updater = createUpdater();

    // First tool: Read
    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // Complete Read with input
    updater.handleStreamEvent(toolInputDeltaEvent('{"file_path":"/src/index.ts"}'));
    updater.handleStreamEvent(contentBlockStopEvent());

    // Wait for throttle
    await vi.advanceTimersByTimeAsync(3_000);

    // Second tool: Bash
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(3_000);

    // The update should show Read as completed + Bash as active
    const lastCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    expect(lastCall[2]).toContain(":white_check_mark: *Read*");
    expect(lastCall[2]).toContain(":gear: *Bash*");
  });

  it("tracks completed tools in getCompletedTools()", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    updater.handleStreamEvent(toolInputDeltaEvent('{"file_path":"/src/index.ts"}'));
    updater.handleStreamEvent(contentBlockStopEvent());
    await vi.advanceTimersByTimeAsync(3_000);

    // Start and complete a second tool to push Read into completed
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(0);

    // Read should now be in completed tools (finalized when Bash started)
    const completed = updater.getCompletedTools();
    expect(completed).toHaveLength(1);
    expect(completed[0].name).toBe("Read");
    expect(completed[0].preview).toBe("/src/index.ts");
  });

  it("detects sub-agent (Task) tools and marks them accordingly", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Task"));
    await vi.advanceTimersByTimeAsync(0);

    // Should show robot icon for sub-agent
    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      ":robot_face: *Task* (sub-agent)",
      "thread-ts-1",
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Throttling
  // -------------------------------------------------------------------------

  it("throttles updates to avoid Slack rate limits", async () => {
    const updater = createUpdater();

    // First event → immediate post
    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mockPostMessage).toHaveBeenCalledOnce();

    // Rapid-fire second tool — should NOT update immediately
    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mockUpdateMessage).not.toHaveBeenCalled();

    // After throttle period — should flush
    await vi.advanceTimersByTimeAsync(3_000);
    expect(mockUpdateMessage).toHaveBeenCalledOnce();
    // Should show accumulated: Read completed + Bash active
    const updateText = mockUpdateMessage.mock.calls[0][2];
    expect(updateText).toContain(":white_check_mark: *Read*");
    expect(updateText).toContain(":gear: *Bash*");
  });

  it("does not skip the last pending update", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // Quick succession of events
    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Edit"));
    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Bash"));

    // After full throttle period — should show the latest accumulated state
    await vi.advanceTimersByTimeAsync(3_000);
    const lastUpdateText = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1][2];
    // Should contain both Read and Edit as completed, Bash as active
    expect(lastUpdateText).toContain("*Read*");
    expect(lastUpdateText).toContain("*Edit*");
    expect(lastUpdateText).toContain("*Bash*");
  });

  // -------------------------------------------------------------------------
  // Tool input preview
  // -------------------------------------------------------------------------

  it("updates with tool input preview when JSON is complete", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(0);

    // Simulate streaming tool input JSON
    updater.handleStreamEvent(toolInputDeltaEvent('{"command":'));
    updater.handleStreamEvent(toolInputDeltaEvent('"npm test"}'));

    // content_block_stop triggers final parse
    updater.handleStreamEvent(contentBlockStopEvent());

    await vi.advanceTimersByTimeAsync(3_000);
    // The update should include the Bash preview
    const lastCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    // At this point Bash might be in completed (if another tool started) or still active
    // Since no new tool started, Bash is still active — but content_block_stop doesn't finalize the active tool
    // Actually, looking at the code: content_block_stop only triggers tryUpdateToolPreview, not finalizeActiveTool
    // The active tool stays active until a new tool starts or finalize is called
    expect(lastCall[2]).toContain("npm test");
  });

  it("handles incomplete JSON gracefully", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // Incomplete JSON — should not crash
    updater.handleStreamEvent(toolInputDeltaEvent('{"file_pa'));
    updater.handleStreamEvent(contentBlockStopEvent());

    // Should still show tool name without preview
    await vi.advanceTimersByTimeAsync(3_000);
    expect(updater.getToolCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // MCP tool name formatting
  // -------------------------------------------------------------------------

  it("strips MCP prefix from tool names in status", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("mcp__switchboard__file_read"));
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      ":gear: *file_read*",
      "thread-ts-1",
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Finalize — accumulated
  // -------------------------------------------------------------------------

  it("finalizes with accumulated log + done footer", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    updater.handleStreamEvent(contentBlockStopEvent());

    // Advance time for elapsed calculation
    await vi.advanceTimersByTimeAsync(10_000);

    await updater.finalize();

    // Should update with accumulated log + done footer
    const lastCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    const text = lastCall[2];
    expect(text).toContain(":white_check_mark: *Read*");
    expect(text).toContain(":white_check_mark: *Bash*");
    expect(text).toMatch(/:white_check_mark: Done \(2 tool calls, \d+s\)/);
  });

  it("finalizes with error and accumulated log", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    await updater.finalizeError("timeout");

    const lastCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    const text = lastCall[2];
    // Should show Read as completed (finalized by finalizeError) + error footer
    expect(text).toContain(":white_check_mark: *Read*");
    expect(text).toContain(":x: Error: timeout");
  });

  it("finalize is idempotent — second call does nothing", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    await updater.finalize();
    const callCount = mockUpdateMessage.mock.calls.length;

    await updater.finalize();
    expect(mockUpdateMessage.mock.calls.length).toBe(callCount);
  });

  it("ignores events after finalization", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    await updater.finalize();
    const callCount = mockUpdateMessage.mock.calls.length;

    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(3_000);

    // No additional updates
    expect(mockUpdateMessage.mock.calls.length).toBe(callCount);
    // Tool count should still be 1 (Bash was ignored)
    expect(updater.getToolCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Graceful degradation
  // -------------------------------------------------------------------------

  it("handles postMessage failure gracefully", async () => {
    mockPostMessage.mockRejectedValueOnce(new Error("Slack error"));
    const updater = createUpdater();

    // Should not throw
    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    expect(updater.getToolCount()).toBe(1);
  });

  it("handles updateMessage failure gracefully", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    mockUpdateMessage.mockRejectedValueOnce(new Error("rate_limited"));
    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(3_000);

    // Should not throw, tool count still increments
    expect(updater.getToolCount()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // handleAssistantMessage
  // -------------------------------------------------------------------------

  it("posts thinking on handleAssistantMessage if no status yet", async () => {
    const updater = createUpdater();

    updater.handleAssistantMessage();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      ":hourglass_flowing_sand: Thinking…",
      "thread-ts-1",
      undefined,
    );
  });

  it("does not post thinking if status already posted", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);
    mockPostMessage.mockClear();

    updater.handleAssistantMessage();
    await vi.advanceTimersByTimeAsync(0);

    // Should not post another message
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("finalize posts new message if no status was posted yet", async () => {
    const updater = createUpdater();

    // Finalize without any events — still should post
    await updater.finalize();

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      expect.stringContaining(":white_check_mark: Done"),
      "thread-ts-1",
      undefined,
    );
  });

  it("finalizeError posts new message if no status was posted yet", async () => {
    const updater = createUpdater();

    await updater.finalizeError("something broke");

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      ":x: Error: something broke",
      "thread-ts-1",
      undefined,
    );
  });

  it("clears pending flush timer on finalize", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // Start a throttled update
    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    // Timer is now pending — finalize should cancel it

    await updater.finalize();

    // Advance past where the timer would have fired
    await vi.advanceTimersByTimeAsync(5_000);

    // Only the finalize update should have happened, not the pending tool update
    const lastCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    expect(lastCall[2]).toMatch(/:white_check_mark: Done/);
  });

  it("getElapsedSeconds returns reasonable value", async () => {
    const updater = createUpdater();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(updater.getElapsedSeconds()).toBe(5);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(updater.getElapsedSeconds()).toBe(15);
  });

  // -------------------------------------------------------------------------
  // Stop button integration with accumulated status
  // -------------------------------------------------------------------------

  it("includes Stop button blocks when sessionId is provided", async () => {
    const updater = new StreamingStatusUpdater({
      channelId: "C-TEST",
      threadTs: "thread-ts-1",
      sessionId: "sess-123",
    });

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // Should pass blocks to postMessage
    const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1];
    expect(lastCall[3]).toBeDefined();
    expect(lastCall[3][0].accessory.action_id).toBe("kill_session");
    expect(lastCall[3][0].accessory.value).toBe("sess-123");
  });

  it("removes Stop button blocks on finalize (done state)", async () => {
    const updater = new StreamingStatusUpdater({
      channelId: "C-TEST",
      threadTs: "thread-ts-1",
      sessionId: "sess-123",
    });

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // During streaming — should have blocks (Stop button)
    const streamingCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1];
    expect(streamingCall[3]).toBeDefined();

    await vi.advanceTimersByTimeAsync(5_000);
    await updater.finalize();

    // After finalize — blocks should be undefined (no Stop button)
    const finalCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    expect(finalCall[2]).toMatch(/:white_check_mark: Done/);
    expect(finalCall[3]).toBeUndefined();
  });

  it("removes Stop button blocks on finalizeError", async () => {
    const updater = new StreamingStatusUpdater({
      channelId: "C-TEST",
      threadTs: "thread-ts-1",
      sessionId: "sess-123",
    });

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // During streaming — should have blocks
    const streamingCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1];
    expect(streamingCall[3]).toBeDefined();

    await updater.finalizeError("timeout");

    // After finalizeError — blocks should be undefined (no Stop button)
    const finalCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    expect(finalCall[2]).toContain(":x: Error: timeout");
    expect(finalCall[3]).toBeUndefined();
  });

  it("finalizeKilled shows accumulated log with stopped state", async () => {
    const updater = new StreamingStatusUpdater({
      channelId: "C-TEST",
      threadTs: "thread-ts-1",
      sessionId: "sess-123",
    });

    // Start and complete a tool
    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);
    updater.handleStreamEvent(toolInputDeltaEvent('{"file_path":"/src/index.ts"}'));
    updater.handleStreamEvent(contentBlockStopEvent());
    await vi.advanceTimersByTimeAsync(3_000);

    // Start another tool
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    await vi.advanceTimersByTimeAsync(0);

    // User kills the session
    await updater.finalizeKilled();

    // Should show accumulated log in the stopped state
    const lastCall = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1];
    const fallbackText = lastCall[2];
    expect(fallbackText).toContain(":white_check_mark: *Read*");
    expect(fallbackText).toContain(":white_check_mark: *Bash*");
    expect(fallbackText).toContain(":stop_sign: Stopped by user");
  });
});
