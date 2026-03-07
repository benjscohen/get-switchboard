import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// We test archiveWorkspace and restoreWorkspace as an integration pair
// by using real tar operations on real temp directories.
// The supabase storage calls are mocked.
// ---------------------------------------------------------------------------

// Mock supabase (imported via db.js)
const mockUpload = vi.fn();
const mockDownload = vi.fn();
const mockRemove = vi.fn();
const mockFrom = vi.fn().mockReturnValue({
  upload: mockUpload,
  download: mockDownload,
  remove: mockRemove,
});

const mockSelect = vi.fn();
const mockNot = vi.fn();
const mockLt = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockIn = vi.fn();

vi.mock("./db.js", () => ({
  supabase: {
    storage: {
      from: (...args: unknown[]) => mockFrom(...args),
    },
    from: () => ({
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return {
          not: (...nArgs: unknown[]) => {
            mockNot(...nArgs);
            return {
              lt: (...ltArgs: unknown[]) => {
                mockLt(...ltArgs);
                return {
                  limit: (...limArgs: unknown[]) => {
                    mockLimit(...limArgs);
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
        };
      },
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return {
          in: (...inArgs: unknown[]) => {
            mockIn(...inArgs);
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
  },
}));

import { vi } from "vitest";
import {
  archiveWorkspace,
  restoreWorkspace,
  deleteWorkspaceArchive,
  cleanupOldArchives,
} from "./workspace-storage.js";

describe("archiveWorkspace", () => {
  let workDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-archive-test-"));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  it("creates a tar.gz and uploads to storage", async () => {
    // Create some test files
    await fs.writeFile(path.join(workDir, "hello.txt"), "Hello world");
    await fs.mkdir(path.join(workDir, "src"), { recursive: true });
    await fs.writeFile(path.join(workDir, "src", "index.ts"), "console.log('hi')");

    mockUpload.mockResolvedValue({ error: null });

    const result = await archiveWorkspace({
      workDir,
      userId: "user-123",
      claudeSessionId: "session-abc",
    });

    expect(result).toBe("user-123/session-abc/workspace.tar.gz");
    expect(mockFrom).toHaveBeenCalledWith("session-workspaces");
    expect(mockUpload).toHaveBeenCalledWith(
      "user-123/session-abc/workspace.tar.gz",
      expect.any(Buffer),
      { contentType: "application/gzip", upsert: true },
    );

    // Verify the uploaded buffer is a valid gzip (starts with magic bytes 1f 8b)
    const uploadedBuffer = mockUpload.mock.calls[0][1] as Buffer;
    expect(uploadedBuffer[0]).toBe(0x1f);
    expect(uploadedBuffer[1]).toBe(0x8b);
  });

  it("excludes node_modules, .git, and other excluded dirs", async () => {
    await fs.writeFile(path.join(workDir, "keep.txt"), "keep");
    await fs.mkdir(path.join(workDir, "node_modules", "foo"), { recursive: true });
    await fs.writeFile(path.join(workDir, "node_modules", "foo", "index.js"), "x");
    await fs.mkdir(path.join(workDir, ".git", "objects"), { recursive: true });
    await fs.writeFile(path.join(workDir, ".git", "HEAD"), "ref: refs/heads/main");

    mockUpload.mockResolvedValue({ error: null });

    const result = await archiveWorkspace({
      workDir,
      userId: "u1",
      claudeSessionId: "s1",
    });

    expect(result).not.toBeNull();

    // Extract the uploaded archive and verify exclusions
    const uploadedBuffer = mockUpload.mock.calls[0][1] as Buffer;
    const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-extract-"));
    const tmpTar = path.join(extractDir, "test.tar.gz");
    await fs.writeFile(tmpTar, uploadedBuffer);
    await execFileAsync("tar", ["-xzf", tmpTar, "-C", extractDir]);

    // keep.txt should be there
    const keepContent = await fs.readFile(path.join(extractDir, "keep.txt"), "utf-8");
    expect(keepContent).toBe("keep");

    // node_modules and .git should NOT be there
    await expect(fs.access(path.join(extractDir, "node_modules"))).rejects.toThrow();
    await expect(fs.access(path.join(extractDir, ".git"))).rejects.toThrow();

    await fs.rm(extractDir, { recursive: true, force: true });
  });

  it("returns null on upload error", async () => {
    await fs.writeFile(path.join(workDir, "test.txt"), "data");
    mockUpload.mockResolvedValue({ error: { message: "Storage full" } });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await archiveWorkspace({
      workDir,
      userId: "u1",
      claudeSessionId: "s1",
    });
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith("[workspace] Upload failed:", "Storage full");
    consoleSpy.mockRestore();
  });

  it("returns null when workDir does not exist", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await archiveWorkspace({
      workDir: "/nonexistent/path/xyz",
      userId: "u1",
      claudeSessionId: "s1",
    });
    // tar will fail on nonexistent dir — function should handle it gracefully
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith("[workspace] Archive failed:", expect.any(String));
    consoleSpy.mockRestore();
  });

  it("cleans up temp tar file even on failure", async () => {
    await fs.writeFile(path.join(workDir, "test.txt"), "data");
    mockUpload.mockRejectedValue(new Error("network error"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await archiveWorkspace({
      workDir,
      userId: "u1",
      claudeSessionId: "cleanup-test",
    }).catch(() => {});

    // Temp tar file should not exist after the call
    const tmpTar = path.join(os.tmpdir(), "workspace-cleanup-test.tar.gz");
    await expect(fs.access(tmpTar)).rejects.toThrow();
    consoleSpy.mockRestore();
  });
});

describe("restoreWorkspace", () => {
  let targetDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-restore-target-"));
    sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-restore-source-"));
  });

  afterEach(async () => {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
  });

  it("downloads and extracts archive to target directory", async () => {
    // Create a real tar.gz to serve as the "download"
    await fs.writeFile(path.join(sourceDir, "restored.txt"), "I was restored!");
    await fs.mkdir(path.join(sourceDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "sub", "nested.txt"), "nested!");

    const tmpTar = path.join(os.tmpdir(), `restore-src-${Date.now()}.tar.gz`);
    await execFileAsync("tar", ["-czf", tmpTar, "-C", sourceDir, "."]);
    const tarBuffer = await fs.readFile(tmpTar);
    await fs.rm(tmpTar, { force: true });

    // Mock the download to return our tar
    const blob = new Blob([new Uint8Array(tarBuffer)], { type: "application/gzip" });
    mockDownload.mockResolvedValue({ data: blob, error: null });

    const result = await restoreWorkspace({
      archivePath: "user-1/session-1/workspace.tar.gz",
      targetDir,
    });

    expect(result).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("session-workspaces");
    expect(mockDownload).toHaveBeenCalledWith("user-1/session-1/workspace.tar.gz");

    // Verify files were extracted
    const content = await fs.readFile(path.join(targetDir, "restored.txt"), "utf-8");
    expect(content).toBe("I was restored!");
    const nestedContent = await fs.readFile(path.join(targetDir, "sub", "nested.txt"), "utf-8");
    expect(nestedContent).toBe("nested!");
  });

  it("returns false on download error", async () => {
    mockDownload.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await restoreWorkspace({
      archivePath: "missing/path.tar.gz",
      targetDir,
    });
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith("[workspace] Download failed:", "Not found");
    consoleSpy.mockRestore();
  });

  it("returns false on invalid archive data", async () => {
    // Provide invalid gzip data
    const blob = new Blob([new Uint8Array(Buffer.from("not a real tar"))], { type: "application/gzip" });
    mockDownload.mockResolvedValue({ data: blob, error: null });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await restoreWorkspace({
      archivePath: "bad/archive.tar.gz",
      targetDir,
    });
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[workspace] Restore failed:",
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it("creates targetDir if it doesn't exist", async () => {
    const newTarget = path.join(targetDir, "new", "nested", "dir");

    // Create a valid empty archive
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-empty-"));
    await fs.writeFile(path.join(emptyDir, "test.txt"), "hi");
    const tmpTar = path.join(os.tmpdir(), `restore-mkdir-${Date.now()}.tar.gz`);
    await execFileAsync("tar", ["-czf", tmpTar, "-C", emptyDir, "."]);
    const tarBuffer = await fs.readFile(tmpTar);
    await fs.rm(tmpTar, { force: true });
    await fs.rm(emptyDir, { recursive: true, force: true });

    const blob = new Blob([new Uint8Array(tarBuffer)], { type: "application/gzip" });
    mockDownload.mockResolvedValue({ data: blob, error: null });

    const result = await restoreWorkspace({
      archivePath: "some/path.tar.gz",
      targetDir: newTarget,
    });
    expect(result).toBe(true);

    const content = await fs.readFile(path.join(newTarget, "test.txt"), "utf-8");
    expect(content).toBe("hi");

    await fs.rm(newTarget, { recursive: true, force: true }).catch(() => {});
  });
});

describe("archiveWorkspace + restoreWorkspace roundtrip", () => {
  let workDir: string;
  let restoreDir: string;
  let capturedBuffer: Buffer | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedBuffer = null;
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-roundtrip-src-"));
    restoreDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-roundtrip-dst-"));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(restoreDir, { recursive: true, force: true }).catch(() => {});
  });

  it("archives and restores files faithfully", async () => {
    // Create workspace with various files
    await fs.writeFile(path.join(workDir, "README.md"), "# My Project");
    await fs.mkdir(path.join(workDir, "src"), { recursive: true });
    await fs.writeFile(path.join(workDir, "src", "main.py"), 'print("hello")');
    await fs.writeFile(path.join(workDir, "data.json"), '{"key": "value"}');

    // Capture the uploaded buffer
    mockUpload.mockImplementation(async (_path: string, buffer: Buffer) => {
      capturedBuffer = buffer;
      return { error: null };
    });

    const storagePath = await archiveWorkspace({
      workDir,
      userId: "user-rt",
      claudeSessionId: "session-rt",
    });
    expect(storagePath).not.toBeNull();
    expect(capturedBuffer).not.toBeNull();

    // Now restore using the captured buffer
    const blob = new Blob([new Uint8Array(capturedBuffer!)], { type: "application/gzip" });
    mockDownload.mockResolvedValue({ data: blob, error: null });

    const ok = await restoreWorkspace({
      archivePath: storagePath!,
      targetDir: restoreDir,
    });
    expect(ok).toBe(true);

    // Verify all files match
    expect(await fs.readFile(path.join(restoreDir, "README.md"), "utf-8")).toBe("# My Project");
    expect(await fs.readFile(path.join(restoreDir, "src", "main.py"), "utf-8")).toBe('print("hello")');
    expect(await fs.readFile(path.join(restoreDir, "data.json"), "utf-8")).toBe('{"key": "value"}');
  });
});

describe("deleteWorkspaceArchive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls storage remove with the path", async () => {
    mockRemove.mockResolvedValue({ error: null });
    await deleteWorkspaceArchive("user/session/workspace.tar.gz");
    expect(mockFrom).toHaveBeenCalledWith("session-workspaces");
    expect(mockRemove).toHaveBeenCalledWith(["user/session/workspace.tar.gz"]);
  });

  it("logs error but does not throw", async () => {
    mockRemove.mockResolvedValue({ error: { message: "not found" } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await deleteWorkspaceArchive("bad/path.tar.gz");
    expect(consoleSpy).toHaveBeenCalledWith("[workspace] Delete failed:", "not found");
    consoleSpy.mockRestore();
  });
});

describe("cleanupOldArchives", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 0 when no old sessions found", async () => {
    mockLimit.mockReturnValue(Promise.resolve({ data: [], error: null }));
    const count = await cleanupOldArchives(30);
    expect(count).toBe(0);
  });

  it("returns 0 on query error", async () => {
    mockLimit.mockReturnValue(Promise.resolve({ data: null, error: { message: "db error" } }));
    const count = await cleanupOldArchives(30);
    expect(count).toBe(0);
  });
});
