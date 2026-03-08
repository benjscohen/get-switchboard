import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/usage-log", () => ({ logUsage: vi.fn() }));

vi.mock("@/lib/vault/service", () => ({
  listSecrets: vi.fn(),
  getSecret: vi.fn(),
  getSecretByName: vi.fn(),
  createSecret: vi.fn(),
  updateSecret: vi.fn(),
  deleteSecret: vi.fn(),
  searchSecrets: vi.fn(),
  shareSecret: vi.fn(),
  unshareSecret: vi.fn(),
  listShares: vi.fn(),
}));

import { registerVaultTools } from "./vault-tools";
import {
  listSecrets,
  getSecret,
  getSecretByName,
  createSecret,
  updateSecret,
  deleteSecret,
  searchSecrets,
  shareSecret,
  unshareSecret,
  listShares,
} from "@/lib/vault/service";

// ---------- helpers ----------

function createMockServer() {
  const registeredTools: Record<string, { handler: (...args: unknown[]) => unknown }> = {};
  return {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) => {
      registeredTools[name] = { handler };
    }),
    _registeredTools: registeredTools,
  };
}

function makeExtra(overrides: Record<string, unknown> = {}) {
  return {
    authInfo: {
      extra: {
        userId: "user-1",
        organizationId: "org-1",
        orgRole: "member",
        ...overrides,
      },
    },
  };
}

function noAuthExtra() {
  return { authInfo: { extra: {} } };
}

// ---------- tests ----------

