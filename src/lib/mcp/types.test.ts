import { describe, it, expect } from "vitest";
import { ok, err, getFilterContext, resolveJoin, getMcpAuth, getFullMcpAuth } from "./types";

// ---------- ok ----------

describe("ok", () => {
  it("wraps object data as JSON string in MCP content", () => {
    const result = ok({ foo: "bar" });
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ foo: "bar" }, null, 2) }],
    });
  });

  it("passes string data through without JSON.stringify", () => {
    const result = ok("hello world");
    expect(result).toEqual({
      content: [{ type: "text", text: "hello world" }],
    });
  });

  it("handles null data", () => {
    const result = ok(null);
    expect(result).toEqual({
      content: [{ type: "text", text: "null" }],
    });
  });

  it("handles undefined data", () => {
    const result = ok(undefined);
    expect(result).toEqual({
      content: [{ type: "text", text: "undefined" }],
    });
  });

  it("pretty-prints with 2-space indent", () => {
    const result = ok({ a: { b: 1 } });
    const text = result.content[0].text;
    expect(text).toContain("\n");
    expect(text).toContain("  ");
  });
});

// ---------- err ----------

describe("err", () => {
  it("returns MCP error content with isError: true", () => {
    const result = err("Something went wrong");
    expect(result).toEqual({
      content: [{ type: "text", text: "Something went wrong" }],
      isError: true,
    });
  });

  it("passes message string through as-is", () => {
    const result = err("Unauthorized");
    expect(result.content[0].text).toBe("Unauthorized");
  });
});

// ---------- getFilterContext ----------

describe("getFilterContext", () => {
  it("extracts all fields from fully populated authInfo.extra", () => {
    const extra = {
      authInfo: {
        extra: {
          connections: [{ integrationId: "google-calendar" }],
          organizationId: "org-1",
          permissionsMode: "full",
          integrationAccess: [{ integrationId: "slack", allowedTools: ["send"] }],
          integrationOrgKeys: { slack: "key1" },
          proxyUserKeys: { exa: "key2" },
          apiKeyScope: "full",
          role: "admin",
          orgRole: "owner",
          discoveryMode: true,
          integrationScopes: { slack: new Set(["user-1"]) },
          userId: "user-1",
        },
      },
    };

    const ctx = getFilterContext(extra);
    expect(ctx.connections).toEqual([{ integrationId: "google-calendar" }]);
    expect(ctx.organizationId).toBe("org-1");
    expect(ctx.permissionsMode).toBe("full");
    expect(ctx.integrationAccess).toEqual([{ integrationId: "slack", allowedTools: ["send"] }]);
    expect(ctx.integrationOrgKeys).toEqual({ slack: "key1" });
    expect(ctx.proxyUserKeys).toEqual({ exa: "key2" });
    expect(ctx.apiKeyScope).toBe("full");
    expect(ctx.role).toBe("admin");
    expect(ctx.orgRole).toBe("owner");
    expect(ctx.discoveryMode).toBe(true);
    expect(ctx.integrationScopes).toEqual({ slack: new Set(["user-1"]) });
    expect(ctx.userId).toBe("user-1");
  });

  it("returns undefined fields when authInfo.extra is empty", () => {
    const ctx = getFilterContext({ authInfo: { extra: {} } });
    expect(ctx.connections).toBeUndefined();
    expect(ctx.organizationId).toBeUndefined();
    expect(ctx.userId).toBeUndefined();
  });

  it("returns undefined fields when authInfo is missing", () => {
    const ctx = getFilterContext({});
    expect(ctx.connections).toBeUndefined();
    expect(ctx.organizationId).toBeUndefined();
  });

  it("preserves Set objects for integrationScopes", () => {
    const scopes = { slack: new Set(["u1", "u2"]) };
    const ctx = getFilterContext({
      authInfo: { extra: { integrationScopes: scopes } },
    });
    expect(ctx.integrationScopes?.slack).toBeInstanceOf(Set);
    expect(ctx.integrationScopes?.slack?.has("u1")).toBe(true);
  });

  it("preserves array types for connections and integrationAccess", () => {
    const extra = {
      authInfo: {
        extra: {
          connections: [{ integrationId: "a" }, { integrationId: "b" }],
          integrationAccess: [{ integrationId: "x", allowedTools: ["y"] }],
        },
      },
    };
    const ctx = getFilterContext(extra);
    expect(Array.isArray(ctx.connections)).toBe(true);
    expect(ctx.connections).toHaveLength(2);
    expect(Array.isArray(ctx.integrationAccess)).toBe(true);
  });
});

// ---------- resolveJoin ----------

describe("resolveJoin", () => {
  it("returns first element when raw is an array", () => {
    const result = resolveJoin<{ name: string }>([{ name: "Alice" }]);
    expect(result).toEqual({ name: "Alice" });
  });

  it("returns the value directly when raw is an object (not array)", () => {
    const result = resolveJoin<{ name: string }>({ name: "Bob" });
    expect(result).toEqual({ name: "Bob" });
  });

  it("returns null for empty array", () => {
    const result = resolveJoin([]);
    expect(result).toBeNull();
  });

  it("returns null for null", () => {
    const result = resolveJoin(null);
    expect(result).toBeNull();
  });

  it("returns null for undefined", () => {
    const result = resolveJoin(undefined);
    expect(result).toBeNull();
  });
});

// ---------- getMcpAuth ----------

describe("getMcpAuth", () => {
  it("returns userId and organizationId from extra", () => {
    const result = getMcpAuth({
      authInfo: { extra: { userId: "u1", organizationId: "o1" } },
    });
    expect(result).toEqual({ userId: "u1", organizationId: "o1" });
  });

  it("returns null when userId is missing", () => {
    const result = getMcpAuth({ authInfo: { extra: {} } });
    expect(result).toBeNull();
  });

  it("returns organizationId as undefined when not present", () => {
    const result = getMcpAuth({ authInfo: { extra: { userId: "u1" } } });
    expect(result).toEqual({ userId: "u1", organizationId: undefined });
  });
});

// ---------- getFullMcpAuth ----------

describe("getFullMcpAuth", () => {
  it("returns all fields from extra", () => {
    const result = getFullMcpAuth({
      authInfo: {
        extra: {
          userId: "u1",
          organizationId: "o1",
          orgRole: "admin",
          teamIds: ["t1"],
        },
      },
    });
    expect(result).toEqual({
      userId: "u1",
      organizationId: "o1",
      orgRole: "admin",
      teamIds: ["t1"],
    });
  });

  it("returns null when userId missing", () => {
    const result = getFullMcpAuth({
      authInfo: { extra: { organizationId: "o1" } },
    });
    expect(result).toBeNull();
  });

  it("returns null when organizationId missing", () => {
    const result = getFullMcpAuth({
      authInfo: { extra: { userId: "u1" } },
    });
    expect(result).toBeNull();
  });

  it("defaults orgRole to 'member' when not present", () => {
    const result = getFullMcpAuth({
      authInfo: { extra: { userId: "u1", organizationId: "o1" } },
    });
    expect(result?.orgRole).toBe("member");
  });
});
