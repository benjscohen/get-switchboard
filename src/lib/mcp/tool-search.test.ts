import { describe, it, expect, vi } from "vitest";

// Mock tool-risk so we don't pull in dependencies
vi.mock("./tool-risk", () => ({
  getToolRisk: (name: string) => {
    if (name.includes("delete") || name.includes("trash") || name.includes("send_message")) return "destructive";
    if (name.includes("list") || name.includes("get") || name.includes("search") || name.includes("read")) return "read";
    return "write";
  },
}));

// Mock supabaseAdmin
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

import {
  extractAction,
  extractKeywords,
  buildSearchText,
  buildToolIndex,
  keywordSearch,
  searchTools,
  browseIntegrations,
  cosineSimilarity,
  SEARCH_ENRICHMENTS,
  CATEGORY_MAP,
  type ToolIndexEntry,
  type ToolInput,
} from "./tool-search";

// ── Helpers ──

function makeToolInput(overrides: Partial<ToolInput> = {}): ToolInput {
  return {
    name: "google_calendar_list_events",
    description: "List calendar events",
    integrationId: "google-calendar",
    integrationName: "Google Calendar",
    ...overrides,
  };
}

function buildTestIndex(tools?: ToolInput[]): ToolIndexEntry[] {
  const defaultTools: ToolInput[] = [
    { name: "google_calendar_list_events", description: "List calendar events", integrationId: "google-calendar", integrationName: "Google Calendar" },
    { name: "google_calendar_create_event", description: "Create a new calendar event", integrationId: "google-calendar", integrationName: "Google Calendar" },
    { name: "google_calendar_delete_event", description: "Delete a calendar event", integrationId: "google-calendar", integrationName: "Google Calendar" },
    { name: "google_gmail_send_message", description: "Send an email message", integrationId: "google-gmail", integrationName: "Google Gmail" },
    { name: "google_gmail_list_messages", description: "List email messages", integrationId: "google-gmail", integrationName: "Google Gmail" },
    { name: "google_sheets_read", description: "Read spreadsheet data", integrationId: "google-sheets", integrationName: "Google Sheets" },
    { name: "asana_create_task", description: "Create a new task in Asana", integrationId: "asana", integrationName: "Asana" },
    { name: "asana_search_tasks", description: "Search for tasks in Asana", integrationId: "asana", integrationName: "Asana" },
    { name: "slack_send_message", description: "Send a Slack message", integrationId: "slack", integrationName: "Slack" },
    { name: "submit_feedback", description: "Submit feedback about Switchboard", integrationId: "platform", integrationName: "Platform" },
  ];
  return buildToolIndex(tools ?? defaultTools);
}

function allToolNames(index: ToolIndexEntry[]): Set<string> {
  return new Set(index.map((e) => e.name));
}

// ── Tests ──

describe("extractAction", () => {
  it("extracts action from tool name with integration prefix", () => {
    expect(extractAction("google_calendar_create_event")).toBe("create_event");
    expect(extractAction("google_gmail_send_message")).toBe("send_message");
    expect(extractAction("asana_search_tasks")).toBe("search_tasks");
  });

  it("extracts action from tool name with single prefix", () => {
    expect(extractAction("asana_create_task")).toBe("create_task");
    expect(extractAction("slack_send_message")).toBe("send_message");
  });

  it("handles tool names without known action verbs", () => {
    expect(extractAction("submit_feedback")).toBe("feedback");
  });

  it("handles list action", () => {
    expect(extractAction("google_calendar_list_events")).toBe("list_events");
    expect(extractAction("manage_skills")).toBe("manage_skills");
  });
});

