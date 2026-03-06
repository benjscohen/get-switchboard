export type McpAuthExtra = { authInfo?: { extra?: Record<string, unknown> } };

export function getMcpAuth(extra: McpAuthExtra): { userId: string; organizationId?: string } | null {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  if (!userId) return null;
  const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
  return { userId, organizationId };
}

export function getFullMcpAuth(extra: McpAuthExtra): {
  userId: string; organizationId: string; orgRole: string; teamIds?: string[];
} | null {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
  if (!userId || !organizationId) return null;
  const orgRole = (extra.authInfo?.extra?.orgRole as string) ?? "member";
  const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;
  return { userId, organizationId, orgRole, teamIds };
}

export function unauthorized() {
  return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };
}

/** Wrap a successful MCP response. Strings pass through; objects are JSON-stringified. */
export function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text: String(text) }] };
}

/** Wrap an MCP error response. */
export function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

import type { FilterContext } from "./tool-filtering";

/** Extract a FilterContext from the MCP auth extra — single place for this cast-heavy extraction. */
export function getFilterContext(extra: McpAuthExtra): FilterContext {
  const e = extra.authInfo?.extra;
  return {
    connections: e?.connections as FilterContext["connections"],
    organizationId: e?.organizationId as string | undefined,
    permissionsMode: e?.permissionsMode as string | undefined,
    integrationAccess: e?.integrationAccess as FilterContext["integrationAccess"],
    integrationOrgKeys: e?.integrationOrgKeys as Record<string, string> | undefined,
    proxyUserKeys: e?.proxyUserKeys as Record<string, string> | undefined,
    apiKeyScope: e?.apiKeyScope as string | undefined,
    role: e?.role as string | undefined,
    orgRole: e?.orgRole as string | undefined,
    discoveryMode: e?.discoveryMode as boolean | undefined,
    integrationScopes: e?.integrationScopes as Record<string, Set<string>> | undefined,
    userId: e?.userId as string | undefined,
  };
}

/** Resolve a Supabase FK join that may return an array or a single object. */
export function resolveJoin<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return raw as T;
}
