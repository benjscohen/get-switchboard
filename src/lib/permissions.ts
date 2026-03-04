import {
  integrationRegistry,
  getToolNamesForIntegration,
} from "@/lib/integrations/registry";
import { proxyIntegrationRegistry } from "@/lib/integrations/proxy-registry";
import { supabaseAdmin } from "@/lib/supabase/admin";

type IntegrationAccessRow = {
  integrationId: string;
  allowedTools: string[];
};

/**
 * Check if a specific tool is allowed for a user given their permissions mode
 * and integration access rows.
 *
 * - "full" mode → always allowed
 * - "custom" mode → only if the integration has a row, and:
 *   - allowedTools is empty → all tools for that integration
 *   - allowedTools has entries → tool must be in the list
 */
export function isToolAllowed(
  permissionsMode: string,
  integrationAccess: IntegrationAccessRow[],
  integrationId: string,
  toolName: string
): boolean {
  if (permissionsMode !== "custom") return true;

  const row = integrationAccess.find(
    (a) => a.integrationId === integrationId
  );
  if (!row) return false;

  if (row.allowedTools.length === 0) return true;

  return row.allowedTools.includes(toolName);
}

/**
 * Validate a permissions payload against the integration registry.
 * For builtin integrations, validates against the registry.
 * For custom MCP integrations (id starts with "custom:"), validates against the DB.
 */
export async function validatePermissionsPayload(
  integrations: Array<{ integrationId: string; allowedTools: string[] }>
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const customEntries = integrations.filter((e) =>
    e.integrationId.startsWith("custom:")
  );
  const proxyEntries = integrations.filter((e) =>
    e.integrationId.startsWith("proxy:")
  );
  const builtinEntries = integrations.filter(
    (e) =>
      !e.integrationId.startsWith("custom:") &&
      !e.integrationId.startsWith("proxy:")
  );

  // Validate builtin integrations
  for (const entry of builtinEntries) {
    if (!integrationRegistry.has(entry.integrationId)) {
      errors.push(`Unknown integration: ${entry.integrationId}`);
      continue;
    }

    const validTools = getToolNamesForIntegration(entry.integrationId);
    for (const tool of entry.allowedTools) {
      if (!validTools.includes(tool)) {
        errors.push(
          `Unknown tool "${tool}" for integration "${entry.integrationId}"`
        );
      }
    }
  }

  // Validate native proxy integrations
  if (proxyEntries.length > 0) {
    const proxyIds = proxyEntries.map((e) => e.integrationId.replace("proxy:", ""));

    // Check that integration IDs exist in registry
    for (const entry of proxyEntries) {
      const proxyId = entry.integrationId.replace("proxy:", "");
      if (!proxyIntegrationRegistry.has(proxyId)) {
        errors.push(`Unknown proxy integration: ${entry.integrationId}`);
      }
    }

    // Load valid tool names from DB
    const { data: dbTools } = await supabaseAdmin
      .from("proxy_integration_tools")
      .select("integration_id, tool_name")
      .in("integration_id", proxyIds)
      .eq("enabled", true);

    const proxyToolMap = new Map<string, string[]>();
    for (const t of dbTools ?? []) {
      const existing = proxyToolMap.get(t.integration_id) ?? [];
      existing.push(t.tool_name);
      proxyToolMap.set(t.integration_id, existing);
    }

    // Fall back to config fallbackTools if no DB rows
    for (const entry of proxyEntries) {
      const proxyId = entry.integrationId.replace("proxy:", "");
      if (!proxyIntegrationRegistry.has(proxyId)) continue;

      let validTools = proxyToolMap.get(proxyId);
      if (!validTools || validTools.length === 0) {
        const proxy = proxyIntegrationRegistry.get(proxyId);
        validTools = (proxy?.fallbackTools ?? []).map((t) => t.name);
      }

      for (const tool of entry.allowedTools) {
        if (!validTools.includes(tool)) {
          errors.push(
            `Unknown tool "${tool}" for proxy integration "${entry.integrationId}"`
          );
        }
      }
    }
  }

  // Validate custom MCP integrations
  if (customEntries.length > 0) {
    const serverIds = customEntries.map((e) =>
      e.integrationId.replace("custom:", "")
    );
    const { data: servers } = await supabaseAdmin
      .from("custom_mcp_servers")
      .select("id, custom_mcp_tools(tool_name)")
      .in("id", serverIds);

    const serverMap = new Map(
      (servers ?? []).map((s) => [
        s.id,
        (s.custom_mcp_tools ?? []).map(
          (t: { tool_name: string }) => t.tool_name
        ),
      ])
    );

    for (const entry of customEntries) {
      const serverId = entry.integrationId.replace("custom:", "");
      const toolNames = serverMap.get(serverId);
      if (!toolNames) {
        errors.push(`Unknown custom MCP server: ${entry.integrationId}`);
        continue;
      }
      for (const tool of entry.allowedTools) {
        if (!toolNames.includes(tool)) {
          errors.push(
            `Unknown tool "${tool}" for custom MCP server "${entry.integrationId}"`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
