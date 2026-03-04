"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CustomMcpKeyFormProps {
  serverId: string;
  serverName: string;
  onDone: () => void;
}

export function CustomMcpKeyForm({
  serverId,
  serverName,
  onDone,
}: CustomMcpKeyFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/mcp-keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, apiKey }),
    });
    setSaving(false);
    setApiKey("");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        required
        placeholder={`API key for ${serverName}`}
        className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
      />
      <Button size="sm" type="submit" disabled={saving || !apiKey}>
        {saving ? "..." : "Save"}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}