describe("registerVaultTools", () => {
  let server: ReturnType<typeof createMockServer>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toolMeta: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    toolMeta = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerVaultTools(server as any, toolMeta);
  });

  it("registers all vault tools with platform meta", () => {
    const expectedTools = [
      "vault_list_secrets",
      "vault_get_secret",
      "vault_set_secret",
      "vault_delete_secret",
      "vault_search_secrets",
      "vault_share_secret",
      "vault_unshare_secret",
      "vault_list_shares",
    ];
    for (const name of expectedTools) {
      expect(server._registeredTools[name]).toBeDefined();
      expect(toolMeta.get(name)).toEqual({ integrationId: "platform", orgId: null });
    }
  });

  // ---------- getVaultAuth ----------

  describe("auth", () => {
    it("returns Unauthorized when userId missing", async () => {
      const handler = server._registeredTools["vault_list_secrets"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({}, noAuthExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Unauthorized");
    });

    it("passes orgRole from extra to vault service", async () => {
      vi.mocked(listSecrets).mockResolvedValue({ ok: true, data: [] });
      const handler = server._registeredTools["vault_list_secrets"].handler;
      await handler({}, makeExtra({ orgRole: "admin" }));
      expect(listSecrets).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", orgRole: "admin" }),
        "all",
      );
    });
  });

  // ---------- vault_list_secrets ----------

  describe("vault_list_secrets", () => {
    it("returns list of secrets", async () => {
      const secrets = [{ id: "s1", name: "my-secret" }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(listSecrets).mockResolvedValue({ ok: true, data: secrets } as any);
      const handler = server._registeredTools["vault_list_secrets"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({}, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(secrets);
    });

    it("returns error on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(listSecrets).mockResolvedValue({ ok: false, error: "DB error" } as any);
      const handler = server._registeredTools["vault_list_secrets"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({}, makeExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("DB error");
    });
  });

  // ---------- vault_get_secret ----------

  describe("vault_get_secret", () => {
    it("gets by id", async () => {
      vi.mocked(getSecret).mockResolvedValue({ ok: true, data: { id: "s1", name: "test" } as never });
      const handler = server._registeredTools["vault_get_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(getSecret).toHaveBeenCalled();
    });

    it("gets by name", async () => {
      vi.mocked(getSecretByName).mockResolvedValue({ ok: true, data: { id: "s1", name: "test" } as never });
      const handler = server._registeredTools["vault_get_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ name: "test" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(getSecretByName).toHaveBeenCalled();
    });

    it("returns error when neither name nor id provided", async () => {
      const handler = server._registeredTools["vault_get_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({}, makeExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Provide either name or id");
    });

    it("appends security safety notice to response", async () => {
      const secretData = { id: "s1", name: "test", fields: [{ name: "key", value: "secret123" }] };
      vi.mocked(getSecret).mockResolvedValue({ ok: true, data: secretData as never });
      const handler = server._registeredTools["vault_get_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1" }, makeExtra())) as any;
      const text = result.content[0].text;
      expect(text).toContain(JSON.stringify(secretData, null, 2));
      expect(text).toContain("⚠️ SECURITY");
      expect(text).toContain("DO NOT:");
      expect(text).toContain("Include secret values in your response to the user");
      expect(text).toContain("Write secrets to files");
      expect(text).toContain("Commit secrets to git");
      expect(text).toContain("DO:");
      expect(text).toContain("Use secrets only in-memory");
    });
  });

  // ---------- vault_set_secret ----------

  describe("vault_set_secret", () => {
    it("creates when no existing secret", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(getSecretByName).mockResolvedValue({ ok: false, error: "Not found" } as any);
      vi.mocked(createSecret).mockResolvedValue({ ok: true, data: { id: "s1" } as never });
      const handler = server._registeredTools["vault_set_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ name: "new-secret", fields: [] }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(createSecret).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text).message).toContain("created");
    });

    it("updates when existing owned secret found", async () => {
      vi.mocked(getSecretByName).mockResolvedValue({
        ok: true,
        data: { id: "s1", name: "existing", ownership: "owned" } as never,
      });
      vi.mocked(updateSecret).mockResolvedValue({ ok: true, data: { id: "s1" } as never });
      const handler = server._registeredTools["vault_set_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ name: "existing", fields: [] }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(updateSecret).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text).message).toContain("updated");
    });
  });

  // ---------- vault_delete_secret ----------

  describe("vault_delete_secret", () => {
    it("resolves by id when id provided", async () => {
      vi.mocked(deleteSecret).mockResolvedValue({ ok: true, data: { deleted: true } });
      const handler = server._registeredTools["vault_delete_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(deleteSecret).toHaveBeenCalledWith(expect.anything(), "s1");
    });

    it("resolves by name when name provided", async () => {
      vi.mocked(getSecretByName).mockResolvedValue({ ok: true, data: { id: "s1" } as never });
      vi.mocked(deleteSecret).mockResolvedValue({ ok: true, data: { deleted: true } });
      const handler = server._registeredTools["vault_delete_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ name: "my-secret" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(deleteSecret).toHaveBeenCalledWith(expect.anything(), "s1");
    });

    it("returns error when neither provided", async () => {
      const handler = server._registeredTools["vault_delete_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({}, makeExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Provide either name or id");
    });

    it("returns error on auth failure", async () => {
      const handler = server._registeredTools["vault_delete_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1" }, noAuthExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Unauthorized");
    });
  });

  // ---------- vault_search_secrets ----------

  describe("vault_search_secrets", () => {
    it("passes search params through", async () => {
      vi.mocked(searchSecrets).mockResolvedValue({ ok: true, data: [] });
      const handler = server._registeredTools["vault_search_secrets"].handler;
      await handler({ query: "foo", category: "api_key" }, makeExtra());
      expect(searchSecrets).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ query: "foo", category: "api_key" }),
      );
    });
  });

  // ---------- vault_share_secret ----------

  describe("vault_share_secret", () => {
    it("resolves by id when id provided", async () => {
      vi.mocked(shareSecret).mockResolvedValue({ ok: true, data: { id: "sh1" } as never });
      const handler = server._registeredTools["vault_share_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1", share_with_org: true }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(shareSecret).toHaveBeenCalledWith(
        expect.anything(),
        "s1",
        expect.objectContaining({ organization_id: "org-1" }),
      );
    });

    it("resolves by name when name provided", async () => {
      vi.mocked(getSecretByName).mockResolvedValue({ ok: true, data: { id: "s1" } as never });
      vi.mocked(shareSecret).mockResolvedValue({ ok: true, data: { id: "sh1" } as never });
      const handler = server._registeredTools["vault_share_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ name: "my-secret", share_with_org: true }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(shareSecret).toHaveBeenCalledWith(expect.anything(), "s1", expect.anything());
    });

    it("returns error when neither provided", async () => {
      const handler = server._registeredTools["vault_share_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ share_with_org: true }, makeExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Provide either name or id");
    });

    it("returns error on auth failure", async () => {
      const handler = server._registeredTools["vault_share_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1", share_with_org: true }, noAuthExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Unauthorized");
    });

    it("errors when no share target specified", async () => {
      const handler = server._registeredTools["vault_share_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1" }, makeExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("exactly one");
    });

    it("errors when multiple share targets specified", async () => {
      const handler = server._registeredTools["vault_share_secret"].handler;
      const result = (await handler(
        { id: "s1", share_with_org: true, share_with_email: "a@b.com" },
        makeExtra(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      )) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("exactly one");
    });
  });

  // ---------- vault_unshare_secret ----------

  describe("vault_unshare_secret", () => {
    it("resolves by id when id provided", async () => {
      vi.mocked(unshareSecret).mockResolvedValue({ ok: true, data: { deleted: true } });
      const handler = server._registeredTools["vault_unshare_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1", share_id: "sh1" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(unshareSecret).toHaveBeenCalledWith(expect.anything(), "s1", "sh1");
    });

    it("resolves by name when name provided", async () => {
      vi.mocked(getSecretByName).mockResolvedValue({ ok: true, data: { id: "s1" } as never });
      vi.mocked(unshareSecret).mockResolvedValue({ ok: true, data: { deleted: true } });
      const handler = server._registeredTools["vault_unshare_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ name: "my-secret", share_id: "sh1" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(unshareSecret).toHaveBeenCalledWith(expect.anything(), "s1", "sh1");
    });

    it("returns error when neither provided", async () => {
      const handler = server._registeredTools["vault_unshare_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ share_id: "sh1" }, makeExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Provide either name or id");
    });

    it("returns error on auth failure", async () => {
      const handler = server._registeredTools["vault_unshare_secret"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1", share_id: "sh1" }, noAuthExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Unauthorized");
    });
  });

  // ---------- vault_list_shares ----------

  describe("vault_list_shares", () => {
    it("resolves by id when id provided", async () => {
      const shares = [{ id: "sh1", type: "user" }];
      vi.mocked(listShares).mockResolvedValue({ ok: true, data: shares as never });
      const handler = server._registeredTools["vault_list_shares"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(listShares).toHaveBeenCalledWith(expect.anything(), "s1");
    });

    it("resolves by name when name provided", async () => {
      vi.mocked(getSecretByName).mockResolvedValue({ ok: true, data: { id: "s1" } as never });
      vi.mocked(listShares).mockResolvedValue({ ok: true, data: [] as never });
      const handler = server._registeredTools["vault_list_shares"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ name: "my-secret" }, makeExtra())) as any;
      expect(result.isError).toBeUndefined();
      expect(listShares).toHaveBeenCalledWith(expect.anything(), "s1");
    });

    it("returns error when neither provided", async () => {
      const handler = server._registeredTools["vault_list_shares"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({}, makeExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Provide either name or id");
    });

    it("returns error on auth failure", async () => {
      const handler = server._registeredTools["vault_list_shares"].handler;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await handler({ id: "s1" }, noAuthExtra())) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Unauthorized");
    });
  });
});
