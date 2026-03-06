"use client";

import { useState } from "react";

type Integration = {
  id: string;
  name: string;
  tools: { name: string; description: string }[];
};

type PermissionsPickerProps = {
  integrations: Integration[];
  value: Record<string, string[] | null>;
  onChange: (permissions: Record<string, string[] | null>) => void;
};

export function PermissionsPicker({ integrations, value, onChange }: PermissionsPickerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...integrations].sort((a, b) => a.name.localeCompare(b.name));

  function toggleIntegration(id: string) {
    const next = { ...value };
    if (id in next) {
      delete next[id];
    } else {
      next[id] = null; // all tools
    }
    onChange(next);
  }

  function setToolSelection(integrationId: string, tools: string[]) {
    const integration = integrations.find((i) => i.id === integrationId);
    const allToolNames = integration?.tools.map((t) => t.name) ?? [];
    // If all tools selected, store as null (meaning "all")
    if (tools.length === allToolNames.length) {
      onChange({ ...value, [integrationId]: null });
    } else {
      onChange({ ...value, [integrationId]: tools });
    }
  }

  function toggleTool(integrationId: string, toolName: string) {
    const integration = integrations.find((i) => i.id === integrationId);
    const allToolNames = integration?.tools.map((t) => t.name) ?? [];
    const current = value[integrationId];
    // null means all tools — convert to explicit list minus the toggled tool
    const currentList = current === null ? allToolNames : (current ?? []);

    if (currentList.includes(toolName)) {
      const next = currentList.filter((t) => t !== toolName);
      if (next.length === 0) {
        // No tools left — remove integration entirely
        const nextValue = { ...value };
        delete nextValue[integrationId];
        onChange(nextValue);
      } else {
        onChange({ ...value, [integrationId]: next });
      }
    } else {
      setToolSelection(integrationId, [...currentList, toolName]);
    }
  }

  function getToolSummary(integrationId: string, integration: Integration): string {
    const perms = value[integrationId];
    if (perms === null || perms === undefined) return `${integration.tools.length} tools · All`;
    return `${perms.length} of ${integration.tools.length} tools`;
  }

  return (
    <div className="space-y-1">
      {sorted.map((integration) => {
        const isSelected = integration.id in value;
        const isExpanded = expandedId === integration.id;
        return (
          <div key={integration.id}>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-secondary/50">
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleIntegration(integration.id)}
                  className="h-3.5 w-3.5 rounded border-border accent-accent"
                />
                <span className="text-sm font-medium">{integration.name}</span>
                {isSelected && (
                  <span className="text-xs text-text-tertiary">
                    {getToolSummary(integration.id, integration)}
                  </span>
                )}
              </label>
              {isSelected && integration.tools.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : integration.id)}
                  className="p-1 text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
              )}
            </div>
            {isSelected && isExpanded && (
              <div className="ml-7 space-y-0.5 pb-1">
                {integration.tools.map((tool) => {
                  const perms = value[integration.id];
                  const isChecked = perms === null ? true : (perms ?? []).includes(tool.name);
                  return (
                    <label
                      key={tool.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-bg-secondary/50"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTool(integration.id, tool.name)}
                        className="h-3 w-3 rounded border-border accent-accent"
                      />
                      <span className="text-xs font-mono text-text-secondary">{tool.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <p className="px-2 pt-1 text-xs text-text-tertiary">
        Platform tools (memory, files, vault, skills) are always included.
      </p>
    </div>
  );
}
