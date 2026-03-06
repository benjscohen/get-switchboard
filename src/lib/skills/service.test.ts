import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  listSkillVersions,
  getSkillVersion,
  updateSkill,
  slugify,
  type SkillAuth,
  type SkillRow,
} from "./service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainMock(resolvedValue: unknown = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const m of [
    "select", "insert", "update", "delete", "eq", "is", "in", "order", "limit", "like",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

function makeSkill(overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    id: "skill-1",
    name: "Test Skill",
    slug: "test-skill",
    description: null,
    content: "test content",
    arguments: [],
    organization_id: "org-1",
    team_id: null,
    user_id: null,
    enabled: true,
    current_version: 1,
    created_by: "user-1",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  };
}

// ── Pure helpers ──

describe("slugify", () => {
  it("converts to lowercase kebab-case", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
  it("strips special characters", () => {
    expect(slugify("foo@bar#baz")).toBe("foo-bar-baz");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("---test---")).toBe("test");
  });
});

// ── 2b: Version history uses canViewSkill (not canEditSkill) ──

describe("listSkillVersions — canViewSkill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows team member to view versions of team-scoped skill", async () => {
    const skill = makeSkill({ organization_id: null, team_id: "team-1" });
    const versionsData = [
      { id: "v1", skill_id: "skill-1", version: 1, name: "Test", description: null,
        content: "c", arguments: [], enabled: true, change_type: "created",
        changed_by: "user-1", change_summary: null, created_at: "2024-01-01" },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") return chainMock({ data: skill, error: null });
      if (table === "skill_versions") return chainMock({ data: versionsData, error: null });
      return chainMock();
    });

    const auth: SkillAuth = {
      userId: "user-2", organizationId: "org-1", orgRole: "member",
      teamIds: ["team-1"],
    };
    const result = await listSkillVersions(auth, "skill-1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it("denies non-team-member from viewing team-scoped skill versions", async () => {
    const skill = makeSkill({ organization_id: null, team_id: "team-1" });

    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") return chainMock({ data: skill, error: null });
      return chainMock();
    });

    const auth: SkillAuth = {
      userId: "user-2", organizationId: "org-1", orgRole: "member",
      teamIds: ["team-other"],
    };
    const result = await listSkillVersions(auth, "skill-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("allows org member (not admin) to view org-scoped skill versions", async () => {
    const skill = makeSkill({ organization_id: "org-1" });

    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") return chainMock({ data: skill, error: null });
      if (table === "skill_versions") return chainMock({ data: [], error: null });
      return chainMock();
    });

    const auth: SkillAuth = {
      userId: "user-2", organizationId: "org-1", orgRole: "member",
    };
    const result = await listSkillVersions(auth, "skill-1");

    expect(result.ok).toBe(true);
  });

  it("denies user from different org from viewing org-scoped skill versions", async () => {
    const skill = makeSkill({ organization_id: "org-other" });

    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") return chainMock({ data: skill, error: null });
      return chainMock();
    });

    const auth: SkillAuth = {
      userId: "user-2", organizationId: "org-1", orgRole: "member",
    };
    const result = await listSkillVersions(auth, "skill-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

describe("getSkillVersion — canViewSkill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows team member to view specific version", async () => {
    const skill = makeSkill({ organization_id: null, team_id: "team-1" });
    const versionData = {
      id: "v1", skill_id: "skill-1", version: 1, name: "Test",
      description: null, content: "c", arguments: [], enabled: true,
      change_type: "created", changed_by: "user-1", change_summary: null,
      created_at: "2024-01-01",
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") return chainMock({ data: skill, error: null });
      if (table === "skill_versions") return chainMock({ data: versionData, error: null });
      return chainMock();
    });

    const auth: SkillAuth = {
      userId: "user-2", organizationId: "org-1", orgRole: "member",
      teamIds: ["team-1"],
    };
    const result = await getSkillVersion(auth, "skill-1", 1);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.version).toBe(1);
  });

  it("denies non-team-member from viewing team-scoped skill version", async () => {
    const skill = makeSkill({ organization_id: null, team_id: "team-1" });

    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") return chainMock({ data: skill, error: null });
      return chainMock();
    });

    const auth: SkillAuth = {
      userId: "user-2", organizationId: "org-1", orgRole: "member",
      teamIds: [],
    };
    const result = await getSkillVersion(auth, "skill-1", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

// ── 2c: Version insert error handling ──

describe("updateSkill — version error logging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs but does not fail when version insert errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const skill = makeSkill({ user_id: "user-1", organization_id: null });
    const updatedSkill = { ...skill, name: "Updated", current_version: 2, updated_at: "2024-01-02" };

    let skillCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") {
        skillCallCount++;
        if (skillCallCount === 1) return chainMock({ data: skill, error: null });
        return chainMock({ data: updatedSkill, error: null });
      }
      if (table === "skill_versions") {
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

    const auth: SkillAuth = { userId: "user-1", organizationId: "org-1", orgRole: "member" };
    const result = await updateSkill(auth, "skill-1", { name: "Updated" });

    expect(result.ok).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to record skill version:",
      "version insert failed",
    );

    consoleSpy.mockRestore();
  });
});

// ── 2d: Empty update guard ──

describe("updateSkill — empty update guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns current skill without DB update when no fields provided", async () => {
    const skill = makeSkill({ user_id: "user-1", organization_id: null });
    const skillChain = chainMock({ data: skill, error: null });
    mockFrom.mockReturnValue(skillChain);

    const auth: SkillAuth = { userId: "user-1", organizationId: "org-1", orgRole: "member" };
    const result = await updateSkill(auth, "skill-1", {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.currentVersion).toBe(1); // NOT bumped
    }
    // The update method should never have been called
    expect(skillChain.update).not.toHaveBeenCalled();
  });

  it("proceeds with update when name is provided", async () => {
    const skill = makeSkill({ user_id: "user-1", organization_id: null });
    const updatedSkill = { ...skill, name: "Updated", current_version: 2 };

    let skillCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") {
        skillCallCount++;
        if (skillCallCount === 1) return chainMock({ data: skill, error: null });
        return chainMock({ data: updatedSkill, error: null });
      }
      if (table === "skill_versions") return chainMock({ data: null, error: null });
      return chainMock();
    });

    const auth: SkillAuth = { userId: "user-1", organizationId: "org-1", orgRole: "member" };
    const result = await updateSkill(auth, "skill-1", { name: "Updated" });

    expect(result.ok).toBe(true);
  });

  it("proceeds with update when enabled is provided", async () => {
    const skill = makeSkill({ user_id: "user-1", organization_id: null });
    const updatedSkill = { ...skill, enabled: false, current_version: 2 };

    let skillCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "skills") {
        skillCallCount++;
        if (skillCallCount === 1) return chainMock({ data: skill, error: null });
        return chainMock({ data: updatedSkill, error: null });
      }
      if (table === "skill_versions") return chainMock({ data: null, error: null });
      return chainMock();
    });

    const auth: SkillAuth = { userId: "user-1", organizationId: "org-1", orgRole: "member" };
    const result = await updateSkill(auth, "skill-1", { enabled: false });

    expect(result.ok).toBe(true);
  });
});
