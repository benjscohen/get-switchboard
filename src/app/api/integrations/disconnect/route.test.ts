import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { POST } from "./route";

// Helper to build a chainable mock
function chainMock(resolvedValue: unknown = { data: null, error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
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
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles")
        return chainMock({ data: { role: "user", organization_id: "org-1", org_role: "member" }, error: null });
      return chainMock();
    });
  }
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/integrations/disconnect", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/integrations/disconnect", () => {
  beforeEach(() => {
    setAuth({ id: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    setAuth(null);
    mockFrom.mockReturnValue(chainMock());

    const res = await POST(makeRequest({ integrationId: "google-calendar" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when missing integrationId", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing integrationId");
  });

  it("returns success", async () => {
    const res = await POST(makeRequest({ integrationId: "google-calendar" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
  });
});
