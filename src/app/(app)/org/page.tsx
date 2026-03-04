"use client";

import { useState, useEffect, useCallback } from "react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  memberCount: number;
  currentUserRole: string;
  domains: Array<{
    id: string;
    domain: string;
    isPrimary: boolean;
  }>;
}

interface ProxyIntegration {
  id: string;
  name: string;
  description: string;
  toolCount: number;
  configured: boolean;
  enabled: boolean;
}

export default function OrgSettingsPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchOrg = useCallback(async () => {
    const res = await fetch("/api/org");
    if (res.ok) {
      const data = await res.json();
      setOrg(data);
      setOrgName(data.name);
    }
  }, []);

  useEffect(() => {
    fetchOrg().then(() => setLoading(false));
  }, [fetchOrg]);

  async function updateName() {
    if (!orgName.trim() || orgName === org?.name) return;
    setSaving(true);
    const res = await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orgName.trim() }),
    });
    if (res.ok) fetchOrg();
    setSaving(false);
  }

  async function addDomain() {
    if (!newDomain.trim()) return;
    const res = await fetch("/api/org/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain.trim() }),
    });
    if (res.ok) {
      setNewDomain("");
      fetchOrg();
    }
  }

  async function removeDomain(id: string) {
    await fetch(`/api/org/domains?id=${id}`, { method: "DELETE" });
    fetchOrg();
  }

  if (loading) {
    return (
      <Container className="py-10">
        <p className="text-text-tertiary">Loading...</p>
      </Container>
    );
  }

  if (!org) {
    return (
      <Container className="py-10">
        <p className="text-text-tertiary">Organization not found.</p>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <h1 className="mb-8 text-2xl font-bold">Organization Settings</h1>

      <div className="space-y-6">
        {/* Org name */}
        <Card hover={false}>
          <h2 className="mb-4 text-sm font-medium text-text-secondary">
            Organization Name
          </h2>
          <div className="flex gap-2">
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={updateName}
              disabled={saving || orgName === org.name}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-text-tertiary">Slug: {org.slug}</p>
        </Card>

        {/* Integrations */}
        <IntegrationsCard />

        {/* Domains */}
        <Card hover={false}>
          <h2 className="mb-4 text-sm font-medium text-text-secondary">
            Email Domains
          </h2>
          <p className="mb-3 text-xs text-text-tertiary">
            Users signing up with these email domains will automatically join your organization.
          </p>
          <div className="mb-4 flex gap-2">
            <Input
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="max-w-xs"
            />
            <Button size="sm" onClick={addDomain}>
              Add Domain
            </Button>
          </div>
          {org.domains.length > 0 ? (
            <div className="space-y-2">
              {org.domains.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg bg-bg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d.domain}</span>
                    {d.isPrimary && (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                        Primary
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeDomain(d.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No domains configured.</p>
          )}
        </Card>

      </div>
    </Container>
  );
}

function IntegrationsCard() {
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
              <div className="mt-3 flex gap-2">
                <Input
                  type="password"
                  placeholder="API key"
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
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
