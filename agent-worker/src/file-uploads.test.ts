import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { extractFileUploads, uploadExtractedFiles } from "./file-uploads.js";

// ---------------------------------------------------------------------------
// extractFileUploads — pure parsing
// ---------------------------------------------------------------------------

describe("extractFileUploads", () => {
  it("returns text unchanged when no directives present", () => {
    const input = "Here is your answer.\n\nHope that helps!";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(cleanText).toBe(input);
    expect(uploads).toEqual([]);
  });

  it("extracts a single directive and strips it", () => {
    const input = "I wrote the file.\nFILE_UPLOAD:/tmp/chart.png\nEnjoy!";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(cleanText).toBe("I wrote the file.\n\nEnjoy!");
    expect(uploads).toEqual([{ path: "/tmp/chart.png" }]);
  });

  it("extracts multiple directives in order", () => {
    const input = [
      "Here are your files:",
      "FILE_UPLOAD:/tmp/a.txt",
      "FILE_UPLOAD:/tmp/b.pdf",
      "Done!",
    ].join("\n");
    const { cleanText, uploads } = extractFileUploads(input);
    expect(cleanText).toBe("Here are your files:\n\nDone!");
    expect(uploads).toEqual([
      { path: "/tmp/a.txt" },
      { path: "/tmp/b.pdf" },
    ]);
  });

  it("preserves non-directive text", () => {
    const input = [
      "Line 1",
      "Line 2",
      "FILE_UPLOAD:/tmp/file.txt",
      "Line 3",
      "Line 4",
    ].join("\n");
    const { cleanText, uploads } = extractFileUploads(input);
    expect(cleanText).toBe("Line 1\nLine 2\n\nLine 3\nLine 4");
    expect(uploads).toHaveLength(1);
  });

  it("does NOT extract directive mid-sentence", () => {
    const input = "Check out FILE_UPLOAD:/tmp/not-a-directive.txt in the docs";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(cleanText).toBe(input);
    expect(uploads).toEqual([]);
  });

  it("skips empty paths", () => {
    const input = "Hello\nFILE_UPLOAD:\nFILE_UPLOAD:   \nFILE_UPLOAD:/tmp/real.txt\nBye";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(uploads).toEqual([{ path: "/tmp/real.txt" }]);
    expect(cleanText).not.toContain("FILE_UPLOAD");
  });

  it("collapses triple+ blank lines after stripping", () => {
    const input = "Before\n\nFILE_UPLOAD:/tmp/x.txt\n\nAfter";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(cleanText).toBe("Before\n\nAfter");
    expect(uploads).toHaveLength(1);
  });

  it("trims whitespace from paths", () => {
    const input = "FILE_UPLOAD:  /tmp/spaced.txt  ";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(uploads).toEqual([{ path: "/tmp/spaced.txt" }]);
    expect(cleanText).toBe("");
  });

  it("handles directive as only content", () => {
    const input = "FILE_UPLOAD:/tmp/only.txt";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(cleanText).toBe("");
    expect(uploads).toEqual([{ path: "/tmp/only.txt" }]);
  });

  it("handles paths with spaces", () => {
    const input = "FILE_UPLOAD:/tmp/my file name.pdf";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(uploads).toEqual([{ path: "/tmp/my file name.pdf" }]);
    expect(cleanText).toBe("");
  });

  it("handles consecutive directives without text between", () => {
    const input = "FILE_UPLOAD:/tmp/a.txt\nFILE_UPLOAD:/tmp/b.txt\nFILE_UPLOAD:/tmp/c.txt";
    const { cleanText, uploads } = extractFileUploads(input);
    expect(uploads).toHaveLength(3);
    expect(cleanText).toBe("");
  });

  it("preserves code blocks that mention FILE_UPLOAD", () => {
    const input = "Here's how to use it:\n```\n  FILE_UPLOAD:/example\n```\nFILE_UPLOAD:/tmp/real.txt";
    const { cleanText, uploads } = extractFileUploads(input);
    // The line inside a code block is indented, so it won't match ^FILE_UPLOAD
    expect(uploads).toEqual([{ path: "/tmp/real.txt" }]);
    expect(cleanText).toContain("FILE_UPLOAD:/example");
  });
});

// ---------------------------------------------------------------------------
// uploadExtractedFiles — I/O with mocks
// ---------------------------------------------------------------------------