describe("extractKeywords", () => {
  it("tokenizes and lowercases text", () => {
    const keywords = extractKeywords("Create Calendar Event");
    expect(keywords).toContain("create");
    expect(keywords).toContain("calendar");
    expect(keywords).toContain("event");
  });

  it("removes stop words", () => {
    const keywords = extractKeywords("Search for the events in a calendar");
    expect(keywords).not.toContain("for");
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("in");
    expect(keywords).not.toContain("a");
    expect(keywords).toContain("search");
    expect(keywords).toContain("events");
    expect(keywords).toContain("calendar");
  });

  it("removes punctuation", () => {
    const keywords = extractKeywords("User's calendar: events!");
    expect(keywords).toContain("user");
    expect(keywords).toContain("calendar");
    expect(keywords).toContain("events");
  });

  it("filters short words", () => {
    const keywords = extractKeywords("I am a b c test");
    expect(keywords).not.toContain("i");
    expect(keywords).not.toContain("b");
    expect(keywords).not.toContain("c");
    expect(keywords).toContain("am");
    expect(keywords).toContain("test");
  });
});

describe("buildSearchText", () => {
  it("includes enrichments for known tools", () => {
    const text = buildSearchText(
      "google_calendar_create_event",
      "Create a new calendar event",
      "Google Calendar",
      "calendar"
    );

    expect(text).toContain("Tool: google_calendar_create_event");
    expect(text).toContain("Integration: Google Calendar");
    expect(text).toContain("Category: calendar");
    expect(text).toContain("Action: create_event");
    expect(text).toContain("Description: Create a new calendar event");
    expect(text).toContain("schedule meeting");
    expect(text).toContain("book time");
  });

  it("auto-generates use-when and aliases for non-enriched tools", () => {
    const text = buildSearchText(
      "google_sheets_sort_filter",
      "Sort and filter spreadsheet data",
      "Google Sheets",
      "spreadsheets"
    );

    expect(text).toContain("Tool: google_sheets_sort_filter");
    expect(text).toContain("User wants to sort filter using Google Sheets");
    // Auto-generated aliases are space-separated tool name parts
    expect(text).toContain("Also known as: google sheets sort filter");
  });
});

