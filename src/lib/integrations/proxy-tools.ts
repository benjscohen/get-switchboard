import { supabaseAdmin } from "@/lib/supabase/admin";
import { discoverTools } from "@/lib/mcp/proxy-client";
import { allProxyIntegrations } from "./proxy-registry";

export type ProxyTool = {
  integrationId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * Load proxy integration tools from DB, falling back to hardcoded
 * config tools for integrations that have no DB rows yet.
 */
export async function loadProxyTools(): Promise<{
  tools: ProxyTool[];
  fallbackIntegrationIds: Set<string>;
}> {
  const { data } = await supabaseAdmin
    .from("proxy_integration_tools")
    .select("integration_id, tool_name, description, input_schema")
    .eq("enabled", true);

  const dbTools = (data ?? []).map((row) => ({
    integrationId: row.integration_id,
    name: row.tool_name,
    description: row.description,
    inputSchema: row.input_schema as Record<string, unknown>,
  }));

  const dbIntegrationIds = new Set(dbTools.map((t) => t.integrationId));
  const fallbackIntegrationIds = new Set<string>();

  // Add fallback tools for integrations not yet in DB
  const fallbackTools = allProxyIntegrations.flatMap((proxy) => {
    if (dbIntegrationIds.has(proxy.id)) return [];
    fallbackIntegrationIds.add(proxy.id);
    return (proxy.fallbackTools ?? []).map((t) => ({
      integrationId: proxy.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  });

  return {
    tools: [...dbTools, ...fallbackTools],
    fallbackIntegrationIds,
  };
}

/**
 * Discover tools from a remote proxy MCP server and cache them in DB.
 */
export async function discoverAndCacheProxyTools(
  integrationId: string,
  serverUrl: string,
  apiKey?: string
): Promise<ProxyTool[]> {
  try {
    const discovered = await discoverTools(serverUrl, apiKey);

    // Upsert tools into DB
    if (discovered.length > 0) {
      const rows = discovered.map((t) => ({
        integration_id: integrationId,
        tool_name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
        enabled: true,
      }));

      await supabaseAdmin.from("proxy_integration_tools").upsert(rows, {
        onConflict: "integration_id,tool_name",
      });

      // Remove tools that no longer exist on the remote server
      const discoveredNames = discovered.map((t) => t.name);
      await supabaseAdmin
        .from("proxy_integration_tools")
        .delete()
        .eq("integration_id", integrationId)
        .not("tool_name", "in", `(${discoveredNames.map((n) => `"${n}"`).join(",")})`);
    }

    // Update status
    await supabaseAdmin.from("proxy_integration_status").upsert(
      {
        integration_id: integrationId,
        last_discovered_at: new Date().toISOString(),
        last_error: null,
        tool_count: discovered.length,
      },
      { onConflict: "integration_id" }
    );

    return discovered.map((t) => ({
      integrationId,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[proxy-tools] Discovery failed for ${integrationId}:`,
      message
    );

    // Record the error
    await supabaseAdmin
      .from("proxy_integration_status")
      .upsert(
        {
          integration_id: integrationId,
          last_error: message,
        },
        { onConflict: "integration_id" }
      )
      .then();

    throw err;
  }
}
