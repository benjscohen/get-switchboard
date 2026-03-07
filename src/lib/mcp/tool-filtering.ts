import { isToolAllowed, isUserInScope } from "@/lib/permissions";
import { getToolRisk, isRiskAllowedByScope } from "@/lib/mcp/tool-risk";
import { zodToJsonSchema } from "@/lib/mcp/schema-utils";

export type ToolMeta = { integrationId: string; orgId: string | null; keyMode?: "org" | "per_user"; proxyOAuth?: boolean };

export type RegisteredTool = {
  enabled: boolean;
  description?: string;
  inputSchema?: unknown;
  annotations?: unknown;
};

export type FilterContext = {
  connections?: Array<{ integrationId: string }>;
  organizationId?: string;
  permissionsMode?: string;
  integrationAccess?: Array<{ integrationId: string; allowedTools: string[] }>;
  integrationOrgKeys?: Record<string, string>;
  proxyUserKeys?: Record<string, string>;
  apiKeyScope?: string;
  role?: string;
  orgRole?: string;
  discoveryMode?: boolean;
  /** Tool names allowed by tool group preferences. Key = integrationId, value = Set of allowed tool names. Missing key = all tools allowed. */
  toolGroupAllowedTools?: Record<string, Set<string>>;
  /** Org-level integration access scopes. Key = integrationId, value = Set of allowed user IDs. Missing key = everyone. */
  integrationScopes?: Record<string, Set<string>>;
  /** Current user ID (for integration scope checks). */
  userId?: string;
  /** Per-API-key integration/tool permissions. null/undefined = unrestricted. */
  apiKeyPermissions?: Record<string, string[] | null> | null;
};

/**
 * Filters the full set of registered MCP tools down to only those
 * the current user should see, based on their connections, org, and permissions.
 */
export function filterToolsForUser(
  registeredTools: Record<string, RegisteredTool>,
  toolMeta: Map<string, ToolMeta>,
  ctx: FilterContext
) {
  // Discovery mode: expose all platform tools (no connection required)
  if (ctx.discoveryMode) {
    return Object.entries(registeredTools)
      .filter(([name, tool]) => tool.enabled && toolMeta.get(name)?.integrationId === "platform")
      .map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema) ?? { type: "object" as const },
        annotations: tool.annotations,
      }));
  }

  const connectedIntegrationIds = new Set(
    ctx.connections?.map((c) => c.integrationId) ?? []
  );

  return Object.entries(registeredTools)
    .filter(([name, tool]) => {
      if (!tool.enabled) return false;

      const meta = toolMeta.get(name);
      if (!meta) return false;

      // Platform tools are always visible (no connection required)
      if (meta.integrationId === "platform") return true;

      // Admin tools: role-gated
      if (meta.integrationId === "admin:org") {
        return ctx.orgRole === "owner" || ctx.orgRole === "admin";
      }
      if (meta.integrationId === "admin:super") {
        return ctx.role === "admin";
      }

      // Integration access scope check (org-level restriction)
      if (!isUserInScope(ctx.integrationScopes, ctx.userId, ctx.orgRole, meta.integrationId)) return false;

      // Native proxy tools: require key or OAuth connection based on config
      if (meta.integrationId.startsWith("proxy:")) {
        const proxyId = meta.integrationId.replace("proxy:", "");
        if (meta.proxyOAuth) {
          // OAuth-based proxy: require a connection (like builtin)
          if (!connectedIntegrationIds.has(proxyId)) return false;
        } else if (meta.keyMode === "per_user") {
          if (!ctx.proxyUserKeys?.[proxyId]) return false;
        } else {
          if (!ctx.integrationOrgKeys?.[proxyId]) return false;
        }
      }
      // Builtin tools: require a connection for the integration
      else if (!meta.integrationId.startsWith("custom:")) {
        if (!connectedIntegrationIds.has(meta.integrationId)) return false;
      }

      // Custom tools: org-scoped check (global tools visible to all)
      if (meta.orgId !== null && meta.orgId !== ctx.organizationId) return false;

      // Permissions check
      if (ctx.permissionsMode && ctx.integrationAccess) {
        if (
          !isToolAllowed(
            ctx.permissionsMode,
            ctx.integrationAccess,
            meta.integrationId,
            name
          )
        )
          return false;
      }

      // Tool group preferences
      if (ctx.toolGroupAllowedTools) {
        const allowedSet = ctx.toolGroupAllowedTools[meta.integrationId];
        if (allowedSet && !allowedSet.has(name)) return false;
      }

      // API key scope filtering
      if (ctx.apiKeyScope && ctx.apiKeyScope !== "full") {
        if (!isRiskAllowedByScope(getToolRisk(name), ctx.apiKeyScope)) return false;
      }

      // Per-key integration/tool permissions
      if (ctx.apiKeyPermissions != null) {
        const permIntegrationId = meta.integrationId;
        if (!(permIntegrationId in ctx.apiKeyPermissions)) return false;
        const allowedTools = ctx.apiKeyPermissions[permIntegrationId];
        if (allowedTools !== null && !allowedTools.includes(name)) return false;
      }

      return true;
    })
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema) ?? { type: "object" as const },
      annotations: tool.annotations,
    }));
}
