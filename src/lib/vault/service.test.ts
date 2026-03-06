import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));

import { unshareSecret, updateSecret, type VaultAuth } from "./service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainMock(resolvedValue: unknown = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const m of [
    "select", "insert", "update", "delete", "eq", "is", "in",
    "order", "limit", "like", "or", "ilike", "overlaps", "upsert", "maybeSingle",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

// ── 3a: Org admin unshare scoping ──

describe("unshareSecret", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows owner to unshare any share type", async () => {
    const secretChain = chainMock({ data: { id: "s1", user_id: "user-1" }, error: null });
    const deleteChain = chainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") return secretChain;
      if (table === "vault_shares") return deleteChain;
      return chainMock();
    });

    const auth: VaultAuth = { userId: "user-1", organizationId: "org-1", orgRole: "member" };
    const result = await unshareSecret(auth, "s1", "share-1");

    expect(result.ok).toBe(true);
  });

  it("allows org admin to unshare org-level shares", async () => {
    const secretChain = chainMock({ data: { id: "s1", user_id: "other-user" }, error: null });
    // Share has organization_id set → org-level share
    const shareChain = chainMock({ data: { organization_id: "org-1" }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") return secretChain;
      if (table === "vault_shares") return shareChain;
      return chainMock();
    });

    const auth: VaultAuth = { userId: "admin-user", organizationId: "org-1", orgRole: "admin" };
    const result = await unshareSecret(auth, "s1", "share-1");

    expect(result.ok).toBe(true);
  });

  it("blocks org admin from unsharing user-level shares", async () => {
    const secretChain = chainMock({ data: { id: "s1", user_id: "other-user" }, error: null });
    // Share has organization_id = null → user-level share
    const shareChain = chainMock({ data: { organization_id: null }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") return secretChain;
      if (table === "vault_shares") return shareChain;
      return chainMock();
    });

    const auth: VaultAuth = { userId: "admin-user", organizationId: "org-1", orgRole: "admin" };
    const result = await unshareSecret(auth, "s1", "share-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toMatch(/organization-level/);
    }
  });

  it("blocks org admin from unsharing team-level shares", async () => {
    const secretChain = chainMock({ data: { id: "s1", user_id: "other-user" }, error: null });
    // Share has team_id but no organization_id → team-level share
    const shareChain = chainMock({ data: { organization_id: null }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") return secretChain;
      if (table === "vault_shares") return shareChain;
      return chainMock();
    });

    const auth: VaultAuth = { userId: "admin-user", organizationId: "org-1", orgRole: "owner" };
    // Owner of org but NOT owner of secret
    const authAsAdmin: VaultAuth = { userId: "admin-user", organizationId: "org-1", orgRole: "admin" };
    const result = await unshareSecret(authAsAdmin, "s1", "share-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("blocks non-owner non-admin from unsharing", async () => {
    const secretChain = chainMock({ data: { id: "s1", user_id: "other-user" }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") return secretChain;
      return chainMock();
    });

    const auth: VaultAuth = { userId: "regular-user", organizationId: "org-1", orgRole: "member" };
    const result = await unshareSecret(auth, "s1", "share-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns 404 when secret not found", async () => {
    const secretChain = chainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") return secretChain;
      return chainMock();
    });

    const auth: VaultAuth = { userId: "user-1" };
    const result = await unshareSecret(auth, "nonexistent", "share-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("returns 404 when org admin tries to unshare nonexistent share", async () => {
    const secretChain = chainMock({ data: { id: "s1", user_id: "other-user" }, error: null });
    // Share lookup returns null
    const shareChain = chainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") return secretChain;
      if (table === "vault_shares") return shareChain;
      return chainMock();
    });

    const auth: VaultAuth = { userId: "admin-user", organizationId: "org-1", orgRole: "admin" };
    const result = await unshareSecret(auth, "s1", "nonexistent");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

// ── 3b: Non-empty fields validation on update ──

describe("updateSecret — empty fields validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects empty fields array with 400", async () => {
    const secretChain = chainMock({ data: { id: "s1" }, error: null });
    mockFrom.mockReturnValue(secretChain);

    const auth: VaultAuth = { userId: "user-1" };
    const result = await updateSecret(auth, "s1", { fields: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/at least one field/i);
    }
  });

  it("allows update with undefined fields (metadata-only update)", async () => {
    // This should NOT trigger the empty fields validation
    const secretChain = chainMock({ data: { id: "s1" }, error: null });
    const updateChain = chainMock({ data: null, error: null });

    let secretCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "vault_secrets") {
        secretCallCount++;
        // First call: existence check, Second+: getSecret internals
        if (secretCallCount === 1) return secretChain;
        return chainMock({ data: { id: "s1", name: "Test", description: null, category: "other", tags: [], user_id: "user-1", created_at: "2024-01-01", updated_at: "2024-01-01" }, error: null });
      }
      if (table === "vault_secret_fields") return chainMock({ data: [], error: null });
      if (table === "team_members") return chainMock({ data: [], error: null });
      if (table === "vault_shares") return chainMock({ data: null, error: null });
      return updateChain;
    });

    const auth: VaultAuth = { userId: "user-1" };
    const result = await updateSecret(auth, "s1", { name: "Updated Name" });

    // Should not get 400 error for fields
    if (!result.ok) {
      expect(result.status).not.toBe(400);
    }
  });

  it("rejects update that would remove all fields", async () => {
    const secretChain = chainMock({ data: { id: "s1" }, error: null });
    mockFrom.mockReturnValue(secretChain);

    const auth: VaultAuth = { userId: "user-1" };
    const result = await updateSecret(auth, "s1", {
      name: "Still Valid",
      fields: [], // trying to clear all fields
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
