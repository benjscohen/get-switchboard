import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockLoggerError = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  normalizePath,
  getParentPath,
  getFileName,
  validatePath,
  parseMarkdownToFiles,
  readFileById,
  deleteFileById,
  updateFileById,
  writeFile,
  parseAndUpsertFiles,
  type FileAuth,
} from "./service";

// Chainable Supabase mock
function chainMock(resolvedValue: unknown = { data: null, error: null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const m of [
    "select", "insert", "update", "delete", "eq", "is", "in",
    "order", "limit", "like", "or", "ilike", "upsert", "maybeSingle",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

// ── Pure Function Tests ──

describe("normalizePath", () => {
  it("adds leading slash", () => {
    expect(normalizePath("foo/bar")).toBe("/foo/bar");
  });
  it("collapses multiple slashes", () => {
    expect(normalizePath("///foo///bar///")).toBe("/foo/bar");
  });
  it("handles root", () => {
    expect(normalizePath("/")).toBe("/");
  });
  it("converts backslashes", () => {
    expect(normalizePath("foo\\bar")).toBe("/foo/bar");
  });
});

describe("getParentPath", () => {
  it("returns parent directory", () => {
    expect(getParentPath("/foo/bar/baz")).toBe("/foo/bar");
  });
  it("returns root for top-level path", () => {
    expect(getParentPath("/foo")).toBe("/");
  });
});

describe("getFileName", () => {
  it("returns file name from path", () => {
    expect(getFileName("/foo/bar/baz.txt")).toBe("baz.txt");
  });
});

describe("validatePath", () => {
  it("rejects root path", () => {
    expect(validatePath("/")).not.toBeNull();
  });
  it("rejects relative path segments", () => {
    expect(validatePath("/foo/../bar")).not.toBeNull();
  });
  it("accepts valid path", () => {
    expect(validatePath("/foo/bar/baz.txt")).toBeNull();
  });
  it("rejects paths exceeding max depth", () => {
    expect(validatePath("/1/2/3/4/5/6/7/8/9/10/11")).not.toBeNull();
  });
  it("rejects invalid characters", () => {
    expect(validatePath("/foo<bar")).not.toBeNull();
  });
});

describe("parseMarkdownToFiles", () => {
  it("parses sections into file entries", () => {
    const md = "# Files\n\n## /hello.txt\nworld\n\n## /empty.txt\n";
    const result = parseMarkdownToFiles(md);
    expect(result).toEqual([
      { path: "/hello.txt", content: "world" },
      { path: "/empty.txt", content: "" },
    ]);
  });
  it("handles empty markdown", () => {
    expect(parseMarkdownToFiles("")).toEqual([]);
  });
});

// ── 1a: Org filter on ID-based queries ──

describe("readFileById — org filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies .eq(organization_id) when organizationId is set", async () => {
    const chain = chainMock({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(chain);

    await readFileById({ userId: "u1", organizationId: "org-1" }, "file-1");

    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("applies .is(organization_id, null) when organizationId is absent", async () => {
    const chain = chainMock({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(chain);

    await readFileById({ userId: "u1" }, "file-1");

    expect(chain.is).toHaveBeenCalledWith("organization_id", null);
  });

  it("returns formatted file when found", async () => {
    const row = {
      id: "f1", path: "/test.txt", name: "test.txt", parent_path: "/",
      is_folder: false, content: "hello", mime_type: "text/plain",
      metadata: {}, current_version: 1, created_at: "2024-01-01", updated_at: "2024-01-01",
    };
    const chain = chainMock({ data: row, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await readFileById({ userId: "u1", organizationId: "org-1" }, "f1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("f1");
  });
});

describe("deleteFileById — org filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies .eq(organization_id) when organizationId is set", async () => {
    const chain = chainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await deleteFileById({ userId: "u1", organizationId: "org-1" }, "file-1");

    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("applies .is(organization_id, null) when organizationId is absent", async () => {
    const chain = chainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await deleteFileById({ userId: "u1" }, "file-1");

    expect(chain.is).toHaveBeenCalledWith("organization_id", null);
  });
});

describe("updateFileById — org filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies org filter on the initial file lookup", async () => {
    const chain = chainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await updateFileById(
      { userId: "u1", organizationId: "org-1" },
      "file-1",
      { content: "new" },
    );

    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

// ── 1c: Version insert error handling ──

describe("writeFile — version error logging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs but does not fail when version insert errors", async () => {
    const fileRow = {
      id: "f1", path: "/test.txt", name: "test.txt", parent_path: "/",
      is_folder: false, content: "hello", mime_type: "text/plain",
      metadata: {}, current_version: 1, created_at: "2024-01-01", updated_at: "2024-01-01",
    };

    // ensureParentFolders returns early for root parent (no DB call).
    // So: call 1 = existing check (maybeSingle → null), call 2 = insert (single → fileRow)
    let filesCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "files") {
        filesCallCount++;
        if (filesCallCount === 1) {
          // existing file check — no existing file
          return chainMock({ data: null, error: null });
        }
        // insert — return the created file
        return chainMock({ data: fileRow, error: null });
      }
      if (table === "file_versions") {
        // version insert fails
        const chain = chainMock();
        chain.insert = vi.fn(() => ({
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve({ data: null, error: { message: "version insert failed" } }).then(resolve),
        }));
        return chain;
      }
      return chainMock();
    });

    const auth: FileAuth = { userId: "u1" };
    const result = await writeFile(auth, "/test.txt", "hello");

    // The write should still succeed
    expect(result.ok).toBe(true);
    expect(mockLoggerError).toHaveBeenCalledWith(
      { errMessage: "version insert failed" },
      "Failed to record file version",
    );
  });
});

// ── 1d: Markdown import size limit ──

describe("parseAndUpsertFiles — size limit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects markdown over 10MB with 413", async () => {
    const huge = "x".repeat(10_000_001);
    const result = await parseAndUpsertFiles({ userId: "u1" }, huge);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toMatch(/too large/i);
    }
  });

  it("accepts markdown at exactly 10MB", async () => {
    // Set up minimal mocks — the function will proceed past the size check
    mockFrom.mockReturnValue(chainMock({ data: [], error: null }));
    const atLimit = "x".repeat(10_000_000);

    const result = await parseAndUpsertFiles({ userId: "u1" }, atLimit);

    // May fail for other reasons with mocks, but should NOT be 413
    if (!result.ok) expect(result.status).not.toBe(413);
  });
});
