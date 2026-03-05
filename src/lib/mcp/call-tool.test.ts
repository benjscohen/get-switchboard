import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin so the permissions module can load without env vars
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

import { z } from "zod";
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
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

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
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

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
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

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
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

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
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

    const handler = server._registeredTools["call_tool"].handler;
    const extra = makeExtra({ userId: "specific-user" });
    await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      extra,
    );

    // The exact same extra object should be passed through
    expect(capturedExtra[0]).toBe(extra);
  });

  it("returns error with expectedSchema when handler throws", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: { type: "object" },
      handler: vi.fn().mockRejectedValue(new Error("Invalid arguments: missing required field 'calendarId'")),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toContain("missing required field");
    expect(parsed.expectedSchema).toEqual({ type: "object" });
  });

  it("returns validation error with expectedSchema when args fail Zod schema", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    const zodSchema = z.object({ calendarId: z.string() });
    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: zodSchema,
      handler: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "should not reach" }],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toContain("Invalid arguments for tool google_calendar_list_events");
    expect(parsed.error).toContain("calendarId");
    expect(parsed.expectedSchema).toEqual({ type: "object" });
    // Handler should NOT have been called
    expect(server._registeredTools["google_calendar_list_events"].handler).not.toHaveBeenCalled();
  });

  it("returns clean JSON Schema in expectedSchema when tool has a Zod schema", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["my_tool", { integrationId: "google-calendar", orgId: null }],
    ]);

    const zodSchema = z.object({ name: z.string(), count: z.number().optional() });
    // Use the Zod schema as inputSchema in registeredTools so zodToJsonSchema converts it
    const registeredTools: Record<string, RegisteredTool> = {
      my_tool: { enabled: true, description: "My tool", inputSchema: zodSchema as unknown },
    };

    server._registeredTools["my_tool"] = {
      name: "my_tool",
      description: "My tool",
      schema: {},
      inputSchema: zodSchema,
      handler: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "should not reach" }],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "my_tool", arguments: { count: "not-a-number" } },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    // Error should be human-readable, not raw JSON
    expect(parsed.error).toContain("name");
    expect(parsed.error.startsWith("[")).toBe(false);
    // expectedSchema should be clean JSON Schema, not Zod internals
    expect(parsed.expectedSchema.type).toBe("object");
    expect(parsed.expectedSchema.properties).toBeDefined();
    expect(parsed.expectedSchema.properties.name).toEqual({ type: "string" });
    expect(parsed.expectedSchema.properties.count).toEqual({ type: "number" });
    expect(parsed.expectedSchema.required).toEqual(["name"]);
  });

  it("passes validation and calls handler when args match Zod schema", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    const zodSchema = z.object({ calendarId: z.string() });
    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: zodSchema,
      handler: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "events list" }],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: { calendarId: "primary" } },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toBe("events list");
  });

  it("prefixes successful response with integration name when in map", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: { type: "object" },
      handler: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"events": []}' }],
      }),
    };

    const integrationNames = new Map([["google_calendar_list_events", "Google Calendar"]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, integrationNames);

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.content[0].text).toBe('[Google Calendar] {"events": []}');
  });

  it("does not prefix when tool name is not in integration map", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: { type: "object" },
      handler: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "raw output" }],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, new Map());

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.content[0].text).toBe("raw output");
  });

  it("does not prefix error responses", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: { type: "object" },
      handler: vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "something went wrong" }],
      }),
    };

    const integrationNames = new Map([["google_calendar_list_events", "Google Calendar"]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, integrationNames);

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      makeExtra(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any;
    expect(res.content[0].text).toBe("something went wrong");
  });

  it("handles responses with no content array safely", async () => {
    const server = createMockServer();
    const toolMeta = makeToolMeta([
      ["google_calendar_list_events", { integrationId: "google-calendar", orgId: null }],
    ]);
    const registeredTools = makeRegisteredTools(["google_calendar_list_events"]);

    server._registeredTools["google_calendar_list_events"] = {
      name: "google_calendar_list_events",
      description: "List events",
      schema: {},
      inputSchema: { type: "object" },
      handler: vi.fn().mockResolvedValue({}),
    };

    const integrationNames = new Map([["google_calendar_list_events", "Google Calendar"]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCallTool(server as any, toolMeta, registeredTools, integrationNames);

    const handler = server._registeredTools["call_tool"].handler;
    const result = await handler(
      { tool_name: "google_calendar_list_events", arguments: {} },
      makeExtra(),
    );

    // Should return as-is without crashing
    expect(result).toEqual({});
  });
});
