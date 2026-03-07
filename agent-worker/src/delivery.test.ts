import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPostMessage = vi.fn().mockResolvedValue("msg-ts");
const mockUploadFile = vi.fn().mockResolvedValue(undefined);

vi.mock("./slack.js", () => ({
  postMessage: (...args: unknown[]) => mockPostMessage(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  markdownToSlack: (text: string) => text, // pass-through for testing
}));

vi.mock("./db.js", () => ({
  supabase: {},
  lookupSlackDmChannel: vi.fn().mockResolvedValue("DM-CHAN"),
}));

// Mock file-uploads: use real extractFileUploads, mock uploadExtractedFiles
const mockUploadExtractedFiles = vi.fn().mockResolvedValue(undefined);
vi.mock("./file-uploads.js", async () => {
  // Import real extractFileUploads
  const actual = await vi.importActual<typeof import("./file-uploads.js")>("./file-uploads.js");
  return {
    ...actual,
    uploadExtractedFiles: (...args: unknown[]) => mockUploadExtractedFiles(...args),
  };
});

import { deliverResults } from "./delivery.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deliverResults", () => {
  const opts = { agentKey: "sk_live_test", creatorUserId: "user-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SWITCHBOARD_MCP_URL = "https://switchboard.test/api/mcp/streamable-http";
  });

  it("strips FILE_UPLOAD directives before posting to Slack channel", async () => {
    const text = "Here is your chart!\nFILE_UPLOAD:/tmp/chart.png\nEnjoy!";

    const results = await deliverResults(
      [{ type: "slack_channel", channel_id: "C-TEST" }],
      text,
      opts,
    );

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // The posted message should NOT contain FILE_UPLOAD
    expect(mockPostMessage).toHaveBeenCalledWith("C-TEST", expect.not.stringContaining("FILE_UPLOAD"));
    // It should contain the clean text
    expect(mockPostMessage).toHaveBeenCalledWith("C-TEST", expect.stringContaining("Here is your chart!"));
    expect(mockPostMessage).toHaveBeenCalledWith("C-TEST", expect.stringContaining("Enjoy!"));
  });

  it("calls uploadExtractedFiles when FILE_UPLOAD directives present", async () => {
    const text = "Result\nFILE_UPLOAD:/tmp/report.pdf";

    await deliverResults(
      [{ type: "slack_channel", channel_id: "C-TEST" }],
      text,
      opts,
    );

    expect(mockUploadExtractedFiles).toHaveBeenCalledOnce();
    expect(mockUploadExtractedFiles).toHaveBeenCalledWith(
      [{ path: "/tmp/report.pdf" }],
      "C-TEST",
      undefined,
      "scheduled",
    );
  });

  it("does NOT call uploadExtractedFiles when no directives", async () => {
    await deliverResults(
      [{ type: "slack_channel", channel_id: "C-TEST" }],
      "Just plain text, no files.",
      opts,
    );

    expect(mockUploadExtractedFiles).not.toHaveBeenCalled();
  });

  it("strips FILE_UPLOAD directives for Slack DM delivery", async () => {
    const text = "DM result\nFILE_UPLOAD:/tmp/secret.txt\nDone.";

    const results = await deliverResults(
      [{ type: "slack_dm" }],
      text,
      opts,
    );

    expect(results[0].success).toBe(true);
    expect(mockPostMessage).toHaveBeenCalledWith("DM-CHAN", expect.not.stringContaining("FILE_UPLOAD"));
    expect(mockUploadExtractedFiles).toHaveBeenCalledWith(
      [{ path: "/tmp/secret.txt" }],
      "DM-CHAN",
      undefined,
      "scheduled",
    );
  });

  it("delivers clean text for file targets (no directives in file content)", async () => {
    // For file delivery we can't easily test without mocking fetch,
    // but we verify via the mock that the writeToSwitchboardFile would get cleanText.
    // Since writeToSwitchboardFile uses fetch internally and SWITCHBOARD_MCP_URL is set,
    // we mock fetch to verify the body.
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: () => "" });
    globalThis.fetch = mockFetch;

    try {
      const text = "File content\nFILE_UPLOAD:/tmp/should-strip.txt\nEnd.";

      await deliverResults(
        [{ type: "file", path: "/output/result.md" }],
        text,
        opts,
      );

      // The fetch body should contain clean text without FILE_UPLOAD
      expect(mockFetch).toHaveBeenCalledOnce();
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.params.arguments.content).not.toContain("FILE_UPLOAD");
      expect(fetchBody.params.arguments.content).toContain("File content");
      expect(fetchBody.params.arguments.content).toContain("End.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles multiple targets with FILE_UPLOAD", async () => {
    const text = "Multi\nFILE_UPLOAD:/tmp/multi.txt";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => "" });

    try {
      const results = await deliverResults(
        [
          { type: "slack_channel", channel_id: "C1" },
          { type: "slack_dm" },
        ],
        text,
        opts,
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      // Both Slack targets should get file uploads
      expect(mockUploadExtractedFiles).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("extracts directives only once (not per-target)", async () => {
    const text = "Result\nFILE_UPLOAD:/tmp/a.txt\nFILE_UPLOAD:/tmp/b.txt";

    await deliverResults(
      [
        { type: "slack_channel", channel_id: "C1" },
        { type: "slack_channel", channel_id: "C2" },
      ],
      text,
      opts,
    );

    // Each channel should get the same uploads array
    for (const call of mockUploadExtractedFiles.mock.calls) {
      expect(call[0]).toEqual([
        { path: "/tmp/a.txt" },
        { path: "/tmp/b.txt" },
      ]);
    }
  });

  it("truncates long Slack messages", async () => {
    const longText = "x".repeat(5000);

    await deliverResults(
      [{ type: "slack_channel", channel_id: "C1" }],
      longText,
      opts,
    );

    const postedText = mockPostMessage.mock.calls[0][1] as string;
    expect(postedText.length).toBeLessThanOrEqual(3920); // 3900 + "...(truncated)"
    expect(postedText).toContain("...(truncated)");
  });
});
