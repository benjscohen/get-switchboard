"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface SkillArgument {
  name: string;
  description: string;
  required: boolean;
}

interface Skill {
  id?: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  arguments: SkillArgument[];
  scope: "organization" | "team" | "user";
  teamId?: string;
  enabled: boolean;
}

interface Team {
  id: string;
  name: string;
}

interface SkillEditorProps {
  skill?: Skill;
  teams: Team[];
  defaultScope: "organization" | "team" | "user";
  canEditOrg: boolean;
  canEditTeamIds: string[];
  onSave: (skill: Partial<Skill>) => Promise<void>;
  onClose: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function SkillEditor({
  skill,
  teams,
  defaultScope,
  canEditOrg,
  canEditTeamIds,
  onSave,
  onClose,
}: SkillEditorProps) {
  const [name, setName] = useState(skill?.name ?? "");
  const [slug, setSlug] = useState(skill?.slug ?? "");
  const [autoSlug, setAutoSlug] = useState(!skill);
  const [description, setDescription] = useState(skill?.description ?? "");
  const [content, setContent] = useState(skill?.content ?? "");
  const [args, setArgs] = useState<SkillArgument[]>(skill?.arguments ?? []);
  const [scope, setScope] = useState<"organization" | "team" | "user">(
    skill?.scope ?? defaultScope
  );
  const [teamId, setTeamId] = useState(skill?.teamId ?? teams[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (autoSlug) setSlug(slugify(name));
  }, [name, autoSlug]);

  function addArg() {
    setArgs([...args, { name: "", description: "", required: false }]);
  }

  function updateArg(index: number, field: keyof SkillArgument, value: string | boolean) {
    const updated = [...args];
    updated[index] = { ...updated[index], [field]: value };
    setArgs(updated);
  }

  function removeArg(index: number) {
    setArgs(args.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug,
        description: description.trim(),
        content: content.trim(),
        arguments: args.filter((a) => a.name.trim()),
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

  // Compute prompt name preview
  const prefix = scope === "organization" ? "org" : scope === "team" ? "team" : "user";
  const promptName = `${prefix}:${slug || "..."}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border p-6 pb-4">
          <h2 className="text-lg font-semibold">{skill ? "Edit Skill" : "New Skill"}</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Scope selector (only for new skills) */}
          {!skill && scopeOptions.length > 1 && (
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
          {scope === "team" && !skill && teams.length > 0 && (
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
              placeholder="Code Review"
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
                placeholder="code-review"
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
              placeholder="A short description of what this skill does"
            />
          </div>

          {/* Content */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Content
              <span className="ml-2 text-xs text-text-tertiary font-normal">
                {"Use {{argName}} for template variables"}
              </span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="You are a code reviewer. Review the following code for {{language}}..."
              rows={8}
              className="w-full rounded-lg border border-border bg-bg-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono"
            />
          </div>

          {/* Arguments */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-text-secondary">Arguments</label>
              <Button size="sm" variant="ghost" onClick={addArg}>
                + Add Argument
              </Button>
            </div>
            {args.length > 0 && (
              <div className="space-y-2">
                {args.map((arg, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-bg p-2">
                    <Input
                      value={arg.name}
                      onChange={(e) => updateArg(i, "name", e.target.value)}
                      placeholder="argName"
                      className="max-w-[140px]"
                    />
                    <Input
                      value={arg.description}
                      onChange={(e) => updateArg(i, "description", e.target.value)}
                      placeholder="Description"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={arg.required}
                        onChange={(e) => updateArg(i, "required", e.target.checked)}
                      />
                      Required
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => removeArg(i)}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 3l8 8M11 3L3 11" />
                      </svg>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          {content && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Preview</label>
              <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text-secondary whitespace-pre-wrap font-mono">
                {content.replace(/\{\{(\w+)\}\}/g, (_, argName) => `[${argName}]`)}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-6 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !content.trim()}>
            {saving ? "Saving..." : skill ? "Save Changes" : "Create Skill"}
          </Button>
        </div>
      </div>
    </div>
  );
}
