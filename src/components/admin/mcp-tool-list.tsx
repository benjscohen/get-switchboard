"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Tool {
  id: string;
  toolName: string;
  description: string;
  enabled: boolean;
}

interface McpToolListProps {
  serverId: string;
  tools: Tool[];
  onUpdated: () => void;
}

export function McpToolList({ serverId, tools, onUpdated }: McpToolListProps) {
  const [localTools, setLocalTools] = useState(tools);
  const [saving, setSaving] = useState(false);

  const hasChanges = tools.some(
    (t) => t.enabled !== localTools.find((lt) => lt.id === t.id)?.enabled
  );

  function toggleTool(toolName: string) {
    setLocalTools((prev) =>
      prev.map((t) =>
        t.toolName === toolName ? { ...t, enabled: !t.enabled } : t
      )
    );
  }

  function toggleAll(enabled: boolean) {
    setLocalTools((prev) => prev.map((t) => ({ ...t, enabled })));
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/admin/mcp-servers/${serverId}/tools`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: localTools.map((t) => ({
          toolName: t.toolName,
          enabled: t.enabled,
        })),
      }),
    });

    if (res.ok) {
      onUpdated();
    }
    setSaving(false);
  }

  const enabledCount = localTools.filter((t) => t.enabled).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {enabledCount} of {localTools.length} tools enabled
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => toggleAll(true)}
            className="text-xs text-accent hover:underline"
          >
            Enable all
          </button>
          <button
            onClick={() => toggleAll(false)}
            className="text-xs text-text-secondary hover:underline"
          >
            Disable all
          </button>
        </div>
      </div>

      <div className="grid gap-1 max-h-64 overflow-y-auto">
        {localTools.map((tool) => (
          <label
            key={tool.toolName}
            className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-bg-hover"
          >
            <input
              type="checkbox"
              checked={tool.enabled}
              onChange={() => toggleTool(tool.toolName)}
              className="accent-accent mt-0.5"
            />
            <div className="min-w-0">
              <code className="text-accent font-mono">{tool.toolName}</code>
              {tool.description && (
                <p className="text-text-secondary truncate">{tool.description}</p>
              )}
            </div>
          </label>
        ))}
      </div>

      {hasChanges && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save tool changes"}
        </Button>
      )}
    </div>
  );
}
