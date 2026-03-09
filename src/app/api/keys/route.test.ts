vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
  AuditEventType: {},
}));

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/crypto", () => ({
  generateApiKey: vi.fn().mockReturnValue({
    raw: "sk_live_testkey123",
    hash: "abc123hash",
    prefix: "sk_live_test",
  }),
  hashApiKey: vi.fn(),
}));

import { GET, POST, DELETE } from "./route";

// Helper to build a chainable mock for supabase.from()
function chainMock(resolvedValue: unknown = { data: [], error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve(resolvedValue).then(resolve),
  };
  return chain;
}

function setAuth(user: { id: string } | null) {
  mockGetUser.mockReturnValue(
    Promise.resolve({
      data: { user },
      error: user ? null : { message: "not authenticated" },
    })
  );
  // Also mock the profile query for requireAuth
  if (user) {
    // First from() call in requireAuth is for profiles
    const profileChain = chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileChain;
      return chainMock();
    });
  }
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/keys", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(id?: string) {
  const url = id
    ? `http://localhost/api/keys?id=${id}`
    : "http://localhost/api/keys";
  return new Request(url, { method: "DELETE" });
}

describe("GET /api/keys", () => {
  beforeEach(() => {
    setAuth({ id: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    mockFrom.mockReturnValue(chainMock());

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns keys array with default permissions null", async () => {
    const keysChain = chainMock({
      data: [
        {
          id: "key-1",
          name: "My Key",
          key_prefix: "sk_live_abc",
          last_used_at: null,
          created_at: new Date().toISOString(),
          user_id: "user-1",
          revoked_at: null,
        },
      ],
      error: null,
    });
    const profilesChain = chainMock({
      data: [{ id: "user-1", name: "Test User", email: "test@example.com" }],
      error: null,
    });
    let profileCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        profileCallCount++;
        // First call is requireAuth, second is profile lookup
        if (profileCallCount === 1)
          return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
        return profilesChain;
      }
      if (table === "api_keys") return keysChain;
      return chainMock();
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("key-1");
    expect(json[0].scope).toBe("full");
    expect(json[0].permissions).toBeNull();
  });

  it("returns permissions when present on a key", async () => {
    const perms = { "google-calendar": null, "slack": ["slack_send_message"] };
    const keysChain = chainMock({
      data: [
        {
          id: "key-2",
          name: "Restricted Key",
          key_prefix: "sk_live_xyz",
          last_used_at: null,
          created_at: new Date().toISOString(),
          user_id: "user-1",
          revoked_at: null,
          scope: "read_write",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          permissions: perms,
        },
      ],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return keysChain;
      return chainMock();
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json[0].permissions).toEqual(perms);
    expect(json[0].scope).toBe("read_write");
  });
});

describe("POST /api/keys", () => {
  beforeEach(() => {
    setAuth({ id: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    mockFrom.mockReturnValue(chainMock());

    const res = await POST(makePostRequest({ name: "Test" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns key, prefix, and name", async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "Test" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      key: "sk_live_testkey123",
      prefix: "sk_live_test",
      name: "Test",
      scope: "full",
      permissions: null,
    });
  });

  it('uses "Default" name when name is empty', async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "" }));
    const json = await res.json();

    expect(json.name).toBe("Default");
  });

  it('uses "Default" name when name is missing', async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const res = await POST(makePostRequest({}));
    const json = await res.json();

    expect(json.name).toBe("Default");
  });

  it("accepts valid permissions with null (all tools)", async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const perms = { "google-calendar": null };
    const res = await POST(makePostRequest({ name: "Cal only", permissions: perms }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.permissions).toEqual(perms);
  });

  it("accepts valid permissions with specific tool arrays", async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const perms = {
      "google-calendar": null,
      "google-gmail": ["google_gmail_list_messages", "google_gmail_get_message"],
    };
    const res = await POST(makePostRequest({ name: "Mixed", permissions: perms }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.permissions).toEqual(perms);
  });

  it("returns null permissions when not provided", async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "No perms" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.permissions).toBeNull();
  });

  it("rejects permissions that is an array", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "Bad", permissions: ["google-calendar"] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("permissions must be an object");
  });

  it("rejects permissions that is a string", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "Bad", permissions: "all" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("permissions must be an object");
  });

  it("rejects permissions with non-array, non-null values", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "Bad", permissions: { "google-calendar": "all" } }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("must be null (all tools) or a string array");
  });

  it("rejects permissions with non-string array elements", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "Bad", permissions: { "google-calendar": [123, true] } }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("must be null (all tools) or a string array");
  });

  it("accepts empty permissions object (no integrations)", async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const res = await POST(makePostRequest({ name: "Empty", permissions: {} }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.permissions).toEqual({});
  });

  it("stores permissions in the insert call", async () => {
    const insertChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return insertChain;
      return chainMock();
    });

    const perms = { "google-calendar": null, "slack": ["slack_send_message"] };
    await POST(makePostRequest({ name: "Test", permissions: perms }));

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: perms })
    );
  });
});

describe("DELETE /api/keys", () => {
  beforeEach(() => {
    setAuth({ id: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    mockFrom.mockReturnValue(chainMock());

    const res = await DELETE(makeDeleteRequest("key-1"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when missing id param", async () => {
    const res = await DELETE(makeDeleteRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing key id");
  });

  it("returns success", async () => {
    const deleteChain = chainMock({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      if (table === "api_keys") return deleteChain;
      return chainMock();
    });

    const res = await DELETE(makeDeleteRequest("key-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
  });
});
