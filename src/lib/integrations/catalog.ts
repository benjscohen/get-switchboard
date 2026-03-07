import { allIntegrations, isIntegrationConfigured } from "./registry";
import { allProxyIntegrations } from "./proxy-registry";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CatalogEntry } from "./types";

const INTEGRATION_CATEGORIES: Record<string, string> = {
  "platform": "platform",
  "slack": "messaging",
  "github": "development",
  "shortcut": "development",
  "linear": "development",
  "context7": "development",
  "asana": "productivity",
  "google-calendar": "calendar",
  "google-gmail": "email",
  "google-docs": "documents",
  "google-drive": "storage",
  "google-sheets": "documents",
  "google-slides": "documents",
  "google-ads": "advertising",
  "linkedin-ads": "advertising",
  "hubspot-crm": "crm",
  "intercom": "crm",
  "railway": "deployment",
  "exa": "search",
  "firecrawl": "search",
  "granola": "notes",
  "supabase": "database",
};

const PLATFORM_TOOLS: Array<{ name: string; description: string }> = [
  { name: "file_read", description: "Read a file" },
  { name: "file_write", description: "Write a file" },
  { name: "file_delete", description: "Delete a file" },
  { name: "file_move", description: "Move or rename a file" },
  { name: "file_list", description: "List files in a directory" },
  { name: "file_search", description: "Search files by name or content" },
  { name: "folder_create", description: "Create a folder" },
  { name: "folder_delete", description: "Delete a folder" },
  { name: "file_history", description: "View file version history" },
  { name: "file_version_read", description: "Read a specific file version" },
  { name: "file_rollback", description: "Rollback a file to a previous version" },
  { name: "save_memory", description: "Save a memory for future recall" },
  { name: "recall_memories", description: "Recall saved memories" },
  { name: "forget_memory", description: "Delete a saved memory" },
  { name: "discover_tools", description: "Discover available tools" },
  { name: "call_tool", description: "Call a tool by name" },
  { name: "manage_skills", description: "Manage reusable prompt templates" },
  { name: "manage_agents", description: "Manage agent definitions" },
  { name: "submit_feedback", description: "Submit feedback" },
  { name: "vault_list_secrets", description: "List vault secrets" },
  { name: "vault_get_secret", description: "Get a vault secret" },
  { name: "vault_set_secret", description: "Set a vault secret" },
  { name: "vault_delete_secret", description: "Delete a vault secret" },
  { name: "vault_search_secrets", description: "Search vault secrets" },
  { name: "vault_share_secret", description: "Share a vault secret" },
  { name: "vault_unshare_secret", description: "Unshare a vault secret" },
  { name: "vault_list_shares", description: "List vault secret shares" },
];

export function getPlatformCatalog(): CatalogEntry {
  return {
    id: "platform",
    name: "Switchboard Platform",
    description: "Core platform tools for files, memory, vault, and agent management",
    kind: "platform",
    category: "platform",
    toolCount: PLATFORM_TOOLS.length,
    tools: PLATFORM_TOOLS,
  };
}

export function getBuiltinCatalog(): CatalogEntry[] {
  return allIntegrations.filter(isIntegrationConfigured).map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    kind: "builtin" as const,
    category: INTEGRATION_CATEGORIES[i.id],
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
      category: "custom",
      toolCount: enabledTools.length,
      tools: enabledTools.map((t: { tool_name: string; description: string }) => ({
        name: t.tool_name,
        description: t.description,
      })),
    };
  });
}

export async function loadProxyToolsByIntegration(): Promise<Map<string, Array<{ name: string; description: string }>>> {
  const { data } = await supabaseAdmin
    .from("proxy_integration_tools")
    .select("integration_id, tool_name, description")
    .eq("enabled", true);

  const map = new Map<string, Array<{ name: string; description: string }>>();
  for (const t of data ?? []) {
    const existing = map.get(t.integration_id) ?? [];
    existing.push({ name: t.tool_name, description: t.description });
    map.set(t.integration_id, existing);
  }
  return map;
}

export async function getNativeProxyCatalog(): Promise<CatalogEntry[]> {
  const toolsByIntegration = await loadProxyToolsByIntegration();

  return allProxyIntegrations.map((i) => {
    const dbTools = toolsByIntegration.get(i.id);
    const fallbackCount = i.fallbackTools?.length ?? 0;
    const tools = (dbTools && dbTools.length >= fallbackCount)
      ? dbTools
      : (i.fallbackTools ?? []).map((t) => ({ name: t.name, description: t.description }));
    return {
      id: `proxy:${i.id}`,
      name: i.name,
      description: i.description,
      kind: "native-proxy" as const,
      category: INTEGRATION_CATEGORIES[i.id],
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
  return [getPlatformCatalog(), ...builtin, ...nativeProxy, ...custom];
}
