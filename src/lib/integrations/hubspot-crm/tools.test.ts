import { vi, describe, it, expect, beforeEach } from "vitest";
import { HUBSPOT_CRM_TOOLS, type HubSpotCrmClient } from "./tools";

// ── Helpers ──

const client: HubSpotCrmClient = {
  accessToken: "test-token",
  baseUrl: "https://api.hubapi.com",
};

function findTool(name: string) {
  const tool = HUBSPOT_CRM_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

/** Set up fetch mock returning the given body (or empty for 204) */
function mockFetch(status = 200, body: unknown = { ok: true }) {
  const mock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Extract the URL path + query from the first fetch call */
function fetchUrl(mock: ReturnType<typeof vi.fn>): string {
  const url = mock.mock.calls[0][0] as string;
  return url.replace(client.baseUrl, "");
}

/** Extract the parsed body from the first fetch call */
function fetchBody(mock: ReturnType<typeof vi.fn>): unknown {
  const init = mock.mock.calls[0][1] as RequestInit | undefined;
  return init?.body ? JSON.parse(init.body as string) : undefined;
}

/** Extract the HTTP method from the first fetch call */
function fetchMethod(mock: ReturnType<typeof vi.fn>): string {
  const init = mock.mock.calls[0][1] as RequestInit | undefined;
  return init?.method ?? "GET";
}

/** Extract URL + method + body for the Nth fetch call (0-indexed) */
function fetchCall(mock: ReturnType<typeof vi.fn>, n: number) {
  const url = (mock.mock.calls[n][0] as string).replace(client.baseUrl, "");
  const init = mock.mock.calls[n][1] as RequestInit | undefined;
  return {
    url,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════
// Bug 1 fix: Sequences — v3 → v4 + userId
// ══════════════════════════════════════════════════

describe("hubspot_crm_manage_sequences (Bug 1: v3 → v4)", () => {
  const tool = findTool("hubspot_crm_manage_sequences");

  it("list uses /automation/v4/ with userId query param", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "list", user_id: "u123", limit: 10 },
      client
    );
    expect(fetchUrl(mock)).toBe(
      "/automation/v4/sequences?limit=10&userId=u123"
    );
    expect(fetchMethod(mock)).toBe("GET");
  });

  it("get uses /automation/v4/ with userId query param", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "get", sequence_id: "seq1", user_id: "u123" },
      client
    );
    expect(fetchUrl(mock)).toBe(
      "/automation/v4/sequences/seq1?userId=u123"
    );
  });

  it("enroll posts to /automation/v4/sequences/enrollments/", async () => {
    const mock = mockFetch();
    await tool.execute(
      {
        operation: "enroll",
        sequence_id: "seq1",
        contact_id: "c1",
        sender_email: "user@example.com",
      },
      client
    );
    expect(fetchUrl(mock)).toBe("/automation/v4/sequences/enrollments/");
    expect(fetchMethod(mock)).toBe("POST");
    expect(fetchBody(mock)).toEqual({
      sequenceId: "seq1",
      contactId: "c1",
      senderEmail: "user@example.com",
    });
  });

  it("enroll omits undefined fields via pickDefined", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "enroll", sequence_id: "seq1", contact_id: "c1" },
      client
    );
    const body = fetchBody(mock) as Record<string, unknown>;
    expect(body).toEqual({ sequenceId: "seq1", contactId: "c1" });
    expect("senderEmail" in body).toBe(false);
  });
});

// ══════════════════════════════════════════════════
// Bug 2 fix: Deal Splits — batch endpoints
// ══════════════════════════════════════════════════

describe("hubspot_crm_manage_deal_splits (Bug 2: batch endpoints)", () => {
  const tool = findTool("hubspot_crm_manage_deal_splits");

  it("get uses POST to batch/read with inputs array", async () => {
    const mock = mockFetch();
    await tool.execute({ operation: "get", deal_id: "d1" }, client);
    expect(fetchUrl(mock)).toBe("/crm/v3/objects/deals/splits/batch/read");
    expect(fetchMethod(mock)).toBe("POST");
    expect(fetchBody(mock)).toEqual({ inputs: [{ id: "d1" }] });
  });

  it("set uses POST to batch/upsert with splits", async () => {
    const mock = mockFetch();
    const splits = [{ ownerId: "o1", percentage: 50 }];
    await tool.execute(
      { operation: "set", deal_id: "d1", splits },
      client
    );
    expect(fetchUrl(mock)).toBe("/crm/v3/objects/deals/splits/batch/upsert");
    expect(fetchMethod(mock)).toBe("POST");
    expect(fetchBody(mock)).toEqual({
      inputs: [{ id: "d1", splits }],
    });
  });

  it("set parses splits from JSON string", async () => {
    const mock = mockFetch();
    await tool.execute(
      {
        operation: "set",
        deal_id: "d1",
        splits: '[{"ownerId":"o1","percentage":50}]',
      },
      client
    );
    expect(fetchBody(mock)).toEqual({
      inputs: [{ id: "d1", splits: [{ ownerId: "o1", percentage: 50 }] }],
    });
  });
});