// Mock the slack module
vi.mock("./slack.js", () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

// Import the mocked module for assertions
import * as slack from "./slack.js";

describe("uploadExtractedFiles", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "upload-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("reads file from disk and uploads to Slack", async () => {
    const filePath = path.join(tmpDir, "poem.txt");
    await fs.writeFile(filePath, "Roses are red...");

    await uploadExtractedFiles(
      [{ path: filePath }],
      "C123",
      "1234.5678",
      "sess-1",
    );

    expect(slack.uploadFile).toHaveBeenCalledOnce();
    expect(slack.uploadFile).toHaveBeenCalledWith({
      channelId: "C123",
      threadTs: "1234.5678",
      filename: "poem.txt",
      content: expect.any(Buffer),
      title: "poem.txt",
    });
    // Verify the buffer content
    const call = vi.mocked(slack.uploadFile).mock.calls[0][0];
    expect(Buffer.from(call.content as Buffer).toString()).toBe("Roses are red...");
  });

  it("uploads multiple files in parallel", async () => {
    const file1 = path.join(tmpDir, "a.txt");
    const file2 = path.join(tmpDir, "b.txt");
    await fs.writeFile(file1, "aaa");
    await fs.writeFile(file2, "bbb");

    await uploadExtractedFiles(
      [{ path: file1 }, { path: file2 }],
      "C123",
    );

    expect(slack.uploadFile).toHaveBeenCalledTimes(2);
    const filenames = vi.mocked(slack.uploadFile).mock.calls.map((c) => c[0].filename);
    expect(filenames).toContain("a.txt");
    expect(filenames).toContain("b.txt");
  });

  it("continues if a file is missing (non-fatal)", async () => {
    const existing = path.join(tmpDir, "exists.txt");
    await fs.writeFile(existing, "ok");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uploadExtractedFiles(
      [
        { path: "/nonexistent/missing.txt" },
        { path: existing },
      ],
      "C123",
      undefined,
      "sess-2",
    );

    // The existing file should still be uploaded
    expect(slack.uploadFile).toHaveBeenCalledOnce();
    expect(vi.mocked(slack.uploadFile).mock.calls[0][0].filename).toBe("exists.txt");

    // Error should be logged for missing file
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("FILE_UPLOAD failed for /nonexistent/missing.txt"),
      expect.any(String),
    );

    consoleSpy.mockRestore();
  });

  it("continues if Slack upload fails (non-fatal)", async () => {
    const filePath = path.join(tmpDir, "fail.txt");
    await fs.writeFile(filePath, "data");
    const filePath2 = path.join(tmpDir, "ok.txt");
    await fs.writeFile(filePath2, "data2");

    vi.mocked(slack.uploadFile)
      .mockRejectedValueOnce(new Error("Slack API error"))
      .mockResolvedValueOnce(undefined);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uploadExtractedFiles(
      [{ path: filePath }, { path: filePath2 }],
      "C123",
      undefined,
      "sess-3",
    );

    // Both should be attempted
    expect(slack.uploadFile).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("FILE_UPLOAD failed"),
      expect.stringContaining("Slack API error"),
    );

    consoleSpy.mockRestore();
  });

  it("handles empty uploads array", async () => {
    await uploadExtractedFiles([], "C123");
    expect(slack.uploadFile).not.toHaveBeenCalled();
  });

  it("passes threadTs when provided", async () => {
    const filePath = path.join(tmpDir, "threaded.txt");
    await fs.writeFile(filePath, "hi");

    await uploadExtractedFiles([{ path: filePath }], "C123", "ts-thread");

    expect(vi.mocked(slack.uploadFile).mock.calls[0][0].threadTs).toBe("ts-thread");
  });

  it("passes undefined threadTs when not provided", async () => {
    const filePath = path.join(tmpDir, "nothreaded.txt");
    await fs.writeFile(filePath, "hi");

    await uploadExtractedFiles([{ path: filePath }], "C123");

    expect(vi.mocked(slack.uploadFile).mock.calls[0][0].threadTs).toBeUndefined();
  });

  it("uses basename for nested paths", async () => {
    const subDir = path.join(tmpDir, "sub", "dir");
    await fs.mkdir(subDir, { recursive: true });
    const filePath = path.join(subDir, "deep-file.csv");
    await fs.writeFile(filePath, "a,b,c");

    await uploadExtractedFiles([{ path: filePath }], "C123");

    expect(vi.mocked(slack.uploadFile).mock.calls[0][0].filename).toBe("deep-file.csv");
  });
});
