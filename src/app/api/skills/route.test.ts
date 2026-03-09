import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

const mockFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    authenticated: true,
    userId: "user-1",
    organizationId: "org-1",
    orgRole: "member",
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockCreateSkill = vi.fn().mockResolvedValue({
  ok: true,
  data: { id: "skill-1", name: "Test" },
  status: 201,
});
const mockListSkills = vi.fn().mockResolvedValue({
  ok: true,
  data: { organization: [], team: [], user: [] },
});

vi.mock("@/lib/skills/service", () => ({
  createSkill: (...args: unknown[]) => mockCreateSkill(...args),
  listSkills: (...args: unknown[]) => mockListSkills(...args),
}));

import { GET, POST } from "./route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainMock(resolvedValue: unknown = { data: [], error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const m of ["select", "insert", "eq", "in", "order"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

// ── 2a: teamIds included in both GET and POST ──

describe("GET /api/skills — teamIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSkills.mockResolvedValue({
      ok: true,
      data: { organization: [], team: [], user: [] },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return chainMock({
          data: [{ team_id: "team-1" }, { team_id: "team-2" }],
          error: null,
        });
      }
      return chainMock();
    });
  });

  it("fetches team memberships and passes teamIds to listSkills", async () => {
    await GET();

    expect(mockListSkills).toHaveBeenCalledOnce();
    const [skillAuth] = mockListSkills.mock.calls[0];
    expect(skillAuth.teamIds).toEqual(["team-1", "team-2"]);
    expect(skillAuth.userId).toBe("user-1");
    expect(skillAuth.organizationId).toBe("org-1");
  });
});

describe("POST /api/skills — teamIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSkill.mockResolvedValue({
      ok: true,
      data: { id: "skill-1", name: "Test" },
      status: 201,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return chainMock({
          data: [{ team_id: "team-1" }, { team_id: "team-2" }],
          error: null,
        });
      }
      return chainMock();
    });
  });

  it("includes teamIds in skillAuth for createSkill", async () => {
    const req = new Request("http://localhost/api/skills", {
      method: "POST",
      body: JSON.stringify({ scope: "user", name: "Test", content: "test content" }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);

    expect(mockCreateSkill).toHaveBeenCalledOnce();
    const [skillAuth] = mockCreateSkill.mock.calls[0];
    expect(skillAuth.teamIds).toEqual(["team-1", "team-2"]);
    expect(skillAuth.userId).toBe("user-1");
    expect(skillAuth.organizationId).toBe("org-1");
  });

  it("handles empty team memberships gracefully", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return chainMock({ data: [], error: null });
      }
      return chainMock();
    });

    const req = new Request("http://localhost/api/skills", {
      method: "POST",
      body: JSON.stringify({ scope: "user", name: "Test", content: "test content" }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);

    const [skillAuth] = mockCreateSkill.mock.calls[0];
    expect(skillAuth.teamIds).toEqual([]);
  });

  it("handles null team memberships gracefully", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return chainMock({ data: null, error: null });
      }
      return chainMock();
    });

    const req = new Request("http://localhost/api/skills", {
      method: "POST",
      body: JSON.stringify({ scope: "user", name: "Test", content: "test content" }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);

    const [skillAuth] = mockCreateSkill.mock.calls[0];
    expect(skillAuth.teamIds).toEqual([]);
  });
});
