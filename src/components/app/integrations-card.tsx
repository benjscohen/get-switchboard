"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ProxyIntegration {
  id: string;
  name: string;
  description: string;
  toolCount: number;
  configured: boolean;
  enabled: boolean;
  orgKeyLabel?: string;
  orgKeyHelpText?: string;
}

export function IntegrationsCard() {
  const [integrations, setIntegrations] = useState<ProxyIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch("/api/org/integrations");
      if (res.ok) {
        setIntegrations(await res.json());
      }
    } catch {
      // Ignore fetch errors
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  async function saveKey(integrationId: string) {
    const key = keyInputs[integrationId];
    if (!key?.trim()) return;
    setSaving((s) => ({ ...s, [integrationId]: true }));
    await fetch("/api/org/integrations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId, apiKey: key.trim() }),
    });
    setKeyInputs((k) => ({ ...k, [integrationId]: "" }));
    setSaving((s) => ({ ...s, [integrationId]: false }));
    fetchIntegrations();
  }

  async function toggleEnabled(integrationId: string, enabled: boolean) {
    await fetch("/api/org/integrations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId, enabled }),
    });
    fetchIntegrations();
  }

  async function removeKey(integrationId: string) {
    await fetch(`/api/org/integrations?integrationId=${integrationId}`, {
      method: "DELETE",
    });
    fetchIntegrations();
  }

  if (loading) return null;
  if (integrations.length === 0) return null;

  return (
    <Card hover={false}>
      <h2 className="mb-4 text-sm font-medium text-text-secondary">
        Integrations
      </h2>
      <p className="mb-3 text-xs text-text-tertiary">
        Configure API keys for native integrations. Once enabled, tools are available to all org members via MCP.
      </p>
      <div className="space-y-3">
        {integrations.map((i) => (
          <div
            key={i.id}
            className="rounded-lg border border-border bg-bg p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{i.name}</p>
                  <span className="text-xs text-text-secondary">
                    {i.toolCount} tools
                  </span>
                </div>
                <p className="text-xs text-text-secondary">{i.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {i.configured && (
                  <>
                    <button
                      onClick={() => toggleEnabled(i.id, !i.enabled)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        i.enabled ? "bg-accent" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          i.enabled ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeKey(i.id)}
                    >
                      Remove Key
                    </Button>
                  </>
                )}
              </div>
            </div>
            {!i.configured && (
              <div className="mt-3">
                {i.orgKeyHelpText && (
                  <p className="mb-2 text-xs text-text-tertiary">{i.orgKeyHelpText}</p>
                )}
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={i.orgKeyLabel ?? "API key"}
                    value={keyInputs[i.id] ?? ""}
                    onChange={(e) =>
                      setKeyInputs((k) => ({ ...k, [i.id]: e.target.value }))
                    }
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveKey(i.id)}
                    disabled={saving[i.id] || !keyInputs[i.id]?.trim()}
                  >
                    {saving[i.id] ? "Saving..." : "Save Key"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
