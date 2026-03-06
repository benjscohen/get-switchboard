import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/usage-log", () => ({ logUsage: vi.fn() }));
vi.mock("@/lib/skills/service", () => ({
  listSkills: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  listSkillVersions: vi.fn(),
  getSkillVersion: vi.fn(),
  rollbackSkill: vi.fn(),
}));

import { registerSkillTools } from "./skill-tools";
import {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  listSkillVersions,
  getSkillVersion,
  rollbackSkill,
} from "@/lib/skills/service";
import type { ToolMeta } from "./tool-filtering";
import type { SkillRecord } from "./skill-filtering";

// ---------- helpers ----------

function createMockServer() {
  const registeredTools: Record<string, { handler: (...args: unknown[]) => unknown }> = {};
  const registeredPrompts: Record<string, { description?: string; argsSchema?: unknown }> = {};
  let listPromptsHandler: ((...args: unknown[]) => unknown) | null = null;
  return {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) => {
      registeredTools[name] = { handler };
    }),
    prompt: vi.fn((name: string, description: string, ...rest: unknown[]) => {
      registeredPrompts[name] = { description };
    }),
    server: {
      setRequestHandler: vi.fn((_schema: unknown, handler: (...args: unknown[]) => unknown) => {
        listPromptsHandler = handler;
      }),
    },
    _registeredTools: registeredTools,
    _registeredPrompts: registeredPrompts,
    _listPromptsHandler: () => listPromptsHandler,
  };
}

function makeExtra(overrides: Record<string, unknown> = {}) {
  return {
    authInfo: {
      extra: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "member",
        teamIds: ["team-1"],
        ...overrides,
      },
    },
  };
}

function makeSkills(): SkillRecord[] {
  return [
    {
      id: "s1",
      name: "Code Review",
      slug: "code-review",
      description: "Review code",
      content: "Review this code: {{code}}",
      arguments: [{ name: "code", description: "Code to review", required: true }],
      organization_id: "org-1",
      team_id: null,
      user_id: null,
      enabled: true,
    },
    {
      id: "s2",
      name: "Summarize",
      slug: "summarize",
      description: "Summarize text",
      content: "Summarize this",
      arguments: [],
      organization_id: null,
      team_id: null,
      user_id: "user-1",
      enabled: true,
    },
  ];
}

// ---------- tests ----------

