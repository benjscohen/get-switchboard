import { describe, it, expect, vi } from "vitest";

// Mock supabaseAdmin so the permissions module can load without env vars
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

import {
  filterToolsForUser,
  type RegisteredTool,
  type ToolMeta,
  type FilterContext,
} from "./tool-filtering";

// ---------- helpers ----------

function makeTool(overrides: Partial<RegisteredTool> = {}): RegisteredTool {
  return {
    enabled: true,
    description: "A test tool",
    inputSchema: { type: "object", properties: {} },
    ...overrides,
  };
}

function buildRegisteredTools(
  entries: Array<[string, Partial<RegisteredTool>]>
): Record<string, RegisteredTool> {
  const result: Record<string, RegisteredTool> = {};
  for (const [name, overrides] of entries) {
    result[name] = makeTool(overrides);
  }
  return result;
}

// ---------- fixtures ----------

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";

// Builtin tools
const builtinTools: Array<[string, Partial<RegisteredTool>]> = [
  ["google_calendar_list_events", { description: "List calendar events" }],
  ["google_calendar_create_event", { description: "Create calendar event" }],
  ["google_sheets_read_range", { description: "Read a spreadsheet range" }],
  ["google_docs_get_document", { description: "Get a document" }],
];

const builtinMeta: Array<[string, ToolMeta]> = [
  ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
  ["google_calendar_create_event", { integrationId: "google-calendar", orgId: null }],
  ["google_sheets_read_range", { integrationId: "google-sheets", orgId: null }],
  ["google_docs_get_document", { integrationId: "google-docs", orgId: null }],
];

// Custom tools
const customTools: Array<[string, Partial<RegisteredTool>]> = [
  ["acme__search", { description: "[Acme] Search" }],
  ["acme__query", { description: "[Acme] Query" }],
  ["globalbot__ask", { description: "[GlobalBot] Ask" }],
];

const customMeta: Array<[string, ToolMeta]> = [
  ["acme__search", { integrationId: "custom:srv-acme", orgId: ORG_A }],
  ["acme__query", { integrationId: "custom:srv-acme", orgId: ORG_A }],
  ["globalbot__ask", { integrationId: "custom:srv-global", orgId: null }],
];

function allTools() {
  return buildRegisteredTools([...builtinTools, ...customTools]);
}

function allMeta() {
  return new Map<string, ToolMeta>([...builtinMeta, ...customMeta]);
}

function toolNames(result: Array<{ name: string }>) {
  return result.map((t) => t.name).sort();
}

// ---------- tests ----------

