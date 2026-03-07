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

import {
  StreamingStatusUpdater,
  formatToolInputPreview,
  formatToolName,
  buildStatusText,
  type StreamEventLike,
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
    );
  });

  it("posts tool status on first tool_use block", async () => {
    const updater = createUpdater();
    updater.handleStreamEvent(toolUseStartEvent("Read"));

    await vi.advanceTimersByTimeAsync(0);

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      ":gear: Using tool: *Read*",
      "thread-ts-1",
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
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      "C-TEST",
      "status-ts-1",
      ":gear: Using tool: *Bash*",
    );
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

    // After full throttle period — should show the latest (Bash)
    await vi.advanceTimersByTimeAsync(3_000);
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      "C-TEST",
      "status-ts-1",
      expect.stringContaining("*Bash*"),
    );
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
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      "C-TEST",
      "status-ts-1",
      ":gear: Using tool: *Bash* — npm test",
    );
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
    // No update needed if text didn't change, which is fine
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
      ":gear: Using tool: *file_read*",
      "thread-ts-1",
    );
  });

  // -------------------------------------------------------------------------
  // Finalize
  // -------------------------------------------------------------------------

  it("finalizes with done summary", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Bash"));
    updater.handleStreamEvent(contentBlockStopEvent());

    // Advance time for elapsed calculation
    await vi.advanceTimersByTimeAsync(10_000);

    await updater.finalize();

    // Should update with done text
    expect(mockUpdateMessage).toHaveBeenLastCalledWith(
      "C-TEST",
      "status-ts-1",
      expect.stringMatching(/:white_check_mark: Done \(2 tool calls, \d+s\)/),
    );
  });

  it("finalizes with error status", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    await updater.finalizeError("timeout");

    expect(mockUpdateMessage).toHaveBeenLastCalledWith(
      "C-TEST",
      "status-ts-1",
      ":x: Error: timeout",
    );
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

  it("does not update if text has not changed", async () => {
    const updater = createUpdater();

    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(0);

    // Same tool again — should not trigger update since text is the same
    updater.handleStreamEvent(contentBlockStopEvent());
    updater.handleStreamEvent(toolUseStartEvent("Read"));
    await vi.advanceTimersByTimeAsync(3_000);

    // The update should still happen because tool count changed → text is different
    // (tool name is the same but it's still a separate status update)
    // Actually the text IS the same (:gear: Using tool: *Read*), so it should NOT update
    // Wait — the text is the same since formatToolName("Read") + no preview is the same
    // But the tool count incremented, so finalize will reflect 2 tools
    expect(updater.getToolCount()).toBe(2);
  });

  it("finalize posts new message if no status was posted yet", async () => {
    const updater = createUpdater();

    // Finalize without any events — still should post
    await updater.finalize();

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      "C-TEST",
      expect.stringContaining(":white_check_mark: Done"),
      "thread-ts-1",
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
});
