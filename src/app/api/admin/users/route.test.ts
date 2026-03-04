const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAdminFrom = vi.fn();
const mockRpc = vi.fn();
const mockCreateUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockAdminFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { admin: { createUser: (...args: unknown[]) => mockCreateUser(...args) } },
  },
}));

import { NextRequest } from "next/server";
import { GET, POST, DELETE, PATCH } from "./route";

function chainMock(resolvedValue: unknown = { data: null, error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
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
  if (user) {
    const profileChain = chainMock({
      data: { role: "admin", organization_id: "org-1", org_role: "owner" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileChain;
      return chainMock();
    });
  }
}

function makePatchRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/users?id=${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(id?: string) {
  const url = id
    ? `http://localhost/api/admin/users?id=${id}`
    : "http://localhost/api/admin/users";
  return new NextRequest(url, { method: "DELETE" });
}

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ---------- GET ----------

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    setAuth({ id: "admin-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    mockGetUser.mockReturnValue(
      Promise.resolve({ data: { user: { id: "user-1" } }, error: null })
    );
    mockFrom.mockImplementation(() =>
      chainMock({
        data: { role: "user", organization_id: "org-1", org_role: "member" },
        error: null,
      })
    );
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns mapped users with org fields", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "u1",
          name: "Alice",
          email: "alice@co.com",
          image: null,
          role: "user",
          status: "active",
          permissions_mode: "full",
          organization_id: "org-1",
          org_role: "member",
          org_name: "Acme",
          api_key_count: 2,
          connection_count: 1,
          request_count: 10,
          last_active: "2026-01-01",
        },
      ],
      error: null,
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].orgName).toBe("Acme");
    expect(json[0].orgRole).toBe("member");
    expect(json[0].organizationId).toBe("org-1");
    expect(json[0].apiKeyCount).toBe(2);
  });

  it("returns 500 when rpc fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "fail" } });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ---------- POST ----------

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    setAuth({ id: "admin-1" });
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makePostRequest({ name: "Test" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("Email is required");
  });

  it("returns 409 when user already exists", async () => {
    mockAdminFrom.mockImplementation(() =>
      chainMock({ data: { id: "existing-id" }, error: null })
    );
    const res = await POST(makePostRequest({ email: "dup@co.com" }));
    expect(res.status).toBe(409);
  });
});

// ---------- DELETE ----------

describe("DELETE /api/admin/users", () => {
  beforeEach(() => {
    setAuth({ id: "admin-1" });
  });

  it("returns 400 when id is missing", async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 when deactivating self", async () => {
    const res = await DELETE(makeDeleteRequest("admin-1"));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("Cannot deactivate yourself");
  });

  it("returns 404 when user not found", async () => {
    mockAdminFrom.mockImplementation(() =>
      chainMock({ data: null, error: null })
    );
    const res = await DELETE(makeDeleteRequest("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("deactivates user successfully", async () => {
    const selectChain = chainMock({ data: { id: "user-2" }, error: null });
    const updateChain = chainMock({ data: null, error: null });
    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      // First call: select profile, second call: update status
      return callCount === 1 ? selectChain : updateChain;
    });

    const res = await DELETE(makeDeleteRequest("user-2"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});

// ---------- PATCH ----------

describe("PATCH /api/admin/users", () => {
  beforeEach(() => {
    setAuth({ id: "admin-1" });
    mockAdminFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    const res = await PATCH(makePatchRequest("user-2", { role: "user" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ role: "user" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("User ID required");
  });

  it("returns 400 when demoting self", async () => {
    const res = await PATCH(makePatchRequest("admin-1", { role: "user" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Cannot demote yourself");
  });

  it("returns 400 when setting own permissions to custom", async () => {
    const res = await PATCH(
      makePatchRequest("admin-1", { permissionsMode: "custom" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Cannot set your own permissions to custom");
  });

  it("returns 400 when no valid fields provided", async () => {
    const res = await PATCH(
      makePatchRequest("user-2", { bogus: "value" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No valid fields to update");
  });

  it("updates system role", async () => {
    const updateChain = chainMock({
      data: {
        id: "user-2",
        email: "u@co.com",
        name: "User",
        role: "admin",
        status: "active",
        permissions_mode: "full",
        org_role: "member",
      },
      error: null,
    });
    mockAdminFrom.mockImplementation(() => updateChain);

    const res = await PATCH(makePatchRequest("user-2", { role: "admin" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.role).toBe("admin");
    expect(json.orgRole).toBe("member");
  });

  it("updates org role", async () => {
    const updateChain = chainMock({
      data: {
        id: "user-2",
        email: "u@co.com",
        name: "User",
        role: "user",
        status: "active",
        permissions_mode: "full",
        org_role: "admin",
      },
      error: null,
    });
    mockAdminFrom.mockImplementation(() => updateChain);

    const res = await PATCH(makePatchRequest("user-2", { orgRole: "admin" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.orgRole).toBe("admin");
  });

  it("rejects invalid orgRole values", async () => {
    const res = await PATCH(
      makePatchRequest("user-2", { orgRole: "superuser" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No valid fields to update");
  });

  it("removes user from org — creates personal org and moves user", async () => {
    const orgInsertChain = chainMock({
      data: { id: "new-personal-org" },
      error: null,
    });
    const profileUpdateChain = chainMock({ data: null, error: null });
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "organizations") return orgInsertChain;
      if (table === "profiles") return profileUpdateChain;
      return chainMock();
    });

    const res = await PATCH(
      makePatchRequest("user-2", { removeFromOrg: true })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(orgInsertChain.insert).toHaveBeenCalled();
    expect(profileUpdateChain.update).toHaveBeenCalled();
  });

  it("returns 400 when removing self from org", async () => {
    const res = await PATCH(
      makePatchRequest("admin-1", { removeFromOrg: true })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Cannot remove yourself from your organization");
  });

  it("returns 500 when personal org creation fails", async () => {
    mockAdminFrom.mockImplementation(() =>
      chainMock({ data: null, error: null })
    );

    const res = await PATCH(
      makePatchRequest("user-2", { removeFromOrg: true })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to create personal org");
  });

  it("cleans up access rows when switching to full permissions", async () => {
    const updateChain = chainMock({
      data: {
        id: "user-2",
        email: "u@co.com",
        name: "User",
        role: "user",
        status: "active",
        permissions_mode: "full",
        org_role: "member",
      },
      error: null,
    });
    const deleteChain = chainMock({ data: null, error: null });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "user_integration_access") return deleteChain;
      return updateChain;
    });

    const res = await PATCH(
      makePatchRequest("user-2", { permissionsMode: "full" })
    );
    expect(res.status).toBe(200);
    expect(deleteChain.delete).toHaveBeenCalled();
  });

  it("returns 500 when profile update fails", async () => {
    mockAdminFrom.mockImplementation(() =>
      chainMock({ data: null, error: { message: "db error" } })
    );

    const res = await PATCH(makePatchRequest("user-2", { role: "user" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Update failed");
  });
});
