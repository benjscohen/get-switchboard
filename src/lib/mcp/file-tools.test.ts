import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/usage-log", () => ({ logUsage: vi.fn() }));

vi.mock("@/lib/files/service", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  moveFile: vi.fn(),
  listDirectory: vi.fn(),
  searchFiles: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  resolveFileId: vi.fn(),
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  rollbackFile: vi.fn(),
}));

import { registerFileTools } from "./file-tools";
import {
  readFile,
  writeFile,
  deleteFile,
  moveFile,
  listDirectory,
  searchFiles,
  createFolder,
  deleteFolder,
  resolveFileId,
  listVersions,
  getVersion,
  rollbackFile,
} from "@/lib/files/service";

// ---------- helpers ----------

function createMockServer() {
  const registeredTools: Record<string, { handler: (...args: unknown[]) => unknown }> = {};
  return {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) => {
      registeredTools[name] = { handler };
    }),
    _registeredTools: registeredTools,
  };
}

function makeExtra(overrides: Record<string, unknown> = {}) {
  return {
    authInfo: {
      extra: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "member",
        ...overrides,
      },
    },
  };
}

function noAuthExtra() {
  return { authInfo: { extra: {} } };
}

// ---------- tests ----------

describe("registerFileTools", () => {
  let server: ReturnType<typeof createMockServer>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toolMeta: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    toolMeta = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerFileTools(server as any, toolMeta);
  });

  it("registers all expected file tools", () => {
    const expectedTools = [
      "file_read",
      "file_write",
      "file_delete",
      "file_move",
      "file_list",
      "file_search",
      "folder_create",
      "folder_delete",
      "file_history",
      "file_version_read",
      "file_rollback",
    ];
    for (const name of expectedTools) {
      expect(server._registeredTools[name]).toBeDefined();
      expect(toolMeta.get(name)).toEqual({ integrationId: "platform", orgId: null });
    }
  });

  // ---------- shared auth behavior ----------

  describe("auth", () => {
    it.each([
      "file_read",
      "file_write",
      "file_delete",
      "file_move",
      "file_list",
      "file_search",
      "folder_create",
      "folder_delete",
      "file_history",
      "file_version_read",
      "file_rollback",
    ])("%s returns Unauthorized when userId missing", async (toolName) => {
      const handler = server._registeredTools[toolName].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ path: "/test", version: 1, query: "q", from: "/a", to: "/b", content: "c" }, noAuthExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Unauthorized");
    });
  });

  // ---------- file_read ----------

  describe("file_read", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_read"].handler(args, extra) as Promise<any>;
    }

    it("returns file data on success", async () => {
      const fileData = { id: "f1", path: "/soul.md", content: "hello", version: 1 };
      vi.mocked(readFile).mockResolvedValue({ ok: true, data: fileData });
      const result = await call({ path: "/soul.md" });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(fileData);
      expect(readFile).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", organizationId: "org-1" }),
        "/soul.md",
      );
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(readFile).mockResolvedValue({ ok: false, error: "Not found", status: 404 } as any);
      const result = await call({ path: "/missing.md" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Not found");
    });
  });

  // ---------- file_write ----------

  describe("file_write", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_write"].handler(args, extra) as Promise<any>;
    }

    it("creates file and returns success message", async () => {
      const fileData = { id: "f1", path: "/new.md", version: 1 };
      vi.mocked(writeFile).mockResolvedValue({ ok: true, data: fileData });
      const result = await call({ path: "/new.md", content: "hello world" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('File "/new.md" saved.');
      expect(writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "/new.md",
        "hello world",
        { metadata: undefined },
      );
    });

    it("passes metadata through", async () => {
      vi.mocked(writeFile).mockResolvedValue({ ok: true, data: { id: "f1" } });
      await call({ path: "/new.md", content: "hi", metadata: { tags: ["a"] } });
      expect(writeFile).toHaveBeenCalledWith(
        expect.anything(),
        "/new.md",
        "hi",
        { metadata: { tags: ["a"] } },
      );
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(writeFile).mockResolvedValue({ ok: false, error: "Quota exceeded", status: 403 } as any);
      const result = await call({ path: "/new.md", content: "x" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Quota exceeded");
    });
  });

  // ---------- file_delete ----------

  describe("file_delete", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_delete"].handler(args, extra) as Promise<any>;
    }

    it("returns success message", async () => {
      vi.mocked(deleteFile).mockResolvedValue({ ok: true, data: { deleted: true } });
      const result = await call({ path: "/old.md" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('File "/old.md" deleted.');
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(deleteFile).mockResolvedValue({ ok: false, error: "Not found", status: 404 } as any);
      const result = await call({ path: "/missing.md" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Not found");
    });
  });

  // ---------- file_move ----------

  describe("file_move", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_move"].handler(args, extra) as Promise<any>;
    }

    it("returns success message with paths", async () => {
      const fileData = { id: "f1", path: "/new-path.md" };
      vi.mocked(moveFile).mockResolvedValue({ ok: true, data: fileData });
      const result = await call({ from: "/old.md", to: "/new-path.md" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Moved "/old.md" to "/new-path.md"');
      expect(moveFile).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "/old.md",
        "/new-path.md",
      );
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(moveFile).mockResolvedValue({ ok: false, error: "Conflict", status: 409 } as any);
      const result = await call({ from: "/a", to: "/b" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Conflict");
    });
  });

  // ---------- file_list ----------

  describe("file_list", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_list"].handler(args, extra) as Promise<any>;
    }

    it("lists directory and returns data", async () => {
      const entries = [{ name: "file.md", type: "file" }];
      vi.mocked(listDirectory).mockResolvedValue({ ok: true, data: entries });
      const result = await call({ path: "/projects" });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(entries);
      expect(listDirectory).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "/projects",
        { recursive: undefined },
      );
    });

    it("defaults to root when path not provided", async () => {
      vi.mocked(listDirectory).mockResolvedValue({ ok: true, data: [] });
      await call({});
      expect(listDirectory).toHaveBeenCalledWith(expect.anything(), "/", { recursive: undefined });
    });

    it("passes recursive option", async () => {
      vi.mocked(listDirectory).mockResolvedValue({ ok: true, data: [] });
      await call({ path: "/", recursive: true });
      expect(listDirectory).toHaveBeenCalledWith(expect.anything(), "/", { recursive: true });
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(listDirectory).mockResolvedValue({ ok: false, error: "DB error", status: 500 } as any);
      const result = await call({ path: "/" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("DB error");
    });
  });

  // ---------- file_search ----------

  describe("file_search", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_search"].handler(args, extra) as Promise<any>;
    }

    it("passes search params and returns results", async () => {
      const results = [{ id: "f1", path: "/notes.md" }];
      vi.mocked(searchFiles).mockResolvedValue({ ok: true, data: results });
      const result = await call({ query: "hello", path: "/projects" });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(results);
      expect(searchFiles).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        { query: "hello", path: "/projects" },
      );
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(searchFiles).mockResolvedValue({ ok: false, error: "Search failed", status: 500 } as any);
      const result = await call({ query: "test" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Search failed");
    });
  });

  // ---------- folder_create ----------

  describe("folder_create", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["folder_create"].handler(args, extra) as Promise<any>;
    }

    it("creates folder and returns success message", async () => {
      const folderData = { id: "d1", path: "/projects/new" };
      vi.mocked(createFolder).mockResolvedValue({ ok: true, data: folderData });
      const result = await call({ path: "/projects/new" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Folder "/projects/new" created.');
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createFolder).mockResolvedValue({ ok: false, error: "Already exists", status: 409 } as any);
      const result = await call({ path: "/projects/dup" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Already exists");
    });
  });

  // ---------- folder_delete ----------

  describe("folder_delete", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["folder_delete"].handler(args, extra) as Promise<any>;
    }

    it("deletes folder and returns success message", async () => {
      vi.mocked(deleteFolder).mockResolvedValue({ ok: true, data: { deleted: true } });
      const result = await call({ path: "/old-folder" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('Folder "/old-folder" deleted.');
      expect(deleteFolder).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "/old-folder",
        { recursive: undefined },
      );
    });

    it("passes recursive option", async () => {
      vi.mocked(deleteFolder).mockResolvedValue({ ok: true, data: { deleted: true } });
      await call({ path: "/dir", recursive: true });
      expect(deleteFolder).toHaveBeenCalledWith(expect.anything(), "/dir", { recursive: true });
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(deleteFolder).mockResolvedValue({ ok: false, error: "Not empty", status: 400 } as any);
      const result = await call({ path: "/non-empty" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Not empty");
    });
  });

  // ---------- file_history ----------

  describe("file_history", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_history"].handler(args, extra) as Promise<any>;
    }

    it("resolves file path and returns version list", async () => {
      vi.mocked(resolveFileId).mockResolvedValue({ ok: true, data: { id: "f1", currentVersion: 3 } });
      const versions = [
        { version: 1, content: "v1 content", createdAt: "2026-01-01" },
        { version: 2, content: "v2 content", createdAt: "2026-01-02" },
      ];
      vi.mocked(listVersions).mockResolvedValue({ ok: true, data: versions });

      const result = await call({ path: "/soul.md" });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(versions);
      expect(resolveFileId).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "/soul.md",
      );
      expect(listVersions).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "f1",
      );
    });

    it("returns error when file path cannot be resolved", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(resolveFileId).mockResolvedValue({ ok: false, error: "File not found", status: 404 } as any);
      const result = await call({ path: "/missing.md" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("File not found");
      expect(listVersions).not.toHaveBeenCalled();
    });

    it("returns error when listVersions fails", async () => {
      vi.mocked(resolveFileId).mockResolvedValue({ ok: true, data: { id: "f1", currentVersion: 1 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(listVersions).mockResolvedValue({ ok: false, error: "DB error", status: 500 } as any);
      const result = await call({ path: "/soul.md" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("DB error");
    });
  });

  // ---------- file_version_read ----------

  describe("file_version_read", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_version_read"].handler(args, extra) as Promise<any>;
    }

    it("resolves file path and returns single version data", async () => {
      vi.mocked(resolveFileId).mockResolvedValue({ ok: true, data: { id: "f1", currentVersion: 3 } });
      const versionData = { version: 1, content: "original content", createdAt: "2026-01-01" };
      vi.mocked(getVersion).mockResolvedValue({ ok: true, data: versionData });

      const result = await call({ path: "/soul.md", version: 1 });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(versionData);
      expect(resolveFileId).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", organizationId: "org-1" }),
        "/soul.md",
      );
      expect(getVersion).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", organizationId: "org-1" }),
        "f1",
        1,
      );
    });

    it("returns error when file path cannot be resolved", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(resolveFileId).mockResolvedValue({ ok: false, error: "File not found", status: 404 } as any);
      const result = await call({ path: "/missing.md", version: 1 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("File not found");
      expect(getVersion).not.toHaveBeenCalled();
    });

    it("returns error when getVersion fails", async () => {
      vi.mocked(resolveFileId).mockResolvedValue({ ok: true, data: { id: "f1", currentVersion: 3 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(getVersion).mockResolvedValue({ ok: false, error: "Version not found", status: 404 } as any);
      const result = await call({ path: "/soul.md", version: 99 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Version not found");
    });

    it("returns Unauthorized when auth is missing", async () => {
      const result = await call({ path: "/soul.md", version: 1 }, noAuthExtra());
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Unauthorized");
      expect(resolveFileId).not.toHaveBeenCalled();
      expect(getVersion).not.toHaveBeenCalled();
    });

    it("passes correct version number to service", async () => {
      vi.mocked(resolveFileId).mockResolvedValue({ ok: true, data: { id: "f1", currentVersion: 5 } });
      vi.mocked(getVersion).mockResolvedValue({ ok: true, data: { version: 3, content: "v3" } });

      await call({ path: "/notes.md", version: 3 });
      expect(getVersion).toHaveBeenCalledWith(expect.anything(), "f1", 3);
    });
  });

  // ---------- file_rollback ----------

  describe("file_rollback", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function call(args: Record<string, unknown>, extra: any = makeExtra()) {
      return server._registeredTools["file_rollback"].handler(args, extra) as Promise<any>;
    }

    it("resolves file path and returns rollback result", async () => {
      vi.mocked(resolveFileId).mockResolvedValue({ ok: true, data: { id: "f1", currentVersion: 3 } });
      const rolledBack = { id: "f1", path: "/soul.md", version: 4, content: "v1 content" };
      vi.mocked(rollbackFile).mockResolvedValue({ ok: true, data: rolledBack });

      const result = await call({ path: "/soul.md", version: 1 });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('File "/soul.md" rolled back to version 1.');
      expect(result.content[0].text).toContain('"id": "f1"');
      expect(resolveFileId).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "/soul.md",
      );
      expect(rollbackFile).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        "f1",
        1,
      );
    });

    it("returns error when file path cannot be resolved", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(resolveFileId).mockResolvedValue({ ok: false, error: "File not found", status: 404 } as any);
      const result = await call({ path: "/missing.md", version: 1 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("File not found");
      expect(rollbackFile).not.toHaveBeenCalled();
    });

    it("returns error when rollbackFile fails", async () => {
      vi.mocked(resolveFileId).mockResolvedValue({ ok: true, data: { id: "f1", currentVersion: 3 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(rollbackFile).mockResolvedValue({ ok: false, error: "Version not found", status: 404 } as any);
      const result = await call({ path: "/soul.md", version: 99 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Version not found");
    });
  });
});
