import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  fetchUserFiles,
  writeFilesToDisk,
  cleanupTempDir,
  type SwitchboardFile,
} from "./files.js";

// ---------------------------------------------------------------------------
// fetchUserFiles
// ---------------------------------------------------------------------------

describe("fetchUserFiles", () => {
  const originalEnv = process.env.SWITCHBOARD_MCP_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SWITCHBOARD_MCP_URL = originalEnv;
    } else {
      delete process.env.SWITCHBOARD_MCP_URL;
    }
  });

  it("returns null when SWITCHBOARD_MCP_URL is not set", async () => {
    delete process.env.SWITCHBOARD_MCP_URL;
    const result = await fetchUserFiles("test-key");
    expect(result).toBeNull();
  });

  it("returns files on successful API response", async () => {
    process.env.SWITCHBOARD_MCP_URL = "https://example.com/api/mcp/http";

    const mockFiles = [
      { id: "1", path: "/CLAUDE.md", name: "CLAUDE.md", isFolder: false, content: "hello", mimeType: "text/plain" },
      { id: "2", path: "/memories", name: "memories", isFolder: true, content: null, mimeType: "text/plain" },
    ];

    const mockResponse = {
      ok: true,
      json: async () => ({
        markdown: "# Files",
        files: mockFiles,
        updatedAt: "2026-01-01T00:00:00Z",
      }),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const result = await fetchUserFiles("test-key");
    expect(result).toEqual([
      { path: "/CLAUDE.md", content: "hello", isFolder: false },
      { path: "/memories", content: null, isFolder: true },
    ]);

    expect(fetch).toHaveBeenCalledWith("https://example.com/api/fs", {
      headers: { Authorization: "Bearer test-key" },
    });
  });

  it("returns null on non-ok response", async () => {
    process.env.SWITCHBOARD_MCP_URL = "https://example.com/api/mcp/http";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const result = await fetchUserFiles("bad-key");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    process.env.SWITCHBOARD_MCP_URL = "https://example.com/api/mcp/http";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network fail")),
    );

    const result = await fetchUserFiles("test-key");
    expect(result).toBeNull();
  });

  it("derives origin correctly from MCP URL with path", async () => {
    process.env.SWITCHBOARD_MCP_URL = "https://app.example.com/api/mcp/http";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ markdown: "", files: [], updatedAt: "" }),
      }),
    );

    await fetchUserFiles("key");
    expect(fetch).toHaveBeenCalledWith(
      "https://app.example.com/api/fs",
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// writeFilesToDisk
// ---------------------------------------------------------------------------

describe("writeFilesToDisk", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = null;
    }
  });

  it("creates a temp directory and writes files", async () => {
    const files: SwitchboardFile[] = [
      { path: "/notes.txt", content: "hello world", isFolder: false },
      { path: "/memories/MEMORY.md", content: "# Memory", isFolder: false },
    ];

    tempDir = await writeFilesToDisk(files);

    expect(tempDir).toBeTruthy();
    expect(tempDir).toContain("sb-");

    const notes = await fs.readFile(path.join(tempDir, "notes.txt"), "utf-8");
    expect(notes).toBe("hello world");

    const memory = await fs.readFile(
      path.join(tempDir, "memories", "MEMORY.md"),
      "utf-8",
    );
    expect(memory).toBe("# Memory");
  });

  it("skips folders", async () => {
    const files: SwitchboardFile[] = [
      { path: "/myfolder", content: null, isFolder: true },
      { path: "/myfolder/file.txt", content: "content", isFolder: false },
    ];

    tempDir = await writeFilesToDisk(files);

    const content = await fs.readFile(
      path.join(tempDir, "myfolder", "file.txt"),
      "utf-8",
    );
    expect(content).toBe("content");
  });

  it("skips files with null content", async () => {
    const files: SwitchboardFile[] = [
      { path: "/empty.txt", content: null, isFolder: false },
    ];

    tempDir = await writeFilesToDisk(files);

    const exists = await fs
      .stat(path.join(tempDir, "empty.txt"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("handles empty file list", async () => {
    tempDir = await writeFilesToDisk([]);

    expect(tempDir).toBeTruthy();
    const entries = await fs.readdir(tempDir);
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// cleanupTempDir
// ---------------------------------------------------------------------------

describe("cleanupTempDir", () => {
  it("removes directory and contents", async () => {
    const tempDir = await writeFilesToDisk([
      { path: "/test.txt", content: "data", isFolder: false },
    ]);

    await cleanupTempDir(tempDir);

    const exists = await fs
      .stat(tempDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("does not throw on non-existent directory", async () => {
    await expect(cleanupTempDir("/tmp/nonexistent-sb-test-dir")).resolves.not.toThrow();
  });
});
