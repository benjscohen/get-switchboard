import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/usage-log", () => ({ logUsage: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfter: 0 })),
}));
vi.mock("@/lib/permissions", () => ({
  isToolAllowed: vi.fn(() => true),
  isUserInScope: vi.fn(() => true),
}));
vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidTokens: vi.fn(),
}));
vi.mock("@/lib/feedback", () => ({
  submitFeedback: vi.fn(),
}));

import {
  toolPreCheck,
  isPreCheckError,
  resolveConnection,
  connectionNotFoundError,
  resolveApiKeyForProxy,
} from "./integration-tools";
import { logUsage } from "@/lib/usage-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { isToolAllowed, isUserInScope } from "@/lib/permissions";

// ── Helpers ──

function makeExtra(overrides: Record<string, unknown> = {}) {
  return {
    authInfo: {
      extra: {
        userId: "user-1",
        apiKeyId: "key-1",
        organizationId: "org-1",
        permissionsMode: "full",
        integrationAccess: undefined,
        integrationScopes: undefined,
        orgRole: "member",
        apiKeyScope: "full",
        ...overrides,
      },
    },
  };
}

// ── Tests ──

describe("toolPreCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, retryAfter: 0 });
    vi.mocked(isToolAllowed).mockReturnValue(true);
    vi.mocked(isUserInScope).mockReturnValue(true);
  });

  it("returns error when key is expired", () => {
    const result = toolPreCheck("some_tool", "integration", makeExtra({ keyExpired: true }));
    expect(isPreCheckError(result)).toBe(true);
    if (isPreCheckError(result)) {
      expect(result.content[0].text).toContain("expired");
    }
  });

  it("returns error when userId is missing", () => {
    const result = toolPreCheck("some_tool", "integration", makeExtra({ userId: undefined }));
    expect(isPreCheckError(result)).toBe(true);
    if (isPreCheckError(result)) {
      expect(result.content[0].text).toBe("Unauthorized");
    }
  });

  it("logs unauthorized when userId missing", () => {
    toolPreCheck("some_tool", "integration", makeExtra({ userId: undefined }));
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "unknown",
        status: "unauthorized",
      }),
    );
  });

  it("returns error when tool not allowed by permissions", () => {
    vi.mocked(isToolAllowed).mockReturnValue(false);
    const result = toolPreCheck("some_tool", "integration", makeExtra({
      permissionsMode: "custom",
      integrationAccess: [{ integrationId: "other", allowedTools: ["x"] }],
    }));
    expect(isPreCheckError(result)).toBe(true);
    if (isPreCheckError(result)) {
      expect(result.content[0].text).toBe("Tool not available");
    }
  });

  it("returns error when user not in integration scope", () => {
    vi.mocked(isUserInScope).mockReturnValue(false);
    const result = toolPreCheck("some_tool", "integration", makeExtra());
    expect(isPreCheckError(result)).toBe(true);
  });

  it("returns error when rate limit exceeded", () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, retryAfter: 30 });
    const result = toolPreCheck("some_tool", "integration", makeExtra());
    expect(isPreCheckError(result)).toBe(true);
    if (isPreCheckError(result)) {
      expect(result.content[0].text).toContain("Rate limit");
    }
  });

  it("returns success context when all checks pass", () => {
    const result = toolPreCheck("some_tool", "integration", makeExtra());
    expect(isPreCheckError(result)).toBe(false);
    if (!isPreCheckError(result)) {
      expect(result.userId).toBe("user-1");
      expect(result.apiKeyId).toBe("key-1");
      expect(result.organizationId).toBe("org-1");
      expect(result.startTime).toBeGreaterThan(0);
    }
  });

  it("includes userId, apiKeyId, organizationId, startTime in success", () => {
    const result = toolPreCheck("some_tool", "integration", makeExtra());
    if (!isPreCheckError(result)) {
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("apiKeyId");
      expect(result).toHaveProperty("organizationId");
      expect(result).toHaveProperty("startTime");
    }
  });
});

describe("resolveConnection", () => {
  it("returns connection when found for integrationId", () => {
    const connections = [
      { id: "c1", integrationId: "slack", accessToken: "tok", refreshToken: null, expiresAt: null },
      { id: "c2", integrationId: "gmail", accessToken: "tok2", refreshToken: null, expiresAt: null },
    ];
    const result = resolveConnection(makeExtra({ connections }), "slack");
    expect(result?.id).toBe("c1");
  });

  it("returns null when no matching connection", () => {
    const connections = [
      { id: "c1", integrationId: "slack", accessToken: "tok", refreshToken: null, expiresAt: null },
    ];
    const result = resolveConnection(makeExtra({ connections }), "gmail");
    expect(result).toBeNull();
  });

  it("returns null when connections undefined", () => {
    const result = resolveConnection(makeExtra({ connections: undefined }), "slack");
    expect(result).toBeNull();
  });
});

describe("connectionNotFoundError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns MCP error with integration name", () => {
    const pre = { userId: "u1", apiKeyId: "k1", organizationId: "o1", startTime: Date.now() };
    const result = connectionNotFoundError(pre, "slack_send", "slack", "Slack");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Slack");
  });

  it("logs usage with error status", () => {
    const pre = { userId: "u1", apiKeyId: "k1", organizationId: "o1", startTime: Date.now() };
    connectionNotFoundError(pre, "slack_send", "slack", "Slack");
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        status: "error",
        errorMessage: "Integration not connected",
      }),
    );
  });
});

describe("resolveApiKeyForProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pre = { userId: "u1", apiKeyId: "k1", organizationId: "o1", startTime: Date.now() };

  it("returns userKey when available", () => {
    const result = resolveApiKeyForProxy(pre, "tool1", "integration", "Test", {
      userKey: "my-key",
    });
    expect("key" in result && result.key).toBe("my-key");
  });

  it("falls back to fallbackKey when userKey missing", () => {
    const result = resolveApiKeyForProxy(pre, "tool1", "integration", "Test", {
      fallbackKey: "fallback-key",
    });
    expect("key" in result && result.key).toBe("fallback-key");
  });

  it("returns error when both keys missing and keyMode is per_user", () => {
    const result = resolveApiKeyForProxy(pre, "tool1", "integration", "Test", {
      keyMode: "per_user",
    });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.content[0].text).toContain("personal API key");
    }
  });

  it("returns error with org admin message when keyMode is not per_user", () => {
    const result = resolveApiKeyForProxy(pre, "tool1", "integration", "Test", {});
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.content[0].text).toContain("org admin");
    }
  });

  it("logs usage on key resolution failure", () => {
    resolveApiKeyForProxy(pre, "tool1", "integration", "Test", { keyMode: "per_user" });
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        status: "error",
      }),
    );
  });
});