// ══════════════════════════════════════════════════
// Bug 3 fix: Marketing Events — correct URL paths
// ══════════════════════════════════════════════════

describe("hubspot_crm_manage_marketing_events (Bug 3: URL paths)", () => {
  const tool = findTool("hubspot_crm_manage_marketing_events");

  it("list uses /marketing/v3/marketing-events (no extra /events)", async () => {
    const mock = mockFetch();
    await tool.execute({ operation: "list" }, client);
    expect(fetchUrl(mock)).toBe("/marketing/v3/marketing-events");
  });

  it("get uses /marketing/v3/marketing-events/{id} (no extra /events)", async () => {
    const mock = mockFetch();
    await tool.execute({ operation: "get", event_id: "e1" }, client);
    expect(fetchUrl(mock)).toBe("/marketing/v3/marketing-events/e1");
  });

  it("create uses /marketing/v3/marketing-events/events (correct)", async () => {
    const mock = mockFetch();
    await tool.execute(
      {
        operation: "create",
        external_event_id: "ext-1",
        external_account_id: "acct-1",
        event_name: "Launch",
      },
      client
    );
    expect(fetchUrl(mock)).toBe("/marketing/v3/marketing-events/events");
    expect(fetchMethod(mock)).toBe("POST");
    const body = fetchBody(mock) as Record<string, unknown>;
    expect(body.externalEventId).toBe("ext-1");
    expect(body.externalAccountId).toBe("acct-1");
    expect(body.eventName).toBe("Launch");
  });

  it("update uses /marketing/v3/marketing-events/{id} (no extra /events)", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "update", event_id: "e1", event_name: "Updated" },
      client
    );
    expect(fetchUrl(mock)).toBe("/marketing/v3/marketing-events/e1");
    expect(fetchMethod(mock)).toBe("PATCH");
  });

  it("delete uses /marketing/v3/marketing-events/{id} (no extra /events)", async () => {
    const mock = mockFetch();
    await tool.execute({ operation: "delete", event_id: "e1" }, client);
    expect(fetchUrl(mock)).toBe("/marketing/v3/marketing-events/e1");
    expect(fetchMethod(mock)).toBe("DELETE");
  });

  it("create omits undefined fields via pickDefined", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "create", external_event_id: "ext-1", external_account_id: "acct-1" },
      client
    );
    const body = fetchBody(mock) as Record<string, unknown>;
    expect(body).toEqual({
      externalEventId: "ext-1",
      externalAccountId: "acct-1",
    });
    expect("eventName" in body).toBe(false);
    expect("customProperties" in body).toBe(false);
  });
});

// ══════════════════════════════════════════════════
// Bug 4 fix: Lists Update — split endpoints
// ══════════════════════════════════════════════════

