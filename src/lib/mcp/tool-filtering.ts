import { isToolAllowed } from "@/lib/permissions";
import { getToolRisk, isRiskAllowedByScope } from "@/lib/mcp/tool-risk";

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

      // API key scope filtering
      if (ctx.apiKeyScope && ctx.apiKeyScope !== "full") {
        if (!isRiskAllowedByScope(getToolRisk(name), ctx.apiKeyScope)) return false;
      }

      return true;
    })
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema ?? { type: "object" as const },
      annotations: tool.annotations,
    }));
}
