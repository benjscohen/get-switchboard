"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { AGENT_MODELS } from "@/lib/agent-models";

const AVAILABLE_INTEGRATIONS = [
  { id: "platform", label: "Switchboard Platform" },
  { id: "slack", label: "Slack" },
  { id: "google_calendar", label: "Google Calendar" },
  { id: "google_gmail", label: "Gmail" },
  { id: "google_docs", label: "Google Docs" },
  { id: "google_drive", label: "Google Drive" },
  { id: "asana", label: "Asana" },
  { id: "github", label: "GitHub" },
  { id: "linear", label: "Linear" },
];

const MODEL_OPTIONS = [
  { value: "", label: "Default (no preference)" },
  ...AGENT_MODELS.map((m) => ({ value: m.value, label: m.label })),
];

interface Agent {
  id?: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string;
  toolAccess: string[];
  model: string | null;
  scope: "organization" | "team" | "user";
  teamId?: string;
  enabled: boolean;
}

interface Team {
  id: string;
  name: string;
}

interface AgentEditorProps {
  agent?: Agent;
  teams: Team[];
  defaultScope: "organization" | "team" | "user";
  canEditOrg: boolean;
  canEditTeamIds: string[];
  onSave: (agent: Partial<Agent>) => Promise<void>;
  onClose: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AgentEditor({
  agent,
  teams,
  defaultScope,
  canEditOrg,
  canEditTeamIds,
  onSave,
  onClose,
}: AgentEditorProps) {
  const [name, setName] = useState(agent?.name ?? "");
  const [slug, setSlug] = useState(agent?.slug ?? "");
  const [autoSlug, setAutoSlug] = useState(!agent);
  const [description, setDescription] = useState(agent?.description ?? "");
  const [instructions, setInstructions] = useState(agent?.instructions ?? "");
  const [toolAccess, setToolAccess] = useState<string[]>(agent?.toolAccess ?? []);
  const [model, setModel] = useState(agent?.model ?? "");
  const [scope, setScope] = useState<"organization" | "team" | "user">(
    agent?.scope ?? defaultScope
  );
  const [teamId, setTeamId] = useState(agent?.teamId ?? teams[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEscapeKey(onClose);

  useEffect(() => {
    if (autoSlug) setSlug(slugify(name));
  }, [name, autoSlug]);

  async function handleSave() {
    if (!name.trim() || !instructions.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug,
        description: description.trim(),
        instructions: instructions.trim(),
        toolAccess,
        model: model || null,
        scope,
        teamId: scope === "team" ? teamId : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const scopeOptions = [];
  if (canEditOrg) scopeOptions.push({ value: "organization", label: "Organization" });
  if (canEditTeamIds.length > 0) scopeOptions.push({ value: "team", label: "Team" });
  scopeOptions.push({ value: "user", label: "Personal" });

  const prefix = scope === "organization" ? "org" : scope === "team" ? "team" : "user";
  const promptName = `agent:${prefix}:${slug || "..."}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border p-6 pb-4">
          <h2 className="text-lg font-semibold">{agent ? "Edit Agent" : "New Agent"}</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Scope selector (only for new agents) */}
          {!agent && scopeOptions.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Scope</label>
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value as "organization" | "team" | "user")}
                options={scopeOptions}
                className="max-w-xs"
              />
            </div>
          )}

          {/* Team picker */}
          {scope === "team" && !agent && teams.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Team</label>
              <Select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                options={teams
                  .filter((t) => canEditTeamIds.includes(t.id) || canEditOrg)
                  .map((t) => ({ value: t.id, label: t.name }))}
                className="max-w-xs"
              />
            </div>
          )}

          {/* Name + slug */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Research Assistant"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Slug</label>
            <div className="flex items-center gap-2">
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setAutoSlug(false);
                }}
                placeholder="research-assistant"
                className="max-w-xs"
              />
              <span className="text-xs text-text-tertiary">MCP prompt: {promptName}</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of what this agent does"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="You are a research assistant. When given a topic..."
              rows={8}
              className="w-full rounded-lg border border-border bg-bg-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
            />
          </div>

          {/* Tool Access */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">Tool Access</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AVAILABLE_INTEGRATIONS.map((integration) => (
                <label key={integration.id} className="flex items-center gap-2 rounded-lg bg-bg p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={toolAccess.includes(integration.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setToolAccess([...toolAccess, integration.id]);
                      } else {
                        setToolAccess(toolAccess.filter((id) => id !== integration.id));
                      }
                    }}
                  />
                  {integration.label}
                </label>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Model</label>
            <Select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              options={MODEL_OPTIONS}
              className="max-w-xs"
            />
          </div>

          {/* Preview */}
          {instructions && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Preview</label>
              <div className="rounded-lg border border-border bg-bg p-3">
                <MarkdownContent content={instructions} />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-6 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !instructions.trim()}>
            {saving ? "Saving..." : agent ? "Save Changes" : "Create Agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