describe("hubspot_crm_manage_lists update (Bug 4: split endpoints)", () => {
  const tool = findTool("hubspot_crm_manage_lists");

  it("update with name calls update-list-name endpoint", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "update", list_id: "l1", name: "New Name" },
      client
    );
    expect(mock).toHaveBeenCalledTimes(1);
    const call = fetchCall(mock, 0);
    expect(call.url).toBe(
      "/crm/v3/lists/l1/update-list-name?listName=New%20Name"
    );
    expect(call.method).toBe("PUT");
    expect(call.body).toBeUndefined();
  });

  it("update with filter_branch calls update-list-filters endpoint", async () => {
    const mock = mockFetch();
    const filterBranch = { filterBranchType: "OR", filters: [] };
    await tool.execute(
      { operation: "update", list_id: "l1", filter_branch: filterBranch },
      client
    );
    expect(mock).toHaveBeenCalledTimes(1);
    const call = fetchCall(mock, 0);
    expect(call.url).toBe("/crm/v3/lists/l1/update-list-filters");
    expect(call.method).toBe("PUT");
    expect(call.body).toEqual({ filterBranch });
  });

  it("update with both name and filter_branch calls both endpoints", async () => {
    const mock = mockFetch();
    const filterBranch = { filterBranchType: "AND", filters: [] };
    await tool.execute(
      {
        operation: "update",
        list_id: "l1",
        name: "Renamed",
        filter_branch: filterBranch,
      },
      client
    );
    expect(mock).toHaveBeenCalledTimes(2);
    const call0 = fetchCall(mock, 0);
    expect(call0.url).toContain("update-list-name");
    const call1 = fetchCall(mock, 1);
    expect(call1.url).toContain("update-list-filters");
  });

  it("update with both returns { results } array", async () => {
    const mock = mockFetch(200, { listId: "l1" });
    const filterBranch = { filterBranchType: "AND", filters: [] };
    const result = await tool.execute(
      {
        operation: "update",
        list_id: "l1",
        name: "Renamed",
        filter_branch: filterBranch,
      },
      client
    );
    expect(mock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ results: [{ listId: "l1" }, { listId: "l1" }] });
  });

  it("update with only name returns single result (not wrapped)", async () => {
    mockFetch(200, { listId: "l1" });
    const result = await tool.execute(
      { operation: "update", list_id: "l1", name: "Solo" },
      client
    );
    expect(result).toEqual({ listId: "l1" });
  });

  it("update with filter_branch as JSON string parses correctly", async () => {
    const mock = mockFetch();
    await tool.execute(
      {
        operation: "update",
        list_id: "l1",
        filter_branch: '{"filterBranchType":"OR","filters":[]}',
      },
      client
    );
    const call = fetchCall(mock, 0);
    expect(call.body).toEqual({
      filterBranch: { filterBranchType: "OR", filters: [] },
    });
  });
});

// ══════════════════════════════════════════════════
// Bug 5 fix: Exports — correct field mapping
// ══════════════════════════════════════════════════

describe("hubspot_crm_manage_exports (Bug 5: field mapping)", () => {
  const tool = findTool("hubspot_crm_manage_exports");

  it("start maps export_type to exportType (not object_type)", async () => {
    const mock = mockFetch();
    await tool.execute(
      {
        operation: "start",
        export_type: "VIEW",
        object_type: "contacts",
        object_properties: '["firstname","email"]',
      },
      client
    );
    expect(fetchUrl(mock)).toBe("/crm/v3/exports/export/async");
    const body = fetchBody(mock) as Record<string, unknown>;
    expect(body.exportType).toBe("VIEW");
    expect(body.objectType).toBe("contacts");
    expect(body.objectProperties).toEqual(["firstname", "email"]);
    expect(body.format).toBe("CSV");
  });

  it("start defaults format to CSV when not specified", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "start", export_type: "VIEW", object_type: "contacts" },
      client
    );
    expect((fetchBody(mock) as Record<string, unknown>).format).toBe("CSV");
  });

  it("start uses explicit format when specified", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "start", export_type: "VIEW", format: "XLSX" },
      client
    );
    expect((fetchBody(mock) as Record<string, unknown>).format).toBe("XLSX");
  });

  it("start includes publicCrmSearchRequest and listId", async () => {
    const mock = mockFetch();
    await tool.execute(
      {
        operation: "start",
        export_type: "LIST",
        list_id: "list123",
        public_crm_search_request: '{"filters":[]}',
      },
      client
    );
    const body = fetchBody(mock) as Record<string, unknown>;
    expect(body.exportType).toBe("LIST");
    expect(body.listId).toBe("list123");
    expect(body.publicCrmSearchRequest).toEqual({ filters: [] });
  });

  it("start omits undefined fields via pickDefined", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "start", export_type: "VIEW" },
      client
    );
    const body = fetchBody(mock) as Record<string, unknown>;
    expect(body.exportType).toBe("VIEW");
    expect(body.format).toBe("CSV");
    expect("objectType" in body).toBe(false);
    expect("objectProperties" in body).toBe(false);
    expect("listId" in body).toBe(false);
  });

  it("get calls correct status endpoint", async () => {
    const mock = mockFetch();
    await tool.execute({ operation: "get", export_id: "exp1" }, client);
    expect(fetchUrl(mock)).toBe(
      "/crm/v3/exports/export/async/tasks/exp1/status"
    );
  });
});

// ══════════════════════════════════════════════════
// Bug 6 fix: Campaigns — no get_revenue, properties on get
// ══════════════════════════════════════════════════

