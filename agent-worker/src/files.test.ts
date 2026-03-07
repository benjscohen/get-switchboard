import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  fetchUserFiles,
  writeFilesToDisk,
  writeFilesToStableDir,
  findSessionFile,
  cleanupTempDir,
  type SwitchboardFile
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

// ---------------------------------------------------------------------------
// writeFilesToStableDir
// ---------------------------------------------------------------------------

describe("writeFilesToStableDir", () => {
  const stableId = `test-stable-${Date.now()}`;
  let stableDir: string | null = null;

  afterEach(async () => {
    if (stableDir) {
      await fs.rm(stableDir, { recursive: true, force: true }).catch(() => {});
      stableDir = null;
    }
  });

  it("creates a deterministic directory based on stableId", async () => {
    const files: SwitchboardFile[] = [
      { path: "/hello.txt", content: "world", isFolder: false },
    ];

    stableDir = await writeFilesToStableDir(files, stableId);

    expect(stableDir).toBe(path.join(os.tmpdir(), `sb-${stableId}`));
    const content = await fs.readFile(path.join(stableDir, "hello.txt"), "utf-8");
    expect(content).toBe("world");
  });

  it("returns the same directory on repeated calls (idempotent)", async () => {
    const files: SwitchboardFile[] = [
      { path: "/a.txt", content: "v1", isFolder: false },
    ];

    stableDir = await writeFilesToStableDir(files, stableId);
    const dir2 = await writeFilesToStableDir(
      [{ path: "/a.txt", content: "v2", isFolder: false }],
      stableId,
    );

    expect(dir2).toBe(stableDir);
    // Content should be overwritten
    const content = await fs.readFile(path.join(stableDir, "a.txt"), "utf-8");
    expect(content).toBe("v2");
  });

  it("skips folders and null-content files", async () => {
    const files: SwitchboardFile[] = [
      { path: "/dir", content: null, isFolder: true },
      { path: "/empty.txt", content: null, isFolder: false },
      { path: "/real.txt", content: "data", isFolder: false },
    ];

    stableDir = await writeFilesToStableDir(files, stableId);

    const realExists = await fs.stat(path.join(stableDir, "real.txt")).then(() => true).catch(() => false);
    const emptyExists = await fs.stat(path.join(stableDir, "empty.txt")).then(() => true).catch(() => false);
    expect(realExists).toBe(true);
    expect(emptyExists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findSessionFile
// ---------------------------------------------------------------------------

describe("findSessionFile", () => {
  let testDir: string | null = null;

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
      testDir = null;
    }
  });

  it("returns null when base dir does not exist", async () => {
    const result = await findSessionFile("any-id", "/tmp/nonexistent-claude-dir-xyz");
    expect(result).toBeNull();
  });

  it("finds a session file in the projects directory", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-projects-"));
    testDir = baseDir;
    const sessionsDir = path.join(baseDir, "test-project", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionId = "test-session-abc123";
    const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
    await fs.writeFile(sessionFile, '{"test": true}', "utf-8");

    const result = await findSessionFile(sessionId, baseDir);
    expect(result).toBe(sessionFile);
  });

  it("returns null when session file does not exist in any project", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-projects-"));
    testDir = baseDir;
    const sessionsDir = path.join(baseDir, "some-project", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const result = await findSessionFile("missing-session-xyz", baseDir);
    expect(result).toBeNull();
  });

  it("searches across multiple projects", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-projects-"));
    testDir = baseDir;

    // Create two projects, session file only in the second
    await fs.mkdir(path.join(baseDir, "proj-a", "sessions"), { recursive: true });
    const sessionsDir = path.join(baseDir, "proj-b", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionId = "multi-project-session";
    const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
    await fs.writeFile(sessionFile, "{}", "utf-8");

    const result = await findSessionFile(sessionId, baseDir);
    expect(result).toBe(sessionFile);
  });
});