describe("filterToolsForUser", () => {
  describe("builtin tools — connection filtering", () => {
    it("returns only tools for connected integrations", () => {
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
        organizationId: ORG_A,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(toolNames(result)).toEqual([
        "acme__query",
        "acme__search",
        "globalbot__ask",
        "google_calendar_create_event",
        "google_calendar_list_events",
      ]);
    });

    it("excludes all builtin tools when user has no connections", () => {
      const ctx: FilterContext = {
        connections: [],
        organizationId: ORG_A,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      // Only custom tools visible (org-matched + global)
      expect(toolNames(result)).toEqual([
        "acme__query",
        "acme__search",
        "globalbot__ask",
      ]);
    });

    it("shows tools for multiple connected integrations", () => {
      const ctx: FilterContext = {
        connections: [
          { integrationId: "google-calendar" },
          { integrationId: "google-sheets" },
        ],
        organizationId: ORG_A,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);
      const names = toolNames(result);

      expect(names).toContain("google_calendar_list_events");
      expect(names).toContain("google_sheets_read_range");
      expect(names).not.toContain("google_docs_get_document");
    });

    it("returns no builtin tools when connections is undefined", () => {
      const ctx: FilterContext = {
        connections: undefined,
        organizationId: ORG_A,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      for (const t of result) {
        expect(t.name).not.toMatch(/^google_/);
      }
    });
  });

  describe("custom tools — org filtering", () => {
    it("shows org-scoped custom tools only to matching org", () => {
      const ctx: FilterContext = {
        connections: [],
        organizationId: ORG_A,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(toolNames(result)).toContain("acme__search");
      expect(toolNames(result)).toContain("acme__query");
    });

    it("hides org-scoped custom tools from a different org", () => {
      const ctx: FilterContext = {
        connections: [],
        organizationId: ORG_B,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(toolNames(result)).not.toContain("acme__search");
      expect(toolNames(result)).not.toContain("acme__query");
    });

    it("always shows global custom tools (orgId=null)", () => {
      const ctx: FilterContext = {
        connections: [],
        organizationId: ORG_B,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(toolNames(result)).toContain("globalbot__ask");
    });

    it("shows global custom tools even when organizationId is undefined", () => {
      const ctx: FilterContext = {
        connections: [],
        organizationId: undefined,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(toolNames(result)).toContain("globalbot__ask");
      expect(toolNames(result)).not.toContain("acme__search");
    });
  });

  describe("permissions filtering", () => {
    it("full mode — all connected/org-matched tools are visible", () => {
      const ctx: FilterContext = {
        connections: [
          { integrationId: "google-calendar" },
          { integrationId: "google-sheets" },
        ],
        organizationId: ORG_A,
        permissionsMode: "full",
        integrationAccess: [], // empty — but full mode ignores this
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(toolNames(result)).toEqual([
        "acme__query",
        "acme__search",
        "globalbot__ask",
        "google_calendar_create_event",
        "google_calendar_list_events",
        "google_sheets_read_range",
      ]);
    });

    it("custom mode — only allows tools for whitelisted integrations", () => {
      const ctx: FilterContext = {
        connections: [
          { integrationId: "google-calendar" },
          { integrationId: "google-sheets" },
        ],
        organizationId: ORG_A,
        permissionsMode: "custom",
        integrationAccess: [
          { integrationId: "google-calendar", allowedTools: [] }, // all calendar tools
        ],
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);
      const names = toolNames(result);

      // Calendar tools allowed (allowedTools empty = all)
      expect(names).toContain("google_calendar_list_events");
      expect(names).toContain("google_calendar_create_event");

      // Sheets connected but not in integrationAccess
      expect(names).not.toContain("google_sheets_read_range");

      // Custom tools not in integrationAccess
      expect(names).not.toContain("acme__search");
      expect(names).not.toContain("globalbot__ask");
    });

    it("custom mode — restricts to specific allowed tools", () => {
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
        organizationId: ORG_A,
        permissionsMode: "custom",
        integrationAccess: [
          {
            integrationId: "google-calendar",
            allowedTools: ["google_calendar_list_events"],
          },
        ],
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);
      const names = toolNames(result);

      expect(names).toContain("google_calendar_list_events");
      expect(names).not.toContain("google_calendar_create_event");
    });

    it("custom mode — allows custom MCP tools when whitelisted", () => {
      const ctx: FilterContext = {
        connections: [],
        organizationId: ORG_A,
        permissionsMode: "custom",
        integrationAccess: [
          { integrationId: "custom:srv-acme", allowedTools: ["acme__search"] },
          { integrationId: "custom:srv-global", allowedTools: [] },
        ],
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);
      const names = toolNames(result);

      expect(names).toContain("acme__search");
      expect(names).not.toContain("acme__query"); // not in allowedTools
      expect(names).toContain("globalbot__ask"); // allowedTools empty = all
    });

    it("skips permissions check when permissionsMode is undefined", () => {
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
        organizationId: ORG_A,
        permissionsMode: undefined,
        integrationAccess: undefined,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      // All calendar + org-A custom + global custom should appear
      expect(toolNames(result)).toEqual([
        "acme__query",
        "acme__search",
        "globalbot__ask",
        "google_calendar_create_event",
        "google_calendar_list_events",
      ]);
    });
  });

  describe("disabled and unknown tools", () => {
    it("excludes disabled tools", () => {
      const tools = buildRegisteredTools([
        ["google_calendar_list_events", { enabled: true }],
        ["google_calendar_create_event", { enabled: false }],
      ]);
      const meta = new Map<string, ToolMeta>([
        ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
        ["google_calendar_create_event", { integrationId: "google-calendar", orgId: null }],
      ]);
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
      };
      const result = filterToolsForUser(tools, meta, ctx);

      expect(toolNames(result)).toEqual(["google_calendar_list_events"]);
    });

    it("excludes tools with no metadata entry", () => {
      const tools = buildRegisteredTools([
        ["google_calendar_list_events", {}],
        ["mystery_tool", {}],
      ]);
      const meta = new Map<string, ToolMeta>([
        ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
        // mystery_tool has no meta entry
      ]);
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
      };
      const result = filterToolsForUser(tools, meta, ctx);

      expect(toolNames(result)).toEqual(["google_calendar_list_events"]);
    });
  });

  describe("output shape", () => {
    it("returns correct tool shape with description and inputSchema", () => {
      const tools = buildRegisteredTools([
        [
          "google_calendar_list_events",
          {
            description: "List events",
            inputSchema: { type: "object", properties: { query: { type: "string" } } },
            annotations: { readOnly: true },
          },
        ],
      ]);
      const meta = new Map<string, ToolMeta>([
        ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
      ]);
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
      };
      const result = filterToolsForUser(tools, meta, ctx);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "google_calendar_list_events",
        description: "List events",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
        annotations: { readOnly: true },
      });
    });

    it("defaults inputSchema to { type: 'object' } when undefined", () => {
      const tools = buildRegisteredTools([
        ["google_calendar_list_events", { inputSchema: undefined }],
      ]);
      const meta = new Map<string, ToolMeta>([
        ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
      ]);
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
      };
      const result = filterToolsForUser(tools, meta, ctx);

      expect(result[0].inputSchema).toEqual({ type: "object" });
    });
  });

  describe("platform tools", () => {
    const platformTools: Array<[string, Partial<RegisteredTool>]> = [
      ["list_skills", { description: "List skills" }],
      ["submit_feedback", { description: "Submit feedback" }],
    ];

    const platformMeta: Array<[string, ToolMeta]> = [
      ["list_skills", { integrationId: "platform", orgId: null }],
      ["submit_feedback", { integrationId: "platform", orgId: null }],
    ];

    function allToolsWithPlatform() {
      return buildRegisteredTools([...builtinTools, ...customTools, ...platformTools]);
    }

    function allMetaWithPlatform() {
      return new Map<string, ToolMeta>([...builtinMeta, ...customMeta, ...platformMeta]);
    }

    it("platform tools always appear regardless of connections", () => {
      const ctx: FilterContext = {
        connections: [],
        organizationId: ORG_A,
      };
      const result = filterToolsForUser(allToolsWithPlatform(), allMetaWithPlatform(), ctx);
      const names = toolNames(result);

      expect(names).toContain("list_skills");
      expect(names).toContain("submit_feedback");
    });

    it("platform tools appear even with empty context", () => {
      const ctx: FilterContext = {};
      const result = filterToolsForUser(allToolsWithPlatform(), allMetaWithPlatform(), ctx);
      const names = toolNames(result);

      expect(names).toContain("list_skills");
      expect(names).toContain("submit_feedback");
    });

    it("platform tools are excluded when disabled", () => {
      const tools = buildRegisteredTools([
        ["list_skills", { enabled: false }],
        ["submit_feedback", { enabled: true }],
      ]);
      const meta = new Map<string, ToolMeta>([...platformMeta]);
      const ctx: FilterContext = {};
      const result = filterToolsForUser(tools, meta, ctx);
      const names = toolNames(result);

      expect(names).not.toContain("list_skills");
      expect(names).toContain("submit_feedback");
    });

    it("platform tools are visible across different orgs", () => {
      for (const orgId of [ORG_A, ORG_B, undefined]) {
        const ctx: FilterContext = {
          connections: [],
          organizationId: orgId,
        };
        const result = filterToolsForUser(allToolsWithPlatform(), allMetaWithPlatform(), ctx);
        const names = toolNames(result);

        expect(names).toContain("list_skills");
        expect(names).toContain("submit_feedback");
      }
    });
  });

  describe("discovery mode", () => {
    const discoveryTools: Array<[string, Partial<RegisteredTool>]> = [
      ...builtinTools,
      ...customTools,
      ["discover_tools", { description: "Discover tools" }],
      ["submit_feedback", { description: "Submit feedback" }],
      ["list_skills", { description: "List skills" }],
      ["get_skill", { description: "Get skill" }],
      ["create_skill", { description: "Create skill" }],
      ["update_skill", { description: "Update skill" }],
      ["delete_skill", { description: "Delete skill" }],
    ];

    const discoveryMeta: Array<[string, ToolMeta]> = [
      ...builtinMeta,
      ...customMeta,
      ["discover_tools", { integrationId: "platform", orgId: null }],
      ["submit_feedback", { integrationId: "platform", orgId: null }],
      ["list_skills", { integrationId: "platform", orgId: null }],
      ["get_skill", { integrationId: "platform", orgId: null }],
      ["create_skill", { integrationId: "platform", orgId: null }],
      ["update_skill", { integrationId: "platform", orgId: null }],
      ["delete_skill", { integrationId: "platform", orgId: null }],
    ];

    it("returns only discovery-visible tools when discoveryMode is true", () => {
      const ctx: FilterContext = {
        connections: [
          { integrationId: "google-calendar" },
          { integrationId: "google-sheets" },
          { integrationId: "google-docs" },
        ],
        organizationId: ORG_A,
        discoveryMode: true,
      };
      const result = filterToolsForUser(
        buildRegisteredTools(discoveryTools),
        new Map(discoveryMeta),
        ctx,
      );
      const names = toolNames(result);

      expect(names).toEqual([
        "create_skill",
        "delete_skill",
        "discover_tools",
        "get_skill",
        "list_skills",
        "submit_feedback",
        "update_skill",
      ]);
    });

    it("excludes builtin and custom tools in discovery mode", () => {
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
        organizationId: ORG_A,
        discoveryMode: true,
      };
      const result = filterToolsForUser(
        buildRegisteredTools(discoveryTools),
        new Map(discoveryMeta),
        ctx,
      );
      const names = toolNames(result);

      expect(names).not.toContain("google_calendar_list_events");
      expect(names).not.toContain("acme__search");
      expect(names).not.toContain("globalbot__ask");
    });

    it("normal mode still works when discoveryMode is false", () => {
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-calendar" }],
        organizationId: ORG_A,
        discoveryMode: false,
      };
      const result = filterToolsForUser(
        buildRegisteredTools(discoveryTools),
        new Map(discoveryMeta),
        ctx,
      );
      const names = toolNames(result);

      expect(names).toContain("google_calendar_list_events");
      expect(names).toContain("discover_tools");
      expect(names).toContain("submit_feedback");
    });
  });

  describe("combined filtering scenarios", () => {
    it("user with one connection in a non-matching org sees only global custom tools + connected builtin", () => {
      const ctx: FilterContext = {
        connections: [{ integrationId: "google-docs" }],
        organizationId: ORG_B,
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(toolNames(result)).toEqual([
        "globalbot__ask",
        "google_docs_get_document",
      ]);
    });

    it("user with all connections in matching org and full permissions sees everything", () => {
      const ctx: FilterContext = {
        connections: [
          { integrationId: "google-calendar" },
          { integrationId: "google-sheets" },
          { integrationId: "google-docs" },
        ],
        organizationId: ORG_A,
        permissionsMode: "full",
        integrationAccess: [],
      };
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      expect(result).toHaveLength(7); // 4 builtin + 3 custom
    });

    it("empty context returns nothing", () => {
      const ctx: FilterContext = {};
      const result = filterToolsForUser(allTools(), allMeta(), ctx);

      // Only global custom tools (no connections = no builtins, no org = no org-scoped custom)
      expect(toolNames(result)).toEqual(["globalbot__ask"]);
    });
  });
});
