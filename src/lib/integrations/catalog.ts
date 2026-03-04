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

export function getNativeProxyCatalog(): CatalogEntry[] {
  return allProxyIntegrations.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    kind: "native-proxy",
    toolCount: i.toolCount,
    tools: i.tools.map((t) => ({ name: t.name, description: t.description })),
  }));
}

export async function getFullCatalog(): Promise<CatalogEntry[]> {
  const [builtin, custom] = await Promise.all([
    getBuiltinCatalog(),
    getCustomMcpCatalog(),
  ]);
  const nativeProxy = getNativeProxyCatalog();
  return [...builtin, ...nativeProxy, ...custom];
}
