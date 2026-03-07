import type { CatalogEntry } from "@/lib/integrations/types";

// Legacy underscore → canonical hyphenated ID mapping
const LEGACY_ID_MAP: Record<string, string> = {
  google_calendar: "google-calendar",
  google_gmail: "google-gmail",
  google_docs: "google-docs",
  google_drive: "google-drive",
  google_sheets: "google-sheets",
  google_slides: "google-slides",
  google_ads: "google-ads",
  hubspot_crm: "hubspot-crm",
  linkedin_ads: "linkedin-ads",
};

export type ToolAccessEntry =
  | { type: "integration"; integrationId: string }
  | { type: "tool"; integrationId: string; toolName: string };

/**
 * Parse a tool_access string entry into its structured form.
 * "slack" → whole integration
 * "slack:slack_send_message" → specific tool
 */
export function parseToolAccessEntry(entry: string): ToolAccessEntry {
  const colonIdx = entry.indexOf(":");
  if (colonIdx === -1) {
    return { type: "integration", integrationId: normalizeLegacyId(entry) };
  }
  const integrationId = normalizeLegacyId(entry.slice(0, colonIdx));
  const toolName = entry.slice(colonIdx + 1);
  return { type: "tool", integrationId, toolName };
}

/** Convert a legacy underscore ID to the canonical hyphenated ID. */
export function normalizeLegacyId(id: string): string {
  return LEGACY_ID_MAP[id] ?? id;
}

/** Normalize all entries in a tool_access array, fixing legacy IDs. */
export function normalizeToolAccess(entries: string[]): string[] {
  return entries.map((entry) => {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) {
      return normalizeLegacyId(entry);
    }
    const prefix = entry.slice(0, colonIdx);
    const rest = entry.slice(colonIdx + 1);
    return `${normalizeLegacyId(prefix)}:${rest}`;
  });
}

/** Check if an integration has all its tools selected (either via bare ID or all individual tools). */
export function isIntegrationFullySelected(
  integrationId: string,
  toolAccess: string[],
  catalogToolNames: string[],
): boolean {
  // Check if bare integration ID is present
  if (toolAccess.includes(integrationId)) return true;
  // Check if every tool in the catalog is individually listed
  if (catalogToolNames.length === 0) return false;
  return catalogToolNames.every((t) => toolAccess.includes(`${integrationId}:${t}`));
}

/** Get selected tools for a specific integration from a tool_access array. */
export function getSelectedToolsForIntegration(
  integrationId: string,
  toolAccess: string[],
): { allTools: boolean; selectedTools: string[] } {
  if (toolAccess.includes(integrationId)) {
    return { allTools: true, selectedTools: [] };
  }
  const prefix = `${integrationId}:`;
  const selected = toolAccess
    .filter((e) => e.startsWith(prefix))
    .map((e) => e.slice(prefix.length));
  return { allTools: false, selectedTools: selected };
}

/** Build a tool_access entry string. */
export function buildToolAccessEntry(integrationId: string, toolName?: string): string {
  return toolName ? `${integrationId}:${toolName}` : integrationId;
}

export interface ToolAccessDisplayItem {
  integrationId: string;
  integrationName: string;
  allTools: boolean;
  selectedToolCount: number;
  totalToolCount: number;
  selectedToolNames: string[];
  label: string;
}

/**
 * Resolve the catalog integration ID from a tool_access integration ID.
 * Handles proxy: prefix mapping (tool_access uses "slack", catalog has "proxy:slack").
 */
function findCatalogEntry(integrationId: string, catalog: CatalogEntry[]): CatalogEntry | undefined {
  return (
    catalog.find((c) => c.id === integrationId) ??
    catalog.find((c) => c.id === `proxy:${integrationId}`)
  );
}

/** Format tool_access entries into human-readable display data. */
export function formatToolAccessForDisplay(
  toolAccess: string[],
  catalog: CatalogEntry[],
): ToolAccessDisplayItem[] {
  // Group entries by integration ID
  const grouped = new Map<string, { allTools: boolean; tools: string[] }>();
  for (const entry of toolAccess) {
    const parsed = parseToolAccessEntry(entry);
    const existing = grouped.get(parsed.integrationId);
    if (parsed.type === "integration") {
      grouped.set(parsed.integrationId, { allTools: true, tools: existing?.tools ?? [] });
    } else {
      if (existing) {
        existing.tools.push(parsed.toolName);
      } else {
        grouped.set(parsed.integrationId, { allTools: false, tools: [parsed.toolName] });
      }
    }
  }

  const items: ToolAccessDisplayItem[] = [];
  for (const [integrationId, { allTools, tools }] of grouped) {
    const entry = findCatalogEntry(integrationId, catalog);
    const name = entry?.name ?? integrationId;
    const totalCount = entry?.toolCount ?? 0;

    if (allTools) {
      items.push({
        integrationId,
        integrationName: name,
        allTools: true,
        selectedToolCount: totalCount,
        totalToolCount: totalCount,
        selectedToolNames: [],
        label: `${name} (all tools)`,
      });
    } else {
      items.push({
        integrationId,
        integrationName: name,
        allTools: false,
        selectedToolCount: tools.length,
        totalToolCount: totalCount,
        selectedToolNames: tools,
        label: totalCount > 0
          ? `${name} (${tools.length}/${totalCount} tools)`
          : `${name} (${tools.length} tools)`,
      });
    }
  }

  return items;
}
