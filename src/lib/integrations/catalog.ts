import { allIntegrations } from "./registry";
import { allProxyIntegrations } from "./proxy-registry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CatalogEntry } from "./types";

export function getBuiltinCatalog(): CatalogEntry[] {
  return allIntegrations.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    kind: "builtin",
    toolCount: i.toolCount,
    tools: i.tools.map((t) => ({ name: t.name, description: t.description })),
  }));
}

export async function getCustomMcpCatalog(): Promise<CatalogEntry[]> {
  const { data: servers } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("id, name, description, custom_mcp_tools(tool_name, description, enabled)")
    .eq("status", "active");

  if (!servers) return [];

  return servers.map((s) => {
    const enabledTools = (s.custom_mcp_tools ?? []).filter(
      (t: { enabled: boolean }) => t.enabled
    );
    return {
      id: `custom:${s.id}`,
      name: s.name,
      description: s.description,
      kind: "custom-mcp" as const,
      toolCount: enabledTools.length,
      tools: enabledTools.map((t: { tool_name: string; description: string }) => ({
        name: t.tool_name,
        description: t.description,
      })),
    };
  });
}

export async function getNativeProxyCatalog(): Promise<CatalogEntry[]> {
  // Load tools from DB, falling back to config
  const { data: dbTools } = await supabaseAdmin
    .from("proxy_integration_tools")
    .select("integration_id, tool_name, description")
    .eq("enabled", true);

  const toolsByIntegration = new Map<string, Array<{ name: string; description: string }>>();
  for (const t of dbTools ?? []) {
    const existing = toolsByIntegration.get(t.integration_id) ?? [];
    existing.push({ name: t.tool_name, description: t.description });
    toolsByIntegration.set(t.integration_id, existing);
  }

  return allProxyIntegrations.map((i) => {
    const tools = toolsByIntegration.get(i.id) ??
      (i.fallbackTools ?? []).map((t) => ({ name: t.name, description: t.description }));
    return {
      id: i.id,
      name: i.name,
      description: i.description,
      kind: "native-proxy" as const,
      toolCount: tools.length,
      tools,
    };
  });
}

export async function getFullCatalog(): Promise<CatalogEntry[]> {
  const [builtin, custom, nativeProxy] = await Promise.all([
    getBuiltinCatalog(),
    getCustomMcpCatalog(),
    getNativeProxyCatalog(),
  ]);
  return [...builtin, ...nativeProxy, ...custom];
}
