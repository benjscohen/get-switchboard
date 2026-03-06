import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({ data: [], error: null })),
            single: vi.fn(() => ({ data: null, error: null })),
          })),
          order: vi.fn(() => ({ data: [], error: null })),
          single: vi.fn(() => ({ data: null, error: null })),
        })),
        in: vi.fn(() => ({ data: [], error: null })),
      })),
    })),
    rpc: vi.fn(() => ({ data: [], error: null })),
  },
}));
vi.mock("@/lib/usage-log", () => ({ logUsage: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ encrypt: vi.fn((v: string) => `enc:${v}`), decrypt: vi.fn((v: string) => v.replace("enc:", "")) }));
vi.mock("@/lib/mcp/proxy-client", () => ({ discoverTools: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ validatePermissionsPayload: vi.fn() }));
vi.mock("@/lib/integrations/catalog", () => ({ getFullCatalog: vi.fn() }));
vi.mock("@/lib/integrations/proxy-registry", () => ({ allProxyIntegrations: [] }));

import { registerAdminTools } from "./admin-tools";
import type { ToolMeta } from "./tool-filtering";

// ---------- helpers ----------

type ServerHandler = (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;

function createMockServer() {
  const handlers: Record<string, ServerHandler> = {};
  return {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: ServerHandler) => {
      handlers[name] = handler;
    }),
    _handlers: handlers,
  };
}

function makeExtra(overrides: Record<string, unknown> = {}) {
  return {
    authInfo: {
      extra: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "admin",
        role: "user",
        ...overrides,
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getResult(result: any) {
  return {
    text: result.content?.[0]?.text,
    isError: result.isError ?? false,
  };
}

// ---------- tests ----------

describe("registerAdminTools", () => {
  let server: ReturnType<typeof createMockServer>;
  let toolMeta: Map<string, ToolMeta>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    toolMeta = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAdminTools(server as any, toolMeta);
  });

  describe("requireOrgAdminMcp (via admin_teams)", () => {
    it("returns error when userId is missing", async () => {
      const handler = server._handlers["admin_teams"];
      const result = await handler(
        { action: "list" },
        makeExtra({ userId: undefined }),
      );
      const r = getResult(result);
      expect(r.isError).toBe(true);
      expect(r.text).toBe("Unauthorized");
    });

    it("returns error when orgRole is member", async () => {
      const handler = server._handlers["admin_teams"];
      const result = await handler(
        { action: "list" },
        makeExtra({ orgRole: "member" }),
      );
      const r = getResult(result);
      expect(r.isError).toBe(true);
      expect(r.text).toBe("Requires org admin privileges");
    });

    it("succeeds when orgRole is admin", async () => {
      const handler = server._handlers["admin_teams"];
      const result = await handler(
        { action: "list" },
        makeExtra({ orgRole: "admin" }),
      );
      const r = getResult(result);
      expect(r.isError).toBe(false);
    });

    it("succeeds when orgRole is owner", async () => {
      const handler = server._handlers["admin_teams"];
      const result = await handler(
        { action: "list" },
        makeExtra({ orgRole: "owner" }),
      );
      const r = getResult(result);
      expect(r.isError).toBe(false);
    });
  });

  describe("requireSuperAdminMcp (via admin_users)", () => {
    it("returns error when userId is missing", async () => {
      const handler = server._handlers["admin_users"];
      const result = await handler(
        { action: "list" },
        makeExtra({ userId: undefined, role: "admin" }),
      );
      const r = getResult(result);
      expect(r.isError).toBe(true);
      expect(r.text).toBe("Unauthorized");
    });

    it("returns error when role is not admin", async () => {
      const handler = server._handlers["admin_users"];
      const result = await handler(
        { action: "list" },
        makeExtra({ role: "user", orgRole: "admin" }),
      );
      const r = getResult(result);
      expect(r.isError).toBe(true);
      expect(r.text).toBe("Requires super admin privileges");
    });

    it("succeeds when role is admin even if orgRole is member", async () => {
      const handler = server._handlers["admin_users"];
      const result = await handler(
        { action: "list" },
        makeExtra({ role: "admin", orgRole: "member" }),
      );
      const r = getResult(result);
      // Should not be an auth error (it may be a DB error from mocks, that's fine)
      expect(r.text).not.toBe("Unauthorized");
      expect(r.text).not.toBe("Requires super admin privileges");
    });
  });

  describe("resolveJoin usage in admin_teams get", () => {
    it("uses resolveJoin to extract profile from FK join", async () => {
      // We need to set up the mock chain for admin_teams get action
      const { supabaseAdmin } = await import("@/lib/supabase/admin");

      // Build a mock chain for the teams query
      const singleTeam = vi.fn(() => ({
        data: { id: "t1", name: "Engineering", slug: "engineering", created_at: "2024-01-01", updated_at: "2024-01-01" },
        error: null,
      }));
      const eqOrgId = vi.fn(() => ({ single: singleTeam }));
      const eqTeamId = vi.fn(() => ({ eq: eqOrgId }));
      const selectTeam = vi.fn(() => ({ eq: eqTeamId }));

      // Build a mock for team_members with FK join profiles
      const memberData = [
        {
          id: "m1",
          user_id: "u1",
          role: "lead",
          joined_at: "2024-01-01",
          profiles: [{ name: "Alice", image: "alice.png" }], // Array form (FK join)
        },
        {
          id: "m2",
          user_id: "u2",
          role: "member",
          joined_at: "2024-02-01",
          profiles: { name: "Bob", image: null }, // Object form (FK join)
        },
      ];
      const eqMemberTeamId = vi.fn(() => ({ data: memberData, error: null }));
      const selectMembers = vi.fn(() => ({ eq: eqMemberTeamId }));

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // teams query
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { select: selectTeam } as any;
        }
        // team_members query
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { select: selectMembers } as any;
      });

      const handler = server._handlers["admin_teams"];
      const result = await handler(
        { action: "get", team_id: "t1" },
        makeExtra({ orgRole: "admin" }),
      );

      const r = getResult(result);
      expect(r.isError).toBe(false);

      const parsed = JSON.parse(r.text);
      expect(parsed.members).toHaveLength(2);
      // Array form resolved
      expect(parsed.members[0].name).toBe("Alice");
      // Object form resolved
      expect(parsed.members[1].name).toBe("Bob");
    });
  });
});
