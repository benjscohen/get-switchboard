"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface CatalogIntegration {
  id: string;
  name: string;
  tools: string[];
}

interface IntegrationPermission {
  integrationId: string;
  allowedTools: string[];
}

interface PermissionsData {
  permissionsMode: string;
  integrations: IntegrationPermission[];
  catalog: CatalogIntegration[];
}

interface PermissionsEditorProps {
  userId: string;
  isSelf: boolean;
}

export function PermissionsEditor({ userId, isSelf }: PermissionsEditorProps) {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Local editing state
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [editIntegrations, setEditIntegrations] = useState<
    Map<string, { enabled: boolean; allTools: boolean; selectedTools: Set<string> }>
  >(new Map());

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/users/${userId}/permissions`);
    if (res.ok) {
      const d: PermissionsData = await res.json();
      setData(d);
      setMode(d.permissionsMode as "full" | "custom");
      initEditState(d);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  function initEditState(d: PermissionsData) {
    const map = new Map<
      string,
      { enabled: boolean; allTools: boolean; selectedTools: Set<string> }
    >();
    for (const cat of d.catalog) {
      const existing = d.integrations.find((i) => i.integrationId === cat.id);
      map.set(cat.id, {
        enabled: !!existing,
        allTools: existing ? existing.allowedTools.length === 0 : true,
        selectedTools: new Set(existing?.allowedTools ?? []),
      });
    }
    setEditIntegrations(map);
  }

  function toggleIntegration(integrationId: string) {
    setEditIntegrations((prev) => {
      const next = new Map(prev);
      const current = next.get(integrationId)!;
      next.set(integrationId, { ...current, enabled: !current.enabled });
      return next;
    });
  }

  function toggleAllTools(integrationId: string) {
    setEditIntegrations((prev) => {
      const next = new Map(prev);
      const current = next.get(integrationId)!;
      next.set(integrationId, {
        ...current,
        allTools: !current.allTools,
        selectedTools: new Set(),
      });
      return next;
    });
  }

  function toggleTool(integrationId: string, toolName: string) {
    setEditIntegrations((prev) => {
      const next = new Map(prev);
      const current = next.get(integrationId)!;
      const tools = new Set(current.selectedTools);
      if (tools.has(toolName)) {
        tools.delete(toolName);
      } else {
        tools.add(toolName);
      }
      next.set(integrationId, { ...current, selectedTools: tools });
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    const integrations: IntegrationPermission[] = [];
    if (mode === "custom") {
      for (const [integrationId, state] of editIntegrations) {
        if (state.enabled) {
          integrations.push({
            integrationId,
            allowedTools: state.allTools ? [] : Array.from(state.selectedTools),
          });
        }
      }
    }

    const res = await fetch(`/api/admin/users/${userId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionsMode: mode, integrations }),
    });

    if (res.ok) {
      setSuccess("Permissions saved");
      setTimeout(() => setSuccess(""), 3000);
      fetchPermissions();
    } else {
      const d = await res.json();
      setError(d.error || "Failed to save");
    }

    setSaving(false);
  }

  if (loading) {
    return <p className="text-text-tertiary">Loading permissions...</p>;
  }

  if (!data) {
    return <p className="text-red-500">Failed to load permissions</p>;
  }

  if (isSelf) {
    return (
      <p className="text-sm text-text-secondary">
        You cannot modify your own access permissions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="permMode"
            value="full"
            checked={mode === "full"}
            onChange={() => setMode("full")}
            className="accent-accent"
          />
          Full access
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="permMode"
            value="custom"
            checked={mode === "custom"}
            onChange={() => setMode("custom")}
            className="accent-accent"
          />
          Custom
        </label>
      </div>

      {mode === "full" && (
        <p className="text-sm text-text-secondary">
          This user can access all integrations and tools.
        </p>
      )}

      {/* Integration cards (only in custom mode) */}
      {mode === "custom" && (
        <div className="space-y-3">
          {data.catalog.map((integration) => {
            const state = editIntegrations.get(integration.id);
            if (!state) return null;

            const selectedCount = state.allTools
              ? integration.tools.length
              : state.selectedTools.size;

            return (
              <Card key={integration.id} hover={false} className="p-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={() => toggleIntegration(integration.id)}
                      className="accent-accent h-4 w-4"
                    />
                    <span className="font-medium">{integration.name}</span>
                  </label>
                  {state.enabled && (
                    <span className="text-xs text-text-secondary">
                      {selectedCount} of {integration.tools.length} tools
                    </span>
                  )}
                </div>

                {state.enabled && (
                  <div className="mt-3 ml-7 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={state.allTools}
                        onChange={() => toggleAllTools(integration.id)}
                        className="accent-accent"
                      />
                      All tools
                    </label>

                    {!state.allTools && (
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {integration.tools.map((tool) => (
                          <label
                            key={tool}
                            className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-bg-hover"
                          >
                            <input
                              type="checkbox"
                              checked={state.selectedTools.has(tool)}
                              onChange={() =>
                                toggleTool(integration.id, tool)
                              }
                              className="accent-accent"
                            />
                            <span className="truncate" title={tool}>
                              {tool}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save permissions"}
        </Button>
        {success && <span className="text-sm text-green-500">{success}</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