describe("registerSkillTools", () => {
  let server: ReturnType<typeof createMockServer>;
  let toolMeta: Map<string, ToolMeta>;
  let skills: SkillRecord[];

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    toolMeta = new Map();
    skills = makeSkills();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSkillTools(server as any, toolMeta, skills);
  });

  it("registers manage_skills tool on server", () => {
    expect(server.tool).toHaveBeenCalledWith(
      "manage_skills",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
    expect(server._registeredTools["manage_skills"]).toBeDefined();
  });

  it("registers skill prompts for each skill", () => {
    expect(server.prompt).toHaveBeenCalledTimes(2);
    expect(server._registeredPrompts["org:code-review"]).toBeDefined();
    expect(server._registeredPrompts["user:summarize"]).toBeDefined();
  });

  it("sets toolMeta for manage_skills as platform", () => {
    expect(toolMeta.get("manage_skills")).toEqual({ integrationId: "platform", orgId: null });
  });

  it("sets up a prompts/list handler override", () => {
    expect(server.server.setRequestHandler).toHaveBeenCalledOnce();
  });

  describe("manage_skills handler", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function callHandler(args: Record<string, unknown>, extra: any = makeExtra()) {
      const handler = server._registeredTools["manage_skills"].handler;
      return handler(args, extra) as Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
    }

    describe("list", () => {
      it("returns empty array when auth is null", async () => {
        const result = await callHandler({ operation: "list" }, {});
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toEqual([]);
      });

      it("returns formatted skill list when authenticated", async () => {
        vi.mocked(listSkills).mockResolvedValue({
          ok: true,
          data: {
            organization: [{
              id: "s1", name: "Code Review", slug: "code-review",
              description: "Review code", content: "...", arguments: [{ name: "code", description: "", required: true }],
              scope: "organization", organizationId: "org-1", teamId: null, userId: null,
              enabled: true, currentVersion: 1, createdBy: "u1", createdAt: "", updatedAt: "",
            }],
            team: [],
            user: [],
          },
        });

        const result = await callHandler({ operation: "list" }, makeExtra());
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toEqual({
          id: "s1",
          name: "org:code-review",
          description: "Review code",
          argumentCount: 1,
        });
      });

      it("returns error when listSkills fails", async () => {
        vi.mocked(listSkills).mockResolvedValue({
          ok: false, error: "DB error", status: 500,
        });

        const result = await callHandler({ operation: "list" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("DB error");
      });
    });

    describe("get", () => {
      it("returns error when name missing", async () => {
        const result = await callHandler({ operation: "get" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("name");
      });

      it("returns error when unauthorized", async () => {
        const result = await callHandler({ operation: "get", name: "org:test" }, {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Unauthorized");
      });

      it("returns skill content when found", async () => {
        vi.mocked(listSkills).mockResolvedValue({
          ok: true,
          data: {
            organization: [{
              id: "s1", name: "Code Review", slug: "code-review",
              description: "Review code", content: "Review this code please",
              arguments: [], scope: "organization", organizationId: "org-1",
              teamId: null, userId: null, enabled: true, currentVersion: 1,
              createdBy: "u1", createdAt: "", updatedAt: "",
            }],
            team: [],
            user: [],
          },
        });

        const result = await callHandler({ operation: "get", name: "org:code-review" }, makeExtra());
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe("Review this code please");
      });

      it("returns error when skill not found", async () => {
        vi.mocked(listSkills).mockResolvedValue({
          ok: true,
          data: { organization: [], team: [], user: [] },
        });

        const result = await callHandler({ operation: "get", name: "org:nonexistent" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("not found");
      });
    });

    describe("create", () => {
      it("returns error when unauthorized", async () => {
        const result = await callHandler({
          operation: "create", scope: "user", name: "test", content: "hello",
        }, {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Unauthorized");
      });

      it("returns error when missing required fields", async () => {
        const result = await callHandler({ operation: "create", name: "test" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("scope, name, content");
      });

      it("calls createSkill and returns result", async () => {
        vi.mocked(createSkill).mockResolvedValue({
          ok: true,
          data: {
            id: "new-1", name: "Test", slug: "test", description: null,
            content: "hello", arguments: [], scope: "user", organizationId: null,
            teamId: null, userId: "user-1", enabled: true, currentVersion: 1,
            createdBy: "user-1", createdAt: "", updatedAt: "",
          },
          status: 201,
        });

        const result = await callHandler({
          operation: "create", scope: "user", name: "Test", content: "hello",
        }, makeExtra());

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('"id": "new-1"');
        expect(result.content[0].text).toContain("Note: This skill will be available as an MCP prompt after server restart.");
        expect(createSkill).toHaveBeenCalledWith(
          expect.objectContaining({ userId: "user-1", organizationId: "org-1" }),
          expect.objectContaining({ scope: "user", name: "Test", content: "hello" }),
        );
      });

      it("returns error when createSkill fails", async () => {
        vi.mocked(createSkill).mockResolvedValue({
          ok: false, error: "Duplicate slug", status: 409,
        });

        const result = await callHandler({
          operation: "create", scope: "user", name: "Test", content: "hello",
        }, makeExtra());

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Duplicate slug");
      });
    });

    describe("update", () => {
      it("returns error when unauthorized", async () => {
        const result = await callHandler({ operation: "update", id: "s1" }, {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Unauthorized");
      });

      it("returns error when id missing", async () => {
        const result = await callHandler({ operation: "update" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("id");
      });

      it("calls updateSkill and returns result", async () => {
        vi.mocked(updateSkill).mockResolvedValue({
          ok: true,
          data: {
            id: "s1", name: "Updated", slug: "updated", description: null,
            content: "new content", arguments: [], scope: "user", organizationId: null,
            teamId: null, userId: "user-1", enabled: true, currentVersion: 2,
            createdBy: "user-1", createdAt: "", updatedAt: "",
          },
        });

        const result = await callHandler({
          operation: "update", id: "s1", content: "new content",
        }, makeExtra());

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('"id": "s1"');
        expect(result.content[0].text).toContain("Note: MCP prompt changes take effect after server restart.");
        expect(updateSkill).toHaveBeenCalledWith(
          expect.objectContaining({ userId: "user-1" }),
          "s1",
          expect.objectContaining({ content: "new content" }),
        );
      });
    });

    describe("delete", () => {
      it("returns error when unauthorized", async () => {
        const result = await callHandler({ operation: "delete", id: "s1" }, {});
        expect(result.isError).toBe(true);
      });

      it("returns error when id missing", async () => {
        const result = await callHandler({ operation: "delete" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("id");
      });

      it("calls deleteSkillService and returns result", async () => {
        vi.mocked(deleteSkill).mockResolvedValue({
          ok: true, data: { ok: true },
        });

        const result = await callHandler({ operation: "delete", id: "s1" }, makeExtra());
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe("Skill deleted successfully.");
        expect(deleteSkill).toHaveBeenCalledWith(
          expect.objectContaining({ userId: "user-1" }),
          "s1",
        );
      });
    });

    describe("history", () => {
      it("returns error when unauthorized", async () => {
        const result = await callHandler({ operation: "history", id: "s1" }, {});
        expect(result.isError).toBe(true);
      });

      it("returns error when id missing", async () => {
        const result = await callHandler({ operation: "history" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("id");
      });

      it("calls listSkillVersions and returns result", async () => {
        const versions = [{ id: "v1", skillId: "s1", version: 2, name: "Test", changeType: "updated" }];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(listSkillVersions).mockResolvedValue({ ok: true, data: versions } as any);

        const result = await callHandler({ operation: "history", id: "s1" }, makeExtra());
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toEqual(versions);
        expect(listSkillVersions).toHaveBeenCalledWith(
          expect.objectContaining({ userId: "user-1" }),
          "s1",
        );
      });
    });

    describe("version", () => {
      it("returns error when unauthorized", async () => {
        const result = await callHandler({ operation: "version", id: "s1", version: 1 }, {});
        expect(result.isError).toBe(true);
      });

      it("returns error when id or version missing", async () => {
        const result1 = await callHandler({ operation: "version" }, makeExtra());
        expect(result1.isError).toBe(true);
        expect(result1.content[0].text).toContain("id, version");

        const result2 = await callHandler({ operation: "version", id: "s1" }, makeExtra());
        expect(result2.isError).toBe(true);
        expect(result2.content[0].text).toContain("id, version");
      });

      it("calls getSkillVersion and returns result", async () => {
        const versionData = { id: "v1", skillId: "s1", version: 1, name: "Test", content: "hello" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(getSkillVersion).mockResolvedValue({ ok: true, data: versionData } as any);

        const result = await callHandler({ operation: "version", id: "s1", version: 1 }, makeExtra());
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toEqual(versionData);
      });
    });

    describe("rollback", () => {
      it("returns error when unauthorized", async () => {
        const result = await callHandler({ operation: "rollback", id: "s1", version: 1 }, {});
        expect(result.isError).toBe(true);
      });

      it("returns error when id or version missing", async () => {
        const result = await callHandler({ operation: "rollback" }, makeExtra());
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("id, version");
      });

      it("calls rollbackSkill and returns result", async () => {
        vi.mocked(rollbackSkill).mockResolvedValue({
          ok: true,
          data: {
            id: "s1", name: "Test", slug: "test", description: null,
            content: "old content", arguments: [], scope: "user", organizationId: null,
            teamId: null, userId: "user-1", enabled: true, currentVersion: 3,
            createdBy: "user-1", createdAt: "", updatedAt: "",
          },
        });

        const result = await callHandler({ operation: "rollback", id: "s1", version: 1 }, makeExtra());
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('"id": "s1"');
        expect(result.content[0].text).toContain("Rollback applied.");
        expect(rollbackSkill).toHaveBeenCalledWith(
          expect.objectContaining({ userId: "user-1" }),
          "s1",
          1,
        );
      });
    });
  });

  describe("prompts/list handler", () => {
    it("filters prompts based on user context", () => {
      const handler = server._listPromptsHandler();
      expect(handler).not.toBeNull();

      // User in org-1 should see the org skill
      const result = handler!({}, makeExtra()) as { prompts: Array<{ name: string }> };
      const names = result.prompts.map((p) => p.name);
      expect(names).toContain("org:code-review");
      expect(names).toContain("user:summarize");
    });

    it("filters out skills not visible to user", () => {
      const handler = server._listPromptsHandler();

      // Different org, different user => sees nothing
      const result = handler!({}, makeExtra({
        userId: "other-user",
        organizationId: "other-org",
        teamIds: [],
      })) as { prompts: Array<{ name: string }> };

      expect(result.prompts).toHaveLength(0);
    });
  });
});
