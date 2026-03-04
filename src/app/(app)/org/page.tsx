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

interface OrgMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  orgRole: string;
  apiKeyCount: number;
  connectionCount: number;
  usageCount: number;
}

export default function OrgSettingsPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
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

  const fetchMembers = useCallback(async () => {
    const res = await fetch("/api/org/members");
    if (res.ok) setMembers(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([fetchOrg(), fetchMembers()]).then(() => setLoading(false));
  }, [fetchOrg, fetchMembers]);

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

  async function changeRole(userId: string, orgRole: string) {
    await fetch("/api/org/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, orgRole }),
    });
    fetchMembers();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    await fetch(`/api/org/members?userId=${userId}`, { method: "DELETE" });
    fetchMembers();
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

  const isOwner = org.currentUserRole === "owner";

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

        {/* Members */}
        <Card hover={false}>
          <h2 className="mb-4 text-sm font-medium text-text-secondary">
            Members ({members.length})
          </h2>
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg bg-bg px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  {m.image ? (
                    <img
                      src={m.image}
                      alt=""
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
                      {(m.name?.[0] ?? m.email[0]).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {m.name ?? m.email}
                    </p>
                    {m.name && (
                      <p className="text-xs text-text-tertiary">{m.email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden text-xs text-text-tertiary sm:flex sm:gap-3">
                    <span>{m.apiKeyCount} keys</span>
                    <span>{m.connectionCount} integrations</span>
                    <span>{m.usageCount} requests</span>
                  </div>
                  {isOwner ? (
                    <select
                      value={m.orgRole}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="rounded border border-border bg-bg px-2 py-1 text-xs"
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className="rounded bg-bg-hover px-2 py-0.5 text-xs capitalize text-text-secondary">
                      {m.orgRole}
                    </span>
                  )}
                  {isOwner && m.orgRole !== "owner" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMember(m.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Container>
  );
}
