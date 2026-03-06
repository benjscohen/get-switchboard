import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin so usage-log can import without env vars
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

// Mock logUsage to capture calls
vi.mock("@/lib/usage-log", () => ({
  logUsage: vi.fn(),
}));

import { withToolLogging } from "./tool-logging";
import { logUsage } from "@/lib/usage-log";

// ---------- helpers ----------

function makeExtra(overrides: Record<string, unknown> = {}) {
  return {
    authInfo: {
      extra: {
        userId: "user-123",
        apiKeyId: "key-456",
        organizationId: "org-789",
        ...overrides,
      },
    },
  };
}

function successResult(text = "ok") {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text = "failed") {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

// ---------- tests ----------

describe("withToolLogging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs success when handler returns a non-error result", async () => {
    const handler = vi.fn().mockResolvedValue(successResult("data here"));
    const wrapped = withToolLogging("vault_list_secrets", "platform", handler);

    const result = await wrapped({}, makeExtra());

    expect(result).toEqual(successResult("data here"));
    expect(handler).toHaveBeenCalledOnce();
    expect(logUsage).toHaveBeenCalledOnce();
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        apiKeyId: "key-456",
        organizationId: "org-789",
        toolName: "vault_list_secrets",
        integrationId: "platform",
        status: "success",
        riskLevel: "read", // vault_list_secrets is classified as read
      }),
    );
    // durationMs should be a non-negative number
    const call = vi.mocked(logUsage).mock.calls[0][0];
    expect(call.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs error when handler returns an isError result", async () => {
    const handler = vi.fn().mockResolvedValue(errorResult("Unauthorized"));
    const wrapped = withToolLogging("vault_set_secret", "platform", handler);

    const result = await wrapped({}, makeExtra());

    expect(result).toEqual(errorResult("Unauthorized"));
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        toolName: "vault_set_secret",
        integrationId: "platform",
        status: "error",
        riskLevel: "write", // vault_set_secret is classified as write
      }),
    );
  });

  it("logs error and re-throws when handler throws an exception", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    const wrapped = withToolLogging("admin_teams", "admin:org", handler);

    await expect(wrapped({}, makeExtra())).rejects.toThrow("DB connection lost");

    expect(logUsage).toHaveBeenCalledOnce();
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        toolName: "admin_teams",
        integrationId: "admin:org",
        status: "error",
        errorMessage: "DB connection lost",
      }),
    );
  });

  it("logs error with 'Unknown error' for non-Error throws", async () => {
    const handler = vi.fn().mockRejectedValue("string error");
    const wrapped = withToolLogging("admin_users", "admin:super", handler);

    await expect(wrapped({}, makeExtra())).rejects.toBe("string error");

    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "Unknown error",
      }),
    );
  });

  it("uses 'unknown' userId when authInfo has no userId", async () => {
    const handler = vi.fn().mockResolvedValue(successResult());
    const wrapped = withToolLogging("discover_tools", "platform", handler);

    await wrapped({}, { authInfo: { extra: {} } });

    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "unknown",
        apiKeyId: undefined,
        organizationId: undefined,
      }),
    );
  });

  it("uses 'unknown' userId when authInfo is missing entirely", async () => {
    const handler = vi.fn().mockResolvedValue(successResult());
    const wrapped = withToolLogging("discover_tools", "platform", handler);

    await wrapped({}, {});

    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "unknown",
        apiKeyId: undefined,
        organizationId: undefined,
      }),
    );
  });

  it("passes args and extra through to the handler unchanged", async () => {
    const handler = vi.fn().mockResolvedValue(successResult());
    const wrapped = withToolLogging("vault_get_secret", "platform", handler);

    const args = { name: "my-secret", id: "abc" };
    const extra = makeExtra({ customField: "test" });

    await wrapped(args, extra);

    expect(handler).toHaveBeenCalledWith(args, extra);
  });

  it("records duration across slow handlers", async () => {
    const handler = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(successResult()), 50)),
    );
    const wrapped = withToolLogging("call_tool", "platform", handler);

    await wrapped({}, makeExtra());

    const call = vi.mocked(logUsage).mock.calls[0][0];
    expect(call.durationMs).toBeGreaterThanOrEqual(40); // allow some timing slack
  });

  it("records duration even when handler throws", async () => {
    const handler = vi.fn().mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 50)),
    );
    const wrapped = withToolLogging("admin_mcp_servers", "admin:super", handler);

    await expect(wrapped({}, makeExtra())).rejects.toThrow("timeout");

    const call = vi.mocked(logUsage).mock.calls[0][0];
    expect(call.durationMs).toBeGreaterThanOrEqual(40);
  });

  it("uses correct risk level for destructive tools", async () => {
    const handler = vi.fn().mockResolvedValue(successResult());
    const wrapped = withToolLogging("vault_delete_secret", "platform", handler);

    await wrapped({}, makeExtra());

    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        riskLevel: "destructive",
      }),
    );
  });

  it("uses inferred risk level for unknown tools", async () => {
    const handler = vi.fn().mockResolvedValue(successResult());
    // "something_list_items" should infer as "read" because of "list" pattern
    const wrapped = withToolLogging("something_list_items", "custom", handler);

    await wrapped({}, makeExtra());

    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        riskLevel: "read",
      }),
    );
  });

  it("returns the exact result object from handler (no mutation)", async () => {
    const original = { content: [{ type: "text" as const, text: "data" }], isError: false as const };
    const handler = vi.fn().mockResolvedValue(original);
    const wrapped = withToolLogging("manage_skills", "platform", handler);

    const result = await wrapped({}, makeExtra());

    expect(result).toBe(original); // same reference
  });

  it("works with different integration IDs for admin tools", async () => {
    const handler = vi.fn().mockResolvedValue(successResult());

    const wrappedOrg = withToolLogging("admin_org", "admin:org", handler);
    const wrappedSuper = withToolLogging("admin_usage", "admin:super", handler);

    await wrappedOrg({}, makeExtra());
    await wrappedSuper({}, makeExtra());

    expect(vi.mocked(logUsage).mock.calls[0][0].integrationId).toBe("admin:org");
    expect(vi.mocked(logUsage).mock.calls[1][0].integrationId).toBe("admin:super");
  });

  it("logs exactly once per invocation on success", async () => {
    const handler = vi.fn().mockResolvedValue(successResult());
    const wrapped = withToolLogging("submit_feedback", "platform", handler);

    await wrapped({}, makeExtra());
    await wrapped({}, makeExtra());

    expect(logUsage).toHaveBeenCalledTimes(2);
  });

  it("logs exactly once per invocation on error", async () => {
    const handler = vi.fn().mockResolvedValue(errorResult());
    const wrapped = withToolLogging("submit_feedback", "platform", handler);

    await wrapped({}, makeExtra());

    expect(logUsage).toHaveBeenCalledTimes(1);
  });

  it("logs exactly once per invocation on throw", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const wrapped = withToolLogging("submit_feedback", "platform", handler);

    await expect(wrapped({}, makeExtra())).rejects.toThrow();

    expect(logUsage).toHaveBeenCalledTimes(1);
  });
});