describe("buildToolIndex", () => {
  it("builds index entries with correct fields", () => {
    const tools: ToolInput[] = [
      makeToolInput({ name: "google_calendar_list_events" }),
    ];
    const index = buildToolIndex(tools);

    expect(index).toHaveLength(1);
    expect(index[0].name).toBe("google_calendar_list_events");
    expect(index[0].category).toBe("calendar");
    expect(index[0].action).toBe("list_events");
    expect(index[0].risk).toBe("read");
    expect(index[0].keywords.length).toBeGreaterThan(0);
  });

  it("uses 'other' category for unknown integrations", () => {
    const tools: ToolInput[] = [
      makeToolInput({ integrationId: "unknown-integration" }),
    ];
    const index = buildToolIndex(tools);

    expect(index[0].category).toBe("other");
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe("keywordSearch", () => {
  it("ranks exact name match highest", () => {
    const index = buildTestIndex();
    const results = keywordSearch("google_calendar_list_events", index);

    expect(results.length).toBeGreaterThan(0);
    expect(results.sort((a, b) => b.score - a.score)[0].entry.name).toBe(
      "google_calendar_list_events"
    );
  });

  it("returns relevant results for descriptive query", () => {
    const index = buildTestIndex();
    const results = keywordSearch("send email", index);
    const sorted = results.sort((a, b) => b.score - a.score);

    expect(sorted.length).toBeGreaterThan(0);
    // Gmail send should rank high
    const topNames = sorted.slice(0, 3).map((r) => r.entry.name);
    expect(topNames).toContain("google_gmail_send_message");
  });

  it("returns empty for empty query", () => {
    const index = buildTestIndex();
    expect(keywordSearch("", index)).toEqual([]);
  });

  it("returns empty for all stop words", () => {
    const index = buildTestIndex();
    expect(keywordSearch("the a an", index)).toEqual([]);
  });

  it("returns results for calendar queries", () => {
    const index = buildTestIndex();
    const results = keywordSearch("calendar events", index);
    const names = results.map((r) => r.entry.name);

    expect(names).toContain("google_calendar_list_events");
    expect(names).toContain("google_calendar_create_event");
  });
});

describe("searchTools", () => {
  it("filters to visible tools only", () => {
    const index = buildTestIndex();
    const visible = new Set(["google_calendar_list_events", "asana_create_task"]);
    const results = searchTools("calendar", index, visible);

    for (const r of results) {
      expect(visible.has(r.entry.name)).toBe(true);
    }
  });

  it("applies integration filter", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const results = searchTools("create", index, visible, { integration: "asana" });

    for (const r of results) {
      expect(r.entry.integrationId).toBe("asana");
    }
  });

  it("applies category filter", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const results = searchTools("create", index, visible, { category: "calendar" });

    for (const r of results) {
      expect(r.entry.category).toBe("calendar");
    }
  });

  it("applies action filter", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const results = searchTools("events", index, visible, { action: "list" });

    for (const r of results) {
      expect(r.entry.action.startsWith("list")).toBe(true);
    }
  });

  it("respects limit option", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const results = searchTools("google", index, visible, { limit: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns results sorted by score descending", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const results = searchTools("calendar events", index, visible);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("falls back to keyword search when no embeddings", () => {
    const index = buildTestIndex(); // no embeddings
    const visible = allToolNames(index);
    const results = searchTools("send message slack", index, visible);

    expect(results.length).toBeGreaterThan(0);
    // Should find slack_send_message
    const names = results.map((r) => r.entry.name);
    expect(names).toContain("slack_send_message");
  });
});

describe("browseIntegrations", () => {
  it("groups tools by integration", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const summaries = browseIntegrations(index, visible);

    const calendarSummary = summaries.find((s) => s.id === "google-calendar");
    expect(calendarSummary).toBeDefined();
    expect(calendarSummary!.toolCount).toBe(3);
    expect(calendarSummary!.category).toBe("calendar");
    expect(calendarSummary!.name).toBe("Google Calendar");
  });

  it("only includes visible tools", () => {
    const index = buildTestIndex();
    const visible = new Set(["google_calendar_list_events", "asana_create_task"]);
    const summaries = browseIntegrations(index, visible);

    const calendarSummary = summaries.find((s) => s.id === "google-calendar");
    expect(calendarSummary).toBeDefined();
    expect(calendarSummary!.toolCount).toBe(1);

    const gmailSummary = summaries.find((s) => s.id === "google-gmail");
    expect(gmailSummary).toBeUndefined();
  });

  it("returns summaries sorted alphabetically by name", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const summaries = browseIntegrations(index, visible);

    for (let i = 1; i < summaries.length; i++) {
      expect(summaries[i - 1].name.localeCompare(summaries[i].name)).toBeLessThanOrEqual(0);
    }
  });

  it("includes tool risk in tool entries", () => {
    const index = buildTestIndex();
    const visible = allToolNames(index);
    const summaries = browseIntegrations(index, visible);

    const calendarSummary = summaries.find((s) => s.id === "google-calendar")!;
    const listTool = calendarSummary.tools.find((t) => t.name === "google_calendar_list_events");
    expect(listTool).toBeDefined();
    expect(listTool!.risk).toBe("read");

    const deleteTool = calendarSummary.tools.find((t) => t.name === "google_calendar_delete_event");
    expect(deleteTool).toBeDefined();
    expect(deleteTool!.risk).toBe("destructive");
  });
});

describe("SEARCH_ENRICHMENTS", () => {
  it("has enrichments for key tools", () => {
    const expectedTools = [
      "google_calendar_create_event",
      "google_gmail_send_message",
      "google_docs_create_document",
      "google_drive_search",
      "google_sheets_read",
      "asana_create_task",
      "slack_send_message",
      "submit_feedback",
      "manage_skills",
    ];

    for (const tool of expectedTools) {
      expect(SEARCH_ENRICHMENTS[tool]).toBeDefined();
      expect(SEARCH_ENRICHMENTS[tool].useWhen).toBeTruthy();
      expect(SEARCH_ENRICHMENTS[tool].aliases).toBeTruthy();
    }
  });
});

describe("CATEGORY_MAP", () => {
  it("maps all expected integrations", () => {
    expect(CATEGORY_MAP["google-calendar"]).toBe("calendar");
    expect(CATEGORY_MAP["google-gmail"]).toBe("email");
    expect(CATEGORY_MAP["asana"]).toBe("tasks");
    expect(CATEGORY_MAP["slack"]).toBe("messaging");
    expect(CATEGORY_MAP["firecrawl"]).toBe("web-scraping");
  });
});
