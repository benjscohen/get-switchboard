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

    const payload = isEdit
      ? {
          id: initialData.id,
          name,
          serverUrl,
          authType,
          keyMode: authType === "bearer" ? keyMode : undefined,
          sharedApiKey: authType === "bearer" && keyMode === "shared" && sharedApiKey ? sharedApiKey : undefined,
          userKeyInstructions: authType === "bearer" && keyMode === "per_user" ? (userKeyInstructions || null) : undefined,
          description,
        }
      : {
          name,
          slug,
          serverUrl,
          authType,
          keyMode: authType === "bearer" ? keyMode : undefined,
          sharedApiKey: authType === "bearer" && keyMode === "shared" ? (sharedApiKey || undefined) : undefined,
          userKeyInstructions: authType === "bearer" && keyMode === "per_user" ? (userKeyInstructions || undefined) : undefined,
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
            <option value="none">None</option>
          </select>
        </label>
        {authType === "bearer" && (
          <label className="block text-sm">
            <span className="text-text-secondary">Key Mode</span>
            <select
              value={keyMode}
              onChange={(e) => setKeyMode(e.target.value as "shared" | "per_user")}
              className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="shared">Shared (admin provides key)</option>
              <option value="per_user">Per-user (each user provides their own key)</option>
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

      {authType === "bearer" && keyMode === "per_user" && (
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
