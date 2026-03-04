"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IntegrationsCard } from "@/components/app/integrations-card";

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

export default function SettingsOrganizationPage() {
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
    return <p className="text-text-tertiary">Loading...</p>;
  }

  if (!org) {
    return <p className="text-text-tertiary">Organization not found.</p>;
  }

  return (
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

      {/* Integrations */}
      <IntegrationsCard />
    </div>
  );
}
