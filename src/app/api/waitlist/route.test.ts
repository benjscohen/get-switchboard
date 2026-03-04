const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

import { POST } from "./route";

// Helper to build a chainable mock
function chainMock(resolvedValue: unknown = { data: null, error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve(resolvedValue).then(resolve),
  };
  return chain;
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    // Default: no existing entry, insert succeeds
    mockFrom.mockImplementation(() => {
      const c = chainMock({ data: null, error: null });
      return c;
    });
  });

  it("returns 200 and adds valid email to waitlist", async () => {
    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toBe("Added to waitlist");
  });

  it("returns 200 'Already on waitlist' for existing email", async () => {
    // First call (select) returns existing entry
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // select().eq().single() → found
        return chainMock({ data: { id: "1", email: "user@example.com" }, error: null });
      }
      return chainMock({ data: null, error: null });
    });

    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toBe("Already on waitlist");
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Valid email required");
  });

  it("returns 400 when email is not a string", async () => {
    const res = await POST(makeRequest({ email: 123 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Valid email required");
  });

  it("returns 400 when email has no @", async () => {
    const res = await POST(makeRequest({ email: "invalid-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Valid email required");
  });

  it("returns 400 for email with nothing after @", async () => {
    const res = await POST(makeRequest({ email: "a@" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for email with nothing before @", async () => {
    const res = await POST(makeRequest({ email: "@b" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for email with double @", async () => {
    const res = await POST(makeRequest({ email: "a@@b" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for email without domain extension", async () => {
    const res = await POST(makeRequest({ email: "user@domain" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when supabase throws", async () => {
    mockFrom.mockImplementation(() => {
      const chain = chainMock();
      chain.single = vi.fn(() => {
        throw new Error("DB down");
      });
      return chain;
    });

    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Internal server error");
  });
});
