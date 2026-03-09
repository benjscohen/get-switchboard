"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { VaultSecretDetail } from "@/app/(app)/workspace/vault/page";

interface FieldRow {
  name: string;
  value: string;
  sensitive: boolean;
  revealed: boolean;
}

interface VaultFormProps {
  secret?: VaultSecretDetail;
  onSave: (data: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    fields: Array<{ name: string; value: string; sensitive?: boolean }>;
  }) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

const CATEGORIES = [
  { value: "api_key", label: "API Key" },
  { value: "credential", label: "Credential" },
  { value: "payment", label: "Payment" },
  { value: "note", label: "Note" },
  { value: "other", label: "Other" },
];

export function VaultForm({ secret, onSave, onClose }: VaultFormProps) {
  const [name, setName] = useState(secret?.name ?? "");
  const [description, setDescription] = useState(secret?.description ?? "");
  const [category, setCategory] = useState(secret?.category ?? "other");
  const [tagsInput, setTagsInput] = useState(secret?.tags?.join(", ") ?? "");
  const [fields, setFields] = useState<FieldRow[]>(
    secret?.fields?.map((f) => ({
      name: f.name,
      value: f.value,
      sensitive: f.sensitive,
      revealed: false,
    })) ?? [{ name: "", value: "", sensitive: true, revealed: false }]
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Map<number, string>>(new Map());
  const [formError, setFormError] = useState("");

  function addField() {
    setFields([...fields, { name: "", value: "", sensitive: true, revealed: false }]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
    setFieldErrors((prev) => {
      const next = new Map<number, string>();
      for (const [k, v] of prev) {
        if (k < index) next.set(k, v);
        else if (k > index) next.set(k - 1, v);
      }
      return next;
    });
  }

  function updateField(index: number, updates: Partial<FieldRow>) {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...updates } : f)));
    if ("name" in updates) {
      setFieldErrors((prev) => {
        const next = new Map(prev);
        next.delete(index);
        return next;
      });
    }
  }

  function toggleReveal(index: number) {
    const field = fields[index];
    if (!field.revealed) {
      updateField(index, { revealed: true });
      setTimeout(() => updateField(index, { revealed: false }), 10000);
    } else {
      updateField(index, { revealed: false });
    }
  }

  async function copyValue(index: number) {
    await navigator.clipboard.writeText(fields[index].value);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    // Validate field names
    const errors = new Map<number, string>();
    const seen = new Map<string, number>();
    for (let i = 0; i < fields.length; i++) {
      const trimmed = fields[i].name.trim();
      if (!trimmed) {
        errors.set(i, "Field name is required");
      } else {
        const lower = trimmed.toLowerCase();
        const prev = seen.get(lower);
        if (prev !== undefined) {
          errors.set(i, "Duplicate field name");
          if (!errors.has(prev)) errors.set(prev, "Duplicate field name");
        }
        seen.set(lower, i);
      }
    }

    if (errors.size > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await onSave({
        name,
        description: description || undefined,
        category,
        tags: tags.length > 0 ? tags : undefined,
        fields: fields.map((f) => ({
          name: f.name.trim(),
          value: f.value,
          sensitive: f.sensitive,
        })),
      });
      if (!result.ok) {
        setFormError(result.error || "Failed to save secret");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-lg font-bold">
          {secret ? "Edit Secret" : "New Secret"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. AWS Production"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Optional description"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-secondary">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-text-secondary">Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                placeholder="aws, prod"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">Fields</label>
              <button
                type="button"
                onClick={addField}
                className="text-xs text-accent hover:underline"
              >
                + Add field
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                  <div className="w-32">
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateField(i, { name: e.target.value })}
                      placeholder="Field name"
                      className={`w-full rounded-lg border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent ${fieldErrors.has(i) ? "border-red-500" : "border-border"}`}
                    />
                  </div>
                  <div className="relative flex-1">
                    {(() => { const masked = field.sensitive && !field.revealed; return (
                    <input
                      type="text"
                      value={masked ? "••••••••" : field.value}
                      readOnly={masked}
                      onFocus={() => { if (masked) toggleReveal(i); }}
                      onChange={(e) => updateField(i, { value: e.target.value })}
                      placeholder="Value"
                      className="w-full rounded-lg border border-border bg-bg px-2 py-1.5 pr-16 text-sm outline-none focus:border-accent font-mono"
                    />); })()}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                      {field.sensitive && (
                        <button
                          type="button"
                          onClick={() => toggleReveal(i)}
                          className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
                          title={field.revealed ? "Hide" : "Reveal"}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            {field.revealed ? (
                              <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z M8 10a2 2 0 100-4 2 2 0 000 4z" />
                            ) : (
                              <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z M2 14l12-12" />
                            )}
                          </svg>
                        </button>
                      )}
                      {field.value && (
                        <button
                          type="button"
                          onClick={() => copyValue(i)}
                          className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
                          title="Copy"
                        >
                          {copied === i ? (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 8.5l3.5 3.5 6.5-7" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="5" y="5" width="8" height="8" rx="1" />
                              <path d="M3 11V3h8" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-text-tertiary">
                    <input
                      type="checkbox"
                      checked={field.sensitive}
                      onChange={(e) => updateField(i, { sensitive: e.target.checked })}
                      className="accent-accent"
                    />
                    Mask
                  </label>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      className="text-text-tertiary hover:text-red-500"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  )}
                  </div>
                  {fieldErrors.has(i) && (
                    <p className="mt-0.5 ml-0 text-xs text-red-500">{fieldErrors.get(i)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !name.trim() || fields.every((f) => !f.name.trim())}>
              {saving ? "Saving..." : secret ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
