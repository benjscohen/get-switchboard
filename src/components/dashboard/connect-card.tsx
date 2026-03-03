"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs, TabList, TabTrigger, TabPanel } from "@/components/ui/tabs";
import { MCP_CLIENTS, generateSnippet } from "@/lib/mcp-snippets";

interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function ConnectCard({ origin }: { origin: string }) {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchKeys = useCallback(async () => {
    const res = await fetch("/api/keys");
    if (res.ok) setKeys(await res.json());
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function generate() {
    setLoading(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName || "Default" }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewRawKey(data.key);
      setNewKeyName("");
      fetchKeys();
    }
    setLoading(false);
  }

  async function revoke(id: string) {
    await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    fetchKeys();
  }

  // State B: key was just generated — show snippets
  if (newRawKey) {
    return (
      <Card hover={false}>
        <h2 className="mb-4 text-sm font-medium text-text-secondary">
          Connect your MCP client
        </h2>

        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="text-xs font-medium text-accent">
            Copy your config now — the key won&apos;t be shown again
          </p>
        </div>

        <Tabs defaultTab={MCP_CLIENTS[0].id} className="space-y-3">
          <TabList>
            {MCP_CLIENTS.map((c) => (
              <TabTrigger key={c.id} id={c.id}>
                {c.label}
              </TabTrigger>
            ))}
          </TabList>
          {MCP_CLIENTS.map((c) => (
            <TabPanel key={c.id} id={c.id}>
              <p className="mb-2 text-xs text-text-tertiary">{c.hint}</p>
              <CodeBlock code={generateSnippet(origin, newRawKey, c.id)} />
            </TabPanel>
          ))}
        </Tabs>

        <Button
          size="sm"
          variant="secondary"
          className="mt-4"
          onClick={() => setNewRawKey(null)}
        >
          Done
        </Button>
      </Card>
    );
  }

  // State A: generate key form
  return (
    <Card hover={false}>
      <h2 className="mb-4 text-sm font-medium text-text-secondary">
        Connect your MCP client
      </h2>

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Key name (optional)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" onClick={generate} disabled={loading}>
          {loading ? "Generating..." : "Generate Key"}
        </Button>
      </div>

      {keys.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-text-tertiary hover:text-text-secondary">
            {keys.length} existing key{keys.length !== 1 && "s"}
          </summary>
          <div className="mt-2 space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-lg bg-bg px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="font-mono text-xs text-text-tertiary">
                    {k.keyPrefix}...
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-tertiary">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(k.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {keys.length === 0 && (
        <p className="text-sm text-text-tertiary">
          No API keys yet. Generate one to connect your MCP client.
        </p>
      )}
    </Card>
  );
}
