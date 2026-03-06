"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface McpServerInitialData {
  id: string;
  name: string;
  slug: string;
  description: string;
  serverUrl: string;
  authType: string;
  keyMode: "shared" | "per_user";
  userKeyInstructions: string | null;
  hasSharedKey: boolean;
  customHeaders: Array<{ key: string; hasValue: boolean }> | null;
}

interface McpServerFormProps {
  initialData?: McpServerInitialData;
  onSaved: () => void;
  onCancel: () => void;
}

export function McpServerForm({ initialData, onSaved, onCancel }: McpServerFormProps) {
  const isEdit = !!initialData;
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [serverUrl, setServerUrl] = useState(initialData?.serverUrl ?? "");
  const [authType, setAuthType] = useState(initialData?.authType ?? "bearer");
  const [sharedApiKey, setSharedApiKey] = useState("");
  const [keyMode, setKeyMode] = useState<"shared" | "per_user">(initialData?.keyMode ?? "shared");
  const [userKeyInstructions, setUserKeyInstructions] = useState(initialData?.userKeyInstructions ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [customHeaderRows, setCustomHeaderRows] = useState<Array<{ key: string; value: string; hasExistingValue: boolean }>>(
    initialData?.customHeaders?.map((h) => ({ key: h.key, value: "", hasExistingValue: h.hasValue })) ?? [{ key: "", value: "", hasExistingValue: false }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Build custom headers payload
    const headersPayload = authType === "custom_headers"
      ? customHeaderRows
          .filter((r) => r.key.trim())
          .map((r) => ({
            key: r.key.trim(),
            ...(keyMode === "per_user" ? {} : r.value ? { value: r.value } : {}),
          }))
      : undefined;

    const payload = isEdit
      ? {
          id: initialData.id,
          name,
          serverUrl,
          authType,
          keyMode: authType === "bearer" || authType === "custom_headers" ? keyMode : undefined,
          sharedApiKey: authType === "bearer" && keyMode === "shared" && sharedApiKey ? sharedApiKey : undefined,
          userKeyInstructions: (authType === "bearer" || authType === "custom_headers") && keyMode === "per_user" ? (userKeyInstructions || null) : undefined,
          customHeaders: headersPayload,
          description,
        }
      : {
          name,
          slug,
          serverUrl,
          authType,
          keyMode: authType === "bearer" || authType === "custom_headers" ? keyMode : undefined,
          sharedApiKey: authType === "bearer" && keyMode === "shared" ? (sharedApiKey || undefined) : undefined,
          userKeyInstructions: (authType === "bearer" || authType === "custom_headers") && keyMode === "per_user" ? (userKeyInstructions || undefined) : undefined,
          customHeaders: headersPayload,
          description,
        };

    const res = await fetch("/api/admin/mcp-servers", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      onSaved();
    } else {
      const d = await res.json();
      setError(d.error || (isEdit ? "Failed to save changes" : "Failed to create server"));
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-text-secondary">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            placeholder="Shortcut"
            className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Slug (tool prefix)</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            disabled={isEdit}
            pattern="[a-z0-9-]+"
            placeholder="shortcut"
            className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-text-secondary">Server URL</span>
        <input
          type="url"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          required
          placeholder="https://mcp.example.com/sse"
          className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </label>

      <label className="block text-sm">
        <span className="text-text-secondary">Description</span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Project management tools"
          className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-text-secondary">Auth Type</span>
          <select
            value={authType}
            onChange={(e) => setAuthType(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="bearer">Bearer Token</option>
            <option value="custom_headers">Custom Headers</option>
            <option value="none">None</option>
          </select>
        </label>
        {(authType === "bearer" || authType === "custom_headers") && (
          <label className="block text-sm">
            <span className="text-text-secondary">Key Mode</span>
            <select
              value={keyMode}
              onChange={(e) => setKeyMode(e.target.value as "shared" | "per_user")}
              className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="shared">Shared (admin provides {authType === "custom_headers" ? "headers" : "key"})</option>
              <option value="per_user">Per-user (each user provides their own {authType === "custom_headers" ? "headers" : "key"})</option>
            </select>
          </label>
        )}
      </div>

      {authType === "bearer" && keyMode === "shared" && (
        <label className="block text-sm">
          <span className="text-text-secondary">
            Shared API Key (optional)
          </span>
          <input
            type="password"
            value={sharedApiKey}
            onChange={(e) => setSharedApiKey(e.target.value)}
            placeholder={isEdit && initialData.hasSharedKey ? "Leave blank to keep existing key" : "sk-..."}
            className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>
      )}

      {authType === "custom_headers" && (
        <div className="space-y-2">
          <span className="block text-sm text-text-secondary">
            {keyMode === "per_user" ? "Header Names (users will provide values)" : "Custom Headers"}
          </span>
          {customHeaderRows.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={row.key}
                onChange={(e) => {
                  const next = [...customHeaderRows];
                  next[idx] = { ...next[idx], key: e.target.value };
                  setCustomHeaderRows(next);
                }}
                placeholder="Header name (e.g. DD-API-KEY)"
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none"
              />
              {keyMode !== "per_user" && (
                <input
                  type="password"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...customHeaderRows];
                    next[idx] = { ...next[idx], value: e.target.value };
                    setCustomHeaderRows(next);
                  }}
                  placeholder={row.hasExistingValue ? "Leave blank to keep existing" : "Header value"}
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              )}
              <button
                type="button"
                onClick={() => setCustomHeaderRows(customHeaderRows.filter((_, i) => i !== idx))}
                className="p-2 text-text-secondary hover:text-red-500 transition-colors"
                aria-label="Remove header"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M3 11l8-8" /></svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCustomHeaderRows([...customHeaderRows, { key: "", value: "", hasExistingValue: false }])}
            className="text-xs text-accent hover:underline"
          >
            + Add Header
          </button>
        </div>
      )}

      {(authType === "bearer" || authType === "custom_headers") && keyMode === "per_user" && (
        <label className="block text-sm">
          <span className="text-text-secondary">
            Instructions for users (optional)
          </span>
          <textarea
            value={userKeyInstructions}
            onChange={(e) => setUserKeyInstructions(e.target.value)}
            placeholder="Visit https://example.com/settings to generate an API key..."
            rows={3}
            className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none resize-y"
          />
        </label>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Server"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
