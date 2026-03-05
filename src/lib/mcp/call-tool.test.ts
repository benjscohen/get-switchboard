import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin so the permissions module can load without env vars
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

import { registerCallTool } from "./call-tool";
import type { ToolMeta, RegisteredTool } from "./tool-filtering";

// ---------- helpers ----------

function createMockServer() {
  const registeredTools: Record<string, {
    name: string;
    description: string;
    schema: Record<string, unknown>;
    handler: (...args: unknown[]) => unknown;
    inputSchema?: unknown;
  }> = {};
  return {
    tool: vi.fn((name: string, description: string, schema: Record<string, unknown>, handler: (...args: unknown[]) => unknown) => {
      registeredTools[name] = { name, description, schema, handler, inputSchema: schema };
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

describe("registerCallTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a call_tool tool with platform meta", () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([]);
    const registeredTools = makeRegisteredTools([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools);

    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(server.tool.mock.calls[0][0]).toBe("call_tool");
    expect(toolMeta.get("call_tool")).toEqual({ integrationId: "platform", orgId: null });
  });

  it("successfully proxies a call to an allowed tool", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    // Register a fake tool handler on the server
    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: { type: "object" },
      handler: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "events list" }],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools);

    const handler = server._registeredTools["call_tool"].handler;
    const extra = makeExtra();
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: { maxResults: 5 } },
      extra,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).content[0].text).toBe("events list");
    expect(server._registeredTools["google_calendar_list_events"].handler).toHaveBeenCalledWith(
      { maxResults: 5 },
      extra,
    );
  });

  it("returns error when tool is not found in allowed set", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_docs_get_document", { integrationId: "google-docs", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_docs_get_document"]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools);

    const handler = server._registeredTools["call_tool"].handler;
    // User only has google-calendar connection, not google-docs
    const result = await handler(
      { tool_name: "google_docs_get_document", arguments: {} },
      makeExtra({ connections: [{ integrationId: "google-calendar" }] }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("not found or you don't have permission");
  });

  it("returns error when tool name does not exist at all", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([]);
    const registeredTools = makeRegisteredTools([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools);

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "nonexistent_tool", arguments: {} },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("not found or you don't have permission");
  });

  it("passes the same extra context through to preserve auth", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    const capturedExtra: unknown[] = [];
    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: { type: "object" },
      handler: vi.fn((_args: unknown, extra: unknown) => {
        capturedExtra.push(extra);
        return Promise.resolve({ content: [{ type: "text", text: "ok" }] });
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools);

    const handler = server._registeredTools["call_tool"].handler;
    const extra = makeExtra({ userId: "specific-user" });
    await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      extra,
    );

    // The exact same extra object should be passed through
    expect(capturedExtra[0]).toBe(extra);
  });
});
