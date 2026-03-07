"use client";

import { useState, useEffect, useMemo } from "react";

interface CatalogTool {
  name: string;
  description: string;
}

interface CatalogIntegration {
  id: string;
  name: string;
  description: string;
  kind: string;
  category: string;
  connected: boolean;
  toolCount: number;
  tools: CatalogTool[];
}

interface ToolAccessPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
}

const CATEGORY_ORDER = [
  "platform",
  "messaging",
  "calendar",
  "email",
  "documents",
  "storage",
  "development",
  "productivity",
  "crm",
  "advertising",
  "search",
  "notes",
  "custom",
  "other",
];

const CATEGORY_LABELS: Record<string, string> = {
  platform: "Platform",
  messaging: "Messaging",
  calendar: "Calendar",
  email: "Email",
  documents: "Documents",
  storage: "Storage",
  development: "Development",
  productivity: "Productivity",
  crm: "CRM",
  advertising: "Advertising",
  search: "Search",
  notes: "Notes",
  custom: "Custom",
  other: "Other",
};

export function ToolAccessPicker({ value, onChange }: ToolAccessPickerProps) {
  const [catalog, setCatalog] = useState<CatalogIntegration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/integrations/catalog")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch catalog");
        return r.json();
      })
      .then((data) => setCatalog(data.integrations))
      .catch((e) => setError(e.message));
  }, []);

  const grouped = useMemo(() => {
    if (!catalog) return new Map<string, CatalogIntegration[]>();
    const map = new Map<string, CatalogIntegration[]>();

    const lowerFilter = filter.toLowerCase();
    const filtered = lowerFilter
      ? catalog.filter(
          (i) =>
            i.name.toLowerCase().includes(lowerFilter) ||
            i.id.toLowerCase().includes(lowerFilter) ||
            i.tools.some((t) => t.name.toLowerCase().includes(lowerFilter))
        )
      : catalog;

    for (const integration of filtered) {
      const cat = integration.category || "other";
      const existing = map.get(cat) ?? [];
      existing.push(integration);
      map.set(cat, existing);
    }
    return map;
  }, [catalog, filter]);

  const sortedCategories = useMemo(() => {
    return [...grouped.keys()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a) === -1 ? 99 : CATEGORY_ORDER.indexOf(a)) -
                (CATEGORY_ORDER.indexOf(b) === -1 ? 99 : CATEGORY_ORDER.indexOf(b))
    );
  }, [grouped]);

  function getIntegrationState(integration: CatalogIntegration): "all" | "some" | "none" {
    if (value.includes(integration.id)) return "all";
    const prefix = `${integration.id}:`;
    const specificTools = value.filter((v) => v.startsWith(prefix));
    if (specificTools.length === 0) return "none";
    if (specificTools.length >= integration.tools.length) return "all";
    return "some";
  }

  function toggleIntegration(integration: CatalogIntegration) {
    const state = getIntegrationState(integration);
    const prefix = `${integration.id}:`;
    // Remove all entries for this integration
    const without = value.filter((v) => v !== integration.id && !v.startsWith(prefix));
    if (state === "all") {
      // Uncheck all
      onChange(without);
    } else {
      // Check all (use bare integration ID)
      onChange([...without, integration.id]);
    }
  }

  function toggleTool(integrationId: string, toolName: string, integration: CatalogIntegration) {
    const entry = `${integrationId}:${toolName}`;
    const prefix = `${integrationId}:`;

    if (value.includes(integrationId)) {
      // Was "all tools" — switching to all-minus-one
      const allToolEntries = integration.tools
        .filter((t) => t.name !== toolName)
        .map((t) => `${integrationId}:${t.name}`);
      const without = value.filter((v) => v !== integrationId);
      onChange([...without, ...allToolEntries]);
    } else if (value.includes(entry)) {
      // Unchecking a specific tool
      onChange(value.filter((v) => v !== entry));
    } else {
      // Checking a specific tool — may consolidate to bare ID
      const newValue = [...value, entry];
      const specificTools = newValue.filter((v) => v.startsWith(prefix));
      if (specificTools.length >= integration.tools.length) {
        // All tools selected → consolidate
        const without = newValue.filter((v) => !v.startsWith(prefix));
        onChange([...without, integrationId]);
      } else {
        onChange(newValue);
      }
    }
  }

  function isToolChecked(integrationId: string, toolName: string): boolean {
    if (value.includes(integrationId)) return true;
    return value.includes(`${integrationId}:${toolName}`);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (error) {
    return <div className="text-sm text-red-500">Failed to load integrations: {error}</div>;
  }

  if (!catalog) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-bg-hover" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Filter integrations or tools..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {sortedCategories.map((category) => {
        const integrations = grouped.get(category) ?? [];
        return (
          <div key={category}>
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {CATEGORY_LABELS[category] ?? category}
            </h4>
            <div className="space-y-1">
              {integrations.map((integration) => {
                const state = getIntegrationState(integration);
                const isExpanded = expandedIds.has(integration.id);

                return (
                  <div key={integration.id} className="rounded-lg border border-border bg-bg">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={state === "all"}
                        ref={(el) => {
                          if (el) el.indeterminate = state === "some";
                        }}
                        onChange={() => toggleIntegration(integration)}
                        className="shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => toggleExpand(integration.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="text-sm font-medium text-text-primary truncate">
                          {integration.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-tertiary">
                          {integration.toolCount}
                        </span>
                        {integration.connected ? (
                          <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-green-500" title="Connected" />
                        ) : (
                          <span className="shrink-0 text-[10px] text-text-tertiary">not connected</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleExpand(integration.id)}
                        className="shrink-0 text-text-tertiary hover:text-text-primary transition-transform"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        >
                          <path d="M3 5l4 4 4-4" />
                        </svg>
                      </button>
                    </div>

                    {isExpanded && integration.tools.length > 0 && (
                      <div className="border-t border-border px-3 py-2 space-y-1">
                        {integration.tools.map((tool) => (
                          <label
                            key={tool.name}
                            className="flex items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-bg-hover"
                          >
                            <input
                              type="checkbox"
                              checked={isToolChecked(integration.id, tool.name)}
                              onChange={() => toggleTool(integration.id, tool.name, integration)}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="font-mono text-text-primary">{tool.name}</span>
                              {tool.description && (
                                <span className="ml-1.5 text-text-tertiary">{tool.description}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