describe("hubspot_crm_manage_campaigns (Bug 6: no get_revenue)", () => {
  const tool = findTool("hubspot_crm_manage_campaigns");

  it("get passes properties as query param", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "get", campaign_id: "c1", properties: "name,budget" },
      client
    );
    expect(fetchUrl(mock)).toBe(
      "/marketing/v3/campaigns/c1?properties=name%2Cbudget"
    );
  });

  it("get without properties omits query string", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "get", campaign_id: "c1" },
      client
    );
    expect(fetchUrl(mock)).toBe("/marketing/v3/campaigns/c1");
  });

  it("list works with pagination", async () => {
    const mock = mockFetch();
    await tool.execute(
      { operation: "list", limit: 25, after: "cursor1" },
      client
    );
    expect(fetchUrl(mock)).toBe(
      "/marketing/v3/campaigns?limit=25&after=cursor1"
    );
  });

  it("get_revenue is not a valid operation (throws)", async () => {
    mockFetch();
    await expect(
      tool.execute({ operation: "get_revenue", campaign_id: "c1" }, client)
    ).rejects.toThrow("Unknown operation: get_revenue");
  });
});

// ══════════════════════════════════════════════════
// Auth header & error handling
// ══════════════════════════════════════════════════

describe("API client behavior", () => {
  it("sends Authorization header with bearer token", async () => {
    const mock = mockFetch();
    const tool = findTool("hubspot_crm_manage_owners");
    await tool.execute({ operation: "list" }, client);
    const headers = mock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
  });

  it("throws on non-ok response", async () => {
    mockFetch(400, { message: "Bad Request" });
    const tool = findTool("hubspot_crm_manage_owners");
    await expect(
      tool.execute({ operation: "list" }, client)
    ).rejects.toThrow("HubSpot API 400");
  });

  it("unknown operation throws descriptive error", async () => {
    mockFetch();
    const tool = findTool("hubspot_crm_manage_objects");
    await expect(
      tool.execute({ operation: "bad_op", object_type: "contacts" }, client)
    ).rejects.toThrow("Unknown operation: bad_op");
  });
});

// ══════════════════════════════════════════════════
// Unchanged tools — smoke-test correct URLs
// ══════════════════════════════════════════════════

describe("unchanged tools still use correct endpoints", () => {
  it("manage_objects list", async () => {
    const mock = mockFetch();
    const tool = findTool("hubspot_crm_manage_objects");
    await tool.execute(
      { operation: "list", object_type: "contacts", limit: 10 },
      client
    );
    expect(fetchUrl(mock)).toBe("/crm/v3/objects/contacts?limit=10");
  });

  it("manage_objects create", async () => {
    const mock = mockFetch();
    const tool = findTool("hubspot_crm_manage_objects");
    await tool.execute(
      {
        operation: "create",
        object_type: "contacts",
        properties: { firstname: "John" },
      },
      client
    );
    expect(fetchUrl(mock)).toBe("/crm/v3/objects/contacts");
    expect(fetchMethod(mock)).toBe("POST");
    expect(fetchBody(mock)).toEqual({
      properties: { firstname: "John" },
    });
  });

  it("search_objects", async () => {
    const mock = mockFetch();
    const tool = findTool("hubspot_crm_search_objects");
    await tool.execute(
      { object_type: "contacts", query: "john" },
      client
    );
    expect(fetchUrl(mock)).toBe("/crm/v3/objects/contacts/search");
    expect(fetchMethod(mock)).toBe("POST");
    expect((fetchBody(mock) as Record<string, unknown>).query).toBe("john");
  });

  it("manage_lists create", async () => {
    const mock = mockFetch();
    const tool = findTool("hubspot_crm_manage_lists");
    await tool.execute(
      {
        operation: "create",
        name: "Test List",
        object_type_id: "0-1",
        processing_type: "MANUAL",
      },
      client
    );
    expect(fetchUrl(mock)).toBe("/crm/v3/lists");
    expect(fetchMethod(mock)).toBe("POST");
  });

  it("manage_lists delete", async () => {
    const mock = mockFetch();
    const tool = findTool("hubspot_crm_manage_lists");
    await tool.execute(
      { operation: "delete", list_id: "l1" },
      client
    );
    expect(fetchUrl(mock)).toBe("/crm/v3/lists/l1");
    expect(fetchMethod(mock)).toBe("DELETE");
  });
});
