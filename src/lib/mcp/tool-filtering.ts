import { isToolAllowed } from "@/lib/permissions";

export type ToolMeta = { integrationId: string; orgId: string | null };

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

      // Builtin tools: require a connection for the integration
      if (!meta.integrationId.startsWith("custom:")) {
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

      return true;
    })
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema ?? { type: "object" as const },
      annotations: tool.annotations,
    }));
}
