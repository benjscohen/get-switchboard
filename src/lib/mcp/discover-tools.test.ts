import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin so the permissions module can load without env vars
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

// Mock the tool-search module
vi.mock("./tool-search", () => ({
  searchToolsWithEmbeddings: vi.fn(),
  browseIntegrations: vi.fn(),
  buildToolIndex: vi.fn(() => []),
}));

import { registerDiscoverTools } from "./discover-tools";
import { searchToolsWithEmbeddings, browseIntegrations } from "./tool-search";
import type { ToolMeta, RegisteredTool } from "./tool-filtering";
import type { ToolIndexEntry } from "./tool-search";

// ---------- helpers ----------

function createMockServer() {
  const registeredTools: Record<string, { name: string; description: string; schema: Record<string, unknown>; handler: (...args: unknown[]) => unknown }> = {};
  return {
    tool: vi.fn((name: string, description: string, schema: Record<string, unknown>, handler: (...args: unknown[]) => unknown) => {
      registeredTools[name] = { name, description, schema, handler };
    }),
    _registeredTools: registeredTools,
  };
}

function makeRegisteredTools(names: string[]): Record<string, RegisteredTool> {
  const tools: Record<string, RegisteredTool> = {};
  for (const name of names) {
    tools[name] = { enabled: true, description: `${name} desc`, inputSchema: { type: "object" } };
  }
  return tools;
}

function makeToolMeta(entries: Array<[string, ToolMeta]>) {
  return new Map(entries);
}

function makeExtra(overrides: Record<string, unknown> = {}) {
  return {
    authInfo: {
      extra: {
        userId: "user-1",
        connections: [{ integrationId: "google-calendar" }],
        organizationId: "org-1",
        permissionsMode: undefined,
        integrationAccess: undefined,
        integrationOrgKeys: undefined,
        proxyUserKeys: undefined,
        apiKeyScope: "full",
        role: "user",
        orgRole: "member",
        ...overrides,
      },
    },
  };
}

// ---------- tests ----------

describe("registerDiscoverTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a discover_tools tool on the server", () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([]);
    const searchIndex: ToolIndexEntry[] = [];
    const registeredTools = makeRegisteredTools([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerDiscoverTools(server as any, toolMeta, searchIndex, registeredTools);

    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(server.tool.mock.calls[0][0]).toBe("discover_tools");
    expect(toolMeta.get("discover_tools")).toEqual({ integrationId: "platform", orgId: null });
  });

  it("search mode returns formatted results when query is provided", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const searchIndex: ToolIndexEntry[] = [];
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    const mockResults = [
      {
        entry: { name: "google_calendar_list_events", description: "List events", searchText: "", integration: "Google Calendar", integrationId: "google-calendar", category: "calendar", action: "list_events", risk: "read" as const, keywords: [] },
        score: 0.9,
      },
    ];
    vi.mocked(searchToolsWithEmbeddings).mockResolvedValue(mockResults);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerDiscoverTools(server as any, toolMeta, searchIndex, registeredTools);

    const handler = server._registeredTools["discover_tools"].handler;
    const result = await handler(
      { query: "list calendar events", limit: 10 },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse((result as any).content[0].text);
    expect(parsed.mode).toBe("search");
    expect(parsed.query).toBe("list calendar events");
    // Implementation flattens entry fields into top-level result objects
    expect(parsed.results).toEqual([
      {
        score: 0.9,
        name: "google_calendar_list_events",
        description: "List events",
        integration: "Google Calendar",
        integrationId: "google-calendar",
        category: "calendar",
        action: "list_events",
        risk: "read",
      },
    ]);
    expect(parsed.total).toBe(1);
    expect(searchToolsWithEmbeddings).toHaveBeenCalledOnce();
  });

  it("browse mode returns integration summary when no query", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const searchIndex: ToolIndexEntry[] = [];
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    const mockIntegrations = [
      { id: "google-calendar", name: "Google Calendar", category: "calendar", toolCount: 5, tools: [] },
    ];
    vi.mocked(browseIntegrations).mockReturnValue(mockIntegrations);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerDiscoverTools(server as any, toolMeta, searchIndex, registeredTools);

    const handler = server._registeredTools["discover_tools"].handler;
    const result = await handler(
      { limit: 10 },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse((result as any).content[0].text);
    expect(parsed.mode).toBe("browse");
    expect(parsed.integrations).toEqual(mockIntegrations);
    expect(browseIntegrations).toHaveBeenCalledOnce();
  });

  it("applies user filtering — tools not visible to user are excluded from search", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
      ["google_docs_get_document", { integrationId: "google-docs", orgId: null }],
    ]);
    const searchIndex: ToolIndexEntry[] = [];
    const registeredTools = makeRegisteredTools(["google_calendar_list_events", "google_docs_get_document"]);

    vi.mocked(searchToolsWithEmbeddings).mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerDiscoverTools(server as any, toolMeta, searchIndex, registeredTools);

    const handler = server._registeredTools["discover_tools"].handler;
    // User only has google-calendar connection, not google-docs
    await handler(
      { query: "documents", limit: 10 },
      makeExtra({ connections: [{ integrationId: "google-calendar" }] }),
    );

    // Check that searchTools was called with a visibleToolNames set that excludes google_docs
    const visibleNames = vi.mocked(searchToolsWithEmbeddings).mock.calls[0][2] as Set<string>;
    expect(visibleNames.has("google_calendar_list_events")).toBe(true);
    expect(visibleNames.has("google_docs_get_document")).toBe(false);
  });
});
