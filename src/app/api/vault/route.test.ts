import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    authenticated: true,
    userId: "user-1",
    organizationId: "org-1",
    orgRole: "member",
  }),
}));

const mockCreateSecret = vi.fn();
const mockListSecrets = vi.fn();

vi.mock("@/lib/vault/service", () => ({
  createSecret: (...args: unknown[]) => mockCreateSecret(...args),
  listSecrets: (...args: unknown[]) => mockListSecrets(...args),
}));

import { POST } from "./route";

// ── 3c: JSON parse error handling ──

describe("POST /api/vault — JSON parse error", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/vault", {
      method: "POST",
      body: "this is not json{{{",
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("returns 400 on empty body", async () => {
    const req = new Request("http://localhost/api/vault", {
      method: "POST",
      body: "",
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("proceeds normally with valid JSON", async () => {
    mockCreateSecret.mockResolvedValue({
      ok: true,
      data: { id: "s1", name: "Test" },
    });

    const req = new Request("http://localhost/api/vault", {
      method: "POST",
      body: JSON.stringify({ name: "Test", fields: [{ name: "key", value: "val" }] }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockCreateSecret).toHaveBeenCalledOnce();
  });
});
