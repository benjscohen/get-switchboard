"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface UserKeyFormProps {
  type: "custom-mcp" | "proxy";
  targetId: string;
  targetName: string;
  hasExistingKey: boolean;
  instructions?: React.ReactNode;
  onSaved: () => void;
  onCancel: () => void;
}

export function UserKeyForm({
  type,
  targetId,
  targetName,
  hasExistingKey,
  instructions,
  onSaved,
  onCancel,
}: UserKeyFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/user-keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, targetId, apiKey }),
    });
    setSaving(false);
    setApiKey("");
    onSaved();
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {instructions && (
        <p className="text-sm text-text-secondary mb-3 whitespace-pre-line">
          {instructions}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
          placeholder={
            hasExistingKey
              ? "Enter new key to replace existing"
              : `API key for ${targetName}`
          }
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
        />
        <Button size="sm" type="submit" disabled={saving || !apiKey}>
          {saving ? "..." : hasExistingKey ? "Update Key" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </form>
    </div>
  );
}
