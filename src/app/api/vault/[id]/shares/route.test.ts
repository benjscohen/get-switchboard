import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
  AuditEventType: {},
}));

const mockRequireAuth = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockShareSecret = vi.fn();
const mockListShares = vi.fn();

vi.mock("@/lib/vault/service", () => ({
  shareSecret: (...args: unknown[]) => mockShareSecret(...args),
  listShares: (...args: unknown[]) => mockListShares(...args),
}));

import { POST } from "./route";

// ── 3d: Org share validation ──

describe("POST /api/vault/[id]/shares — org resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when organization_id=current but user has no org", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      organizationId: undefined, // personal org, no org context
      orgRole: "member",
    });

    const req = new Request("http://localhost/api/vault/s1/shares", {
      method: "POST",
      body: JSON.stringify({ organization_id: "current" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/organization/i);
    expect(mockShareSecret).not.toHaveBeenCalled();
  });

  it("proceeds when organization_id=current and user has org", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      organizationId: "org-1",
      orgRole: "member",
    });
    mockShareSecret.mockResolvedValue({
      ok: true,
      data: { id: "share-1", secretId: "s1", targetType: "organization", targetId: "org-1", targetLabel: "Org", createdBy: "user-1", createdAt: "2024-01-01" },
    });

    const req = new Request("http://localhost/api/vault/s1/shares", {
      method: "POST",
      body: JSON.stringify({ organization_id: "current" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(201);
    expect(mockShareSecret).toHaveBeenCalledOnce();
    // Verify the resolved org ID was passed, not "current"
    const [, , target] = mockShareSecret.mock.calls[0];
    expect(target).toEqual({ organization_id: "org-1" });
  });

  it("passes through explicit org IDs without resolution", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      organizationId: "org-1",
      orgRole: "member",
    });
    mockShareSecret.mockResolvedValue({
      ok: true,
      data: { id: "share-1", secretId: "s1", targetType: "organization", targetId: "org-explicit", targetLabel: "Org", createdBy: "user-1", createdAt: "2024-01-01" },
    });

    const req = new Request("http://localhost/api/vault/s1/shares", {
      method: "POST",
      body: JSON.stringify({ organization_id: "org-explicit" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(201);
    const [, , target] = mockShareSecret.mock.calls[0];
    expect(target).toEqual({ organization_id: "org-explicit" });
  });
});
