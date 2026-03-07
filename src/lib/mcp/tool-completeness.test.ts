/**
 * Completeness guard tests.
 *
 * These tests ensure that every integration and tool is properly registered
 * in CATEGORY_MAP, SEARCH_ENRICHMENTS, and the toolRiskMap.
 *
 * - CATEGORY_MAP: strictly required for ALL integration IDs.
 * - SEARCH_ENRICHMENTS + toolRiskMap: strictly required per-integration.
 *   Once any tool in an integration has coverage, ALL tools in that
 *   integration must be covered. This prevents partial additions.
 *
 * If you add a new integration, you MUST add it to CATEGORY_MAP and add
 * entries for all its tools in SEARCH_ENRICHMENTS and toolRiskMap.
 *
 * To backfill an existing uncovered integration, add its entries and
 * remove it from the UNCOVERED_* sets below. The sets must only shrink.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })),
  },
}));

import { allIntegrations } from "@/lib/integrations/registry";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { CATEGORY_MAP, SEARCH_ENRICHMENTS } from "./tool-search";
import { explicitlyClassifiedTools } from "./tool-risk";

// ── Integrations that still need tool-level backfill ──
// Remove from these sets as you add entries. NEVER add to them.

const UNCOVERED_ENRICHMENTS = new Set([
  // Builtin integrations (OAuth)
  "asana",          // 4 of 17 tools covered
  "google-ads",
  "google-calendar", // 5 of ~40 tools covered
  "google-docs",    // 5 of ~18 tools covered
  "google-drive",   // 4 of ~14 tools covered
  "google-gmail",   // 7 of ~17 tools covered
  "google-sheets",  // 14 of ~16 tools covered
  "google-slides",  // 2 of ~14 tools covered
  "hubspot-crm",
  "intercom",
  "linkedin-ads",
  // Proxy integrations
  "exa",            // 5 of 11 tools covered
  "firecrawl",
  "granola",
  "shortcut",
  "slack",          // 3 of 13 tools covered
]);

const UNCOVERED_RISK = new Set([
  // Builtin integrations
  "google-ads",
  "intercom",
  "linkedin-ads",
  // Proxy integrations
  "firecrawl",
  "granola",
  "shortcut",
  "slack",
]);

// ── Collect all integration IDs ──

const builtinIntegrationIds = allIntegrations.map((i) => i.id);
const proxyIntegrationIds = allProxyIntegrations.map((i) => i.id);
const allIntegrationIds = [...builtinIntegrationIds, ...proxyIntegrationIds];

// ── Collect tools grouped by integration ──

type ToolsByIntegration = Map<string, string[]>;

const builtinToolsByIntegration: ToolsByIntegration = new Map();
for (const integration of allIntegrations) {
  builtinToolsByIntegration.set(
    integration.id,
    integration.tools.map((t) => t.name),
  );
}

const proxyToolsByIntegration: ToolsByIntegration = new Map();
for (const proxy of allProxyIntegrations) {
  proxyToolsByIntegration.set(
    proxy.id,
    (proxy.fallbackTools ?? []).map((t) => t.name),
  );
}

function getToolsForCoveredIntegrations(
  toolsMap: ToolsByIntegration,
  uncoveredSet: Set<string>,
): string[] {
  const tools: string[] = [];
  for (const [integrationId, names] of toolsMap) {
    if (!uncoveredSet.has(integrationId)) {
      tools.push(...names);
    }
  }
  return tools;
}

// ── Tests ──

describe("CATEGORY_MAP completeness", () => {
  it("covers every builtin integration ID", () => {
    const missing = builtinIntegrationIds.filter((id) => !(id in CATEGORY_MAP));
    expect(missing, `Missing from CATEGORY_MAP: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers every proxy integration ID", () => {
    const missing = proxyIntegrationIds.filter((id) => !(id in CATEGORY_MAP));
    expect(missing, `Missing from CATEGORY_MAP: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("SEARCH_ENRICHMENTS completeness", () => {
  const coveredBuiltinTools = getToolsForCoveredIntegrations(builtinToolsByIntegration, UNCOVERED_ENRICHMENTS);
  const coveredProxyTools = getToolsForCoveredIntegrations(proxyToolsByIntegration, UNCOVERED_ENRICHMENTS);

  it("covers all tools in enrichment-covered builtin integrations", () => {
    const missing = coveredBuiltinTools.filter((name) => !(name in SEARCH_ENRICHMENTS));
    expect(missing, `Missing from SEARCH_ENRICHMENTS: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers all tools in enrichment-covered proxy integrations", () => {
    const missing = coveredProxyTools.filter((name) => !(name in SEARCH_ENRICHMENTS));
    expect(missing, `Missing from SEARCH_ENRICHMENTS: ${missing.join(", ")}`).toEqual([]);
  });

  it("every enrichment has non-empty useWhen and aliases", () => {
    for (const [name, enrichment] of Object.entries(SEARCH_ENRICHMENTS)) {
      expect(enrichment.useWhen, `${name}.useWhen is empty`).toBeTruthy();
      expect(enrichment.aliases, `${name}.aliases is empty`).toBeTruthy();
    }
  });

  it("UNCOVERED_ENRICHMENTS only contains known integration IDs", () => {
    const knownIds = new Set(allIntegrationIds);
    const invalid = [...UNCOVERED_ENRICHMENTS].filter((id) => !knownIds.has(id));
    expect(invalid, `Stale UNCOVERED_ENRICHMENTS entries: ${invalid.join(", ")}`).toEqual([]);
  });
});

describe("toolRiskMap completeness", () => {
  const coveredBuiltinTools = getToolsForCoveredIntegrations(builtinToolsByIntegration, UNCOVERED_RISK);
  const coveredProxyTools = getToolsForCoveredIntegrations(proxyToolsByIntegration, UNCOVERED_RISK);

  it("explicitly classifies all tools in risk-covered builtin integrations", () => {
    const missing = coveredBuiltinTools.filter((name) => !explicitlyClassifiedTools.has(name));
    expect(missing, `Missing from toolRiskMap: ${missing.join(", ")}`).toEqual([]);
  });

  it("explicitly classifies all tools in risk-covered proxy integrations", () => {
    const missing = coveredProxyTools.filter((name) => !explicitlyClassifiedTools.has(name));
    expect(missing, `Missing from toolRiskMap: ${missing.join(", ")}`).toEqual([]);
  });

  it("UNCOVERED_RISK only contains known integration IDs", () => {
    const knownIds = new Set(allIntegrationIds);
    const invalid = [...UNCOVERED_RISK].filter((id) => !knownIds.has(id));
    expect(invalid, `Stale UNCOVERED_RISK entries: ${invalid.join(", ")}`).toEqual([]);
  });
});

describe("cross-consistency", () => {
  it("all tool names are unique across integrations", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const integration of allIntegrations) {
      for (const tool of integration.tools) {
        if (seen.has(tool.name)) {
          duplicates.push(`${tool.name} (in ${integration.id} and ${seen.get(tool.name)})`);
        }
        seen.set(tool.name, integration.id);
      }
    }
    for (const proxy of allProxyIntegrations) {
      for (const tool of proxy.fallbackTools ?? []) {
        if (seen.has(tool.name)) {
          duplicates.push(`${tool.name} (in ${proxy.id} and ${seen.get(tool.name)})`);
        }
        seen.set(tool.name, proxy.id);
      }
    }

    expect(duplicates, `Duplicate tool names: ${duplicates.join("; ")}`).toEqual([]);
  });

  it("CATEGORY_MAP has no stale entries", () => {
    const knownIds = new Set([...allIntegrationIds, "platform", "vault"]);
    const stale = Object.keys(CATEGORY_MAP).filter((id) => !knownIds.has(id));
    expect(stale, `Stale CATEGORY_MAP entries: ${stale.join(", ")}`).toEqual([]);
  });
});
