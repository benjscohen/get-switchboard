"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScopeUserPicker } from "@/components/admin/scope-user-picker";

interface CatalogEntry {
  id: string;
  name: string;
  kind: string;
}

interface Member {
  id: string;
  name: string;
  role: string;
}

interface ScopesData {
  catalog: CatalogEntry[];
  scopes: Record<string, string[]>;
  members: Member[];
}

type ScopeState = "everyone" | "specific";

interface IntegrationScopeEdit {
  state: ScopeState;
  userIds: Set<string>;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "builtin": return "Builtin";
    case "native-proxy": return "Proxy";
    case "custom-mcp": return "Custom";
    default: return kind;
  }
}

export function IntegrationAccessScopes() {
  const [data, setData] = useState<ScopesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [edits, setEdits] = useState<Map<string, IntegrationScopeEdit>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/org/integration-scopes");
      if (res.ok) {
        const d: ScopesData = await res.json();
        setData(d);
        initEdits(d);
      } else {
        setError("Failed to load integration scopes");
      }
    } catch {
      setError("Failed to load integration scopes");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function initEdits(d: ScopesData) {
    const map = new Map<string, IntegrationScopeEdit>();
    for (const entry of d.catalog) {
      const scopedUsers = d.scopes[entry.id];
      if (scopedUsers !== undefined) {
        map.set(entry.id, { state: "specific", userIds: new Set(scopedUsers) });
      } else {
        map.set(entry.id, { state: "everyone", userIds: new Set() });
      }
    }
    setEdits(map);
  }

  function setScopeState(integrationId: string, state: ScopeState) {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(integrationId)!;
      next.set(integrationId, {
        state,
        userIds: state === "everyone" ? new Set() : current.userIds,
      });
      return next;
    });
  }

  function setUserIds(integrationId: string, userIds: Set<string>) {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(integrationId)!;
      next.set(integrationId, { ...current, userIds });
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    const scopes: Array<{ integrationId: string; userIds: string[] }> = [];
    for (const [integrationId, edit] of edits) {
      if (edit.state === "specific") {
        scopes.push({ integrationId, userIds: Array.from(edit.userIds) });
      }
    }

    try {
      const res = await fetch("/api/org/integration-scopes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes }),
      });

      if (res.ok) {
        setSuccess("Access scopes saved");
        setTimeout(() => setSuccess(""), 3000);
        // Optimistic update: rebuild scopes from current edits instead of re-fetching
        const newScopes: Record<string, string[]> = {};
        for (const [integrationId, edit] of edits) {
          if (edit.state === "specific") {
            newScopes[integrationId] = Array.from(edit.userIds);
          }
        }
        setData((prev) => prev ? { ...prev, scopes: newScopes } : prev);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to save");
      }
    } catch {
      setError("Failed to save");
    }

    setSaving(false);
  }

  if (loading) {
    return <p className="text-text-tertiary">Loading access scopes...</p>;
  }

  if (!data) {
    return <p className="text-red-500">{error || "Failed to load"}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Integration Access</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Restrict integrations to specific users. By default, all members have access. Org admins and owners always have access.
        </p>
      </div>

      <div className="space-y-3">
        {data.catalog.map((entry) => {
          const edit = edits.get(entry.id);
          if (!edit) return null;

          return (
            <Card key={entry.id} hover={false} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{entry.name}</span>
                  <Badge>{kindLabel(entry.kind)}</Badge>
                </div>
                <select
                  value={edit.state}
                  onChange={(e) =>
                    setScopeState(entry.id, e.target.value as ScopeState)
                  }
                  className="rounded-md border border-border bg-bg-primary px-2 py-1 text-sm outline-none focus:border-accent"
                >
                  <option value="everyone">Everyone</option>
                  <option value="specific">Specific users</option>
                </select>
              </div>

              {edit.state === "specific" && (
                <div className="mt-3">
                  <ScopeUserPicker
                    members={data.members}
                    selectedIds={edit.userIds}
                    onChange={(ids) => setUserIds(entry.id, ids)}
                  />
                  {edit.userIds.size === 0 && (
                    <p className="mt-1 text-xs text-text-tertiary">
                      No users selected — only org admins and owners will have access.
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save access scopes"}
        </Button>
        {success && <span className="text-sm text-green-500">{success}</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
