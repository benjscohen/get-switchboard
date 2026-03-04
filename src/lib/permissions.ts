import {
  integrationRegistry,
  getToolNamesForIntegration,
} from "@/lib/integrations/registry";
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
  const builtinEntries = integrations.filter(
    (e) => !e.integrationId.startsWith("custom:")
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
