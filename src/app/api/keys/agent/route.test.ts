const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockServerFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockServerFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockAdminFrom(...args) },
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
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn().mockReturnValue("encrypted_value"),
}));

vi.mock("@/lib/agent-models", () => ({
  ALLOWED_MODEL_IDS: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"],
}));

import { POST, PATCH, DELETE } from "./route";

function chainMock(resolvedValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = ((resolve: (v: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve)) as unknown as ReturnType<typeof vi.fn>;
  return chain;
}

function setAuth(user: { id: string } | null) {
  mockGetUser.mockReturnValue(
    Promise.resolve({
      data: { user },
      error: user ? null : { message: "not authenticated" },
    })
  );
  if (user) {
    mockServerFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({
          data: { role: "user", organization_id: "org-1", org_role: "member" },
          error: null,
        });
      return chainMock();
    });
  }
}

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request("http://localhost/api/keys/agent", init);
}

describe("POST /api/keys/agent", () => {
  beforeEach(() => {
    setAuth({ id: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    mockAdminFrom.mockReturnValue(chainMock());

    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(401);
  });

  it("creates agent key with null permissions by default", async () => {
    const insertChain = chainMock({ data: { id: "key-1" }, error: null });
    const revokeChain = chainMock();
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        callCount++;
        return callCount === 1 ? revokeChain : insertChain;
      }
      return chainMock();
    });

    const res = await POST(makeRequest("POST", {}));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("key-1");
    expect(json.prefix).toBe("sk_live_test");
    expect(json.name).toBe("Agent Key");
    expect(json.expiresAt).toBeDefined();
  });

  it("stores permissions when provided", async () => {
    const insertChain = chainMock({ data: { id: "key-2" }, error: null });
    const revokeChain = chainMock();
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        callCount++;
        return callCount === 1 ? revokeChain : insertChain;
      }
      return chainMock();
    });

    const perms = { "google-calendar": null, slack: ["slack_send_message"] };
    const res = await POST(makeRequest("POST", { permissions: perms }));

    expect(res.status).toBe(200);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: perms, is_agent_key: true })
    );
  });

  it("updates preferred model when valid model provided", async () => {
    const insertChain = chainMock({ data: { id: "key-3" }, error: null });
    const revokeChain = chainMock();
    let apiKeyCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        apiKeyCallCount++;
        return apiKeyCallCount === 1 ? revokeChain : insertChain;
      }
      return chainMock();
    });
    // The route calls createClient() again (via dynamic import) to update profiles.
    // requireAuth uses the first profile call; the model update uses a second one.
    const profileUpdateChain = chainMock();
    let profileCallCount = 0;
    mockServerFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        profileCallCount++;
        if (profileCallCount === 1) {
          // requireAuth profile lookup
          return chainMock({
            data: { role: "user", organization_id: "org-1", org_role: "member" },
            error: null,
          });
        }
        // model update call
        return profileUpdateChain;
      }
      return chainMock();
    });

    await POST(makeRequest("POST", { model: "claude-opus-4-6" }));

    expect(profileUpdateChain.update).toHaveBeenCalledWith({
      preferred_agent_model: "claude-opus-4-6",
    });
  });

  it("ignores invalid model", async () => {
    const insertChain = chainMock({ data: { id: "key-4" }, error: null });
    const revokeChain = chainMock();
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        callCount++;
        return callCount === 1 ? revokeChain : insertChain;
      }
      return chainMock();
    });

    const res = await POST(makeRequest("POST", { model: "gpt-4" }));
    expect(res.status).toBe(200);
    // Should not have called profiles.update (serverFrom stays at auth-only mock)
  });

  it("revokes existing agent key before creating new one", async () => {
    const revokeChain = chainMock();
    const insertChain = chainMock({ data: { id: "key-5" }, error: null });
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        callCount++;
        return callCount === 1 ? revokeChain : insertChain;
      }
      return chainMock();
    });

    await POST(makeRequest("POST", {}));

    expect(revokeChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_agent_key: false,
        encrypted_raw_key: null,
      })
    );
    expect(revokeChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(revokeChain.eq).toHaveBeenCalledWith("is_agent_key", true);
  });

  it("returns 500 on insert error", async () => {
    const revokeChain = chainMock();
    const insertChain = chainMock({ data: null, error: { message: "db error" } });
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        callCount++;
        return callCount === 1 ? revokeChain : insertChain;
      }
      return chainMock();
    });

    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to create agent key");
  });

  it("does not return the raw key in response", async () => {
    const insertChain = chainMock({ data: { id: "key-6" }, error: null });
    const revokeChain = chainMock();
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        callCount++;
        return callCount === 1 ? revokeChain : insertChain;
      }
      return chainMock();
    });

    const res = await POST(makeRequest("POST", {}));
    const json = await res.json();

    expect(json.key).toBeUndefined();
    expect(json).not.toHaveProperty("key");
  });
});

describe("PATCH /api/keys/agent", () => {
  beforeEach(() => {
    setAuth({ id: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    mockAdminFrom.mockReturnValue(chainMock());

    const res = await PATCH(makeRequest("PATCH", { permissions: null }));
    expect(res.status).toBe(401);
  });

  it("updates permissions to specific integrations", async () => {
    const updateChain = chainMock({ data: null, error: null });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return updateChain;
      return chainMock();
    });

    const perms = { slack: ["slack_send_message"] };
    const res = await PATCH(makeRequest("PATCH", { permissions: perms }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({ permissions: perms });
    expect(updateChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateChain.eq).toHaveBeenCalledWith("is_agent_key", true);
  });

  it("updates permissions to null (full access)", async () => {
    const updateChain = chainMock({ data: null, error: null });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return updateChain;
      return chainMock();
    });

    const res = await PATCH(makeRequest("PATCH", { permissions: null }));
    expect(res.status).toBe(200);
    expect(updateChain.update).toHaveBeenCalledWith({ permissions: null });
  });

  it("returns 500 on update error", async () => {
    const updateChain = chainMock({ data: null, error: { message: "db error" } });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return updateChain;
      return chainMock();
    });

    const res = await PATCH(makeRequest("PATCH", { permissions: null }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to update permissions");
  });
});

describe("DELETE /api/keys/agent", () => {
  beforeEach(() => {
    setAuth({ id: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    mockAdminFrom.mockReturnValue(chainMock());

    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("revokes the agent key", async () => {
    const updateChain = chainMock({ data: null, error: null });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return updateChain;
      return chainMock();
    });

    const res = await DELETE();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_agent_key: false,
        encrypted_raw_key: null,
      })
    );
    expect(updateChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateChain.eq).toHaveBeenCalledWith("is_agent_key", true);
    expect(updateChain.is).toHaveBeenCalledWith("revoked_at", null);
  });

  it("returns 500 on error", async () => {
    const updateChain = chainMock({ data: null, error: { message: "db error" } });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") return updateChain;
      return chainMock();
    });

    const res = await DELETE();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to disable agent");
  });
});
