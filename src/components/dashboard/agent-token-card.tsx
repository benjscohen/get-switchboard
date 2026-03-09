"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AGENT_MODELS, modelLabel } from "@/lib/agent-models";
import { PermissionsForm } from "./permissions-form";

type AvailableIntegration = {
  id: string;
  name: string;
  tools: { name: string; description: string }[];
};

interface AgentTokenCardProps {
  initialAgentKey: {
    id: string;
    keyPrefix: string;
    createdAt: string;
    expiresAt: string;
    permissions: Record<string, string[] | null> | null;
  } | null;
  preferredAgentModel: string;
  availableIntegrations: AvailableIntegration[];
  initialShowThinking: boolean;
  initialChromeMcpEnabled: boolean;
}

function permsSummary(
  permissions: Record<string, string[] | null> | null
): string {
  if (!permissions) return "Full access";
  const ids = Object.keys(permissions);
  if (ids.length === 0) return "No integrations";
  if (ids.length === 1) return "1 integration";
  return `${ids.length} integrations`;
}

export function AgentTokenCard({
  initialAgentKey,
  preferredAgentModel,
  availableIntegrations,
  initialShowThinking,
  initialChromeMcpEnabled,
}: AgentTokenCardProps) {
  const [agentKey, setAgentKey] = useState(initialAgentKey);
  const [model, setModel] = useState(preferredAgentModel);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(initialShowThinking);
  const [savingThinking, setSavingThinking] = useState(false);
  const [chromeMcpEnabled, setChromeMcpEnabled] = useState(initialChromeMcpEnabled);
  const [savingChromeMcp, setSavingChromeMcp] = useState(false);

  // Permissions form state (shared between enable + edit flows)
  const [permMode, setPermMode] = useState<"all" | "specific">("all");
  const [permissions, setPermissions] = useState<
    Record<string, string[] | null>
  >({});
  const [permsExpanded, setPermsExpanded] = useState(false);
  const [editingPerms, setEditingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  function effectivePermissions(): Record<string, string[] | null> | null {
    return permMode === "specific" ? permissions : null;
  }

  async function enable() {
    setLoading(true);
    const perms = permsExpanded ? effectivePermissions() : null;
    const res = await fetch("/api/keys/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: perms, model }),
    });
    if (res.ok) {
      const data = await res.json();
      setAgentKey({
        id: data.id,
        keyPrefix: data.prefix,
        createdAt: new Date().toISOString(),
        expiresAt: data.expiresAt,
        permissions: perms,
      });
      setPermsExpanded(false);
      setPermMode("all");
      setPermissions({});
    }
    setLoading(false);
  }

  async function disable() {
    if (!confirm("Disable the Slack Agent? This will revoke its access key."))
      return;
    const res = await fetch("/api/keys/agent", { method: "DELETE" });
    if (res.ok) {
      setAgentKey(null);
      setSettingsOpen(false);
    }
  }

  async function updateModel(newModel: string) {
    setModel(newModel);
    await fetch("/api/agent/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: newModel }),
    });
  }

  async function toggleShowThinking() {
    setSavingThinking(true);
    const next = !showThinking;
    try {
      const res = await fetch("/api/agent/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showThinking: next }),
      });
      if (res.ok) {
        setShowThinking(next);
      }
    } finally {
      setSavingThinking(false);
    }
  }

  async function toggleChromeMcp() {
    setSavingChromeMcp(true);
    const next = !chromeMcpEnabled;
    try {
      const res = await fetch("/api/agent/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chromeMcpEnabled: next }),
      });
      if (res.ok) {
        setChromeMcpEnabled(next);
      }
    } finally {
      setSavingChromeMcp(false);
    }
  }

  async function savePermissions() {
    setSavingPerms(true);
    const perms = effectivePermissions();
    const res = await fetch("/api/keys/agent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: perms }),
    });
    if (res.ok) {
      setAgentKey((prev) =>
        prev ? { ...prev, permissions: perms } : prev
      );
      setEditingPerms(false);
    }
    setSavingPerms(false);
  }

  function openEditPerms() {
    if (agentKey?.permissions) {
      setPermMode("specific");
      setPermissions({ ...agentKey.permissions });
    } else {
      setPermMode("all");
      setPermissions({});
    }
    setEditingPerms(true);
  }

  const modelSelect = (
    <select
      value={model}
      onChange={(e) => updateModel(e.target.value)}
      className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
    >
      {AGENT_MODELS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );

  // State A — Not enabled
  if (!agentKey) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="text-text-secondary"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="4"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="9" cy="10" r="1.5" fill="currentColor" />
            <circle cx="15" cy="10" r="1.5" fill="currentColor" />
            <path
              d="M9 15c0 0 1.5 1.5 3 1.5s3-1.5 3-1.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <h2 className="text-sm font-medium">Slack Agent</h2>
        </div>
        <p className="mb-4 text-xs text-text-tertiary">
          DM the Switchboard Agent bot in Slack to use your integrations via AI.
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Model
          </label>
          {modelSelect}
        </div>

        {availableIntegrations.length > 0 && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setPermsExpanded(!permsExpanded)}
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-primary"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${permsExpanded ? "rotate-90" : ""}`}
              >
                <path d="M6 4l4 4-4 4" />
              </svg>
              Restrict to specific integrations or tools
            </button>
            {permsExpanded && (
              <div className="mt-2">
                <PermissionsForm
                  mode={permMode}
                  onModeChange={setPermMode}
                  permissions={permissions}
                  onPermissionsChange={setPermissions}
                  integrations={availableIntegrations}
                  radioName="agent-perm-mode"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={enable} disabled={loading}>
            {loading ? "Enabling..." : "Enable Slack Agent"}
          </Button>
        </div>
      </div>
    );
  }

  // State B — Enabled
  return (
    <div className="rounded-xl border border-border bg-bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="shrink-0 text-green-500"
          >
            <path
              d="M3 8.5L6.5 12L13 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-medium">Slack Agent</span>
          <span className="text-text-tertiary">·</span>
          <span className="text-text-tertiary">{modelLabel(model)}</span>
        </div>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-text-primary"
        >
          Settings
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${settingsOpen ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>

      {settingsOpen && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Model
            </label>
            {modelSelect}
          </div>

          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-secondary">Show Thinking</p>
              <p className="text-xs text-text-tertiary mt-0.5">
                Show a real-time status line in Slack threads while the agent works.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showThinking}
              disabled={savingThinking}
              onClick={toggleShowThinking}
              className={`relative ml-4 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
                showThinking ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  showThinking ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-secondary">Chrome DevTools</p>
              <p className="text-xs text-text-tertiary mt-0.5">
                Enable browser control tools for navigating pages, taking screenshots, and debugging.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={chromeMcpEnabled}
              disabled={savingChromeMcp}
              onClick={toggleChromeMcp}
              className={`relative ml-4 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
                chromeMcpEnabled ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  chromeMcpEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Permissions
            </label>
            <p className="text-xs text-text-tertiary">
              {permsSummary(agentKey.permissions)}
            </p>
            {!editingPerms ? (
              <button
                type="button"
                onClick={openEditPerms}
                className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-primary"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform"
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
                Edit permissions
              </button>
            ) : (
              <div className="mt-2">
                <PermissionsForm
                  mode={permMode}
                  onModeChange={setPermMode}
                  permissions={permissions}
                  onPermissionsChange={setPermissions}
                  integrations={availableIntegrations}
                  radioName="agent-edit-perm-mode"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={savePermissions}
                    disabled={savingPerms}
                  >
                    {savingPerms ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingPerms(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={disable}
            className="cursor-pointer text-xs text-red-400 transition-colors hover:text-red-300"
          >
            Disable Slack Agent
          </button>
        </div>
      )}
    </div>
  );
}
