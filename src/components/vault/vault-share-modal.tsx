"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabList, TabTrigger, TabPanel } from "@/components/ui/tabs";

interface VaultShareTarget {
  id: string;
  secretId: string;
  targetType: "user" | "team" | "organization";
  targetId: string;
  targetLabel: string;
  createdBy: string;
  createdAt: string;
}

interface Team {
  id: string;
  name: string;
}

interface OrgMember {
  id: string;
  display_name: string | null;
  email: string;
}

interface VaultShareModalProps {
  secretId: string;
  secretName: string;
  onClose: () => void;
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  user: "User",
  team: "Team",
  organization: "Org",
};

export function VaultShareModal({ secretId, secretName, onClose }: VaultShareModalProps) {
  const [shares, setShares] = useState<VaultShareTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add share state
  const [email, setEmail] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");

  const fetchShares = useCallback(async () => {
    const res = await fetch(`/api/vault/${secretId}/shares`);
    if (res.ok) setShares(await res.json());
  }, [secretId]);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (res.ok) {
      const data = await res.json();
      setTeams(data);
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    const res = await fetch("/api/org/members");
    if (res.ok) {
      const data = await res.json();
      setMembers(data);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchShares(), fetchTeams(), fetchMembers()]).then(() => setLoading(false));
  }, [fetchShares, fetchTeams, fetchMembers]);

  async function postShare(payload: Record<string, string>, onSuccess?: () => void) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/vault/${secretId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to share");
        return;
      }
      onSuccess?.();
      await fetchShares();
    } finally {
      setSaving(false);
    }
  }

  async function handleShareWithUser(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const member = members.find((m) => m.email === email.trim());
    if (!member) {
      setError("User not found in your organization");
      return;
    }
    await postShare({ user_id: member.id }, () => setEmail(""));
  }

  async function handleShareWithTeam() {
    if (!selectedTeam) return;
    await postShare({ team_id: selectedTeam }, () => setSelectedTeam(""));
  }

  async function handleShareWithOrg() {
    await postShare({ organization_id: "current" });
  }

  async function handleRevoke(shareId: string) {
    const res = await fetch(`/api/vault/${secretId}/shares/${shareId}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchShares();
  }

  const hasOrgShare = shares.some((s) => s.targetType === "organization");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Share &ldquo;{secretName}&rdquo;</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Current shares */}
        {shares.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-medium text-text-secondary">Shared with</h3>
            <div className="space-y-2">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{share.targetLabel}</span>
                    <Badge variant="default">
                      {TARGET_TYPE_LABELS[share.targetType] ?? share.targetType}
                    </Badge>
                  </div>
                  <button
                    onClick={() => handleRevoke(share.id)}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add share */}
        <div>
          <h3 className="mb-2 text-xs font-medium text-text-secondary">Add access</h3>
          <Tabs defaultTab="user">
            <TabList className="mb-3">
              <TabTrigger id="user">User</TabTrigger>
              <TabTrigger id="team">Team</TabTrigger>
              <TabTrigger id="org">Organization</TabTrigger>
            </TabList>

            <TabPanel id="user">
              <form onSubmit={handleShareWithUser} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@company.com"
                  list="org-members"
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <datalist id="org-members">
                  {members.map((m) => (
                    <option key={m.id} value={m.email}>
                      {m.display_name || m.email}
                    </option>
                  ))}
                </datalist>
                <Button type="submit" size="sm" disabled={saving || !email.trim()}>
                  {saving ? "Sharing..." : "Share"}
                </Button>
              </form>
            </TabPanel>

            <TabPanel id="team">
              <div className="flex gap-2">
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">Select a team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleShareWithTeam}
                  disabled={saving || !selectedTeam}
                >
                  {saving ? "Sharing..." : "Share"}
                </Button>
              </div>
            </TabPanel>

            <TabPanel id="org">
              <div className="rounded-lg border border-border bg-bg px-3 py-3 text-sm text-text-secondary">
                {hasOrgShare ? (
                  <p>This secret is already shared with your entire organization.</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <p>Share with everyone in your organization</p>
                    <Button
                      size="sm"
                      onClick={handleShareWithOrg}
                      disabled={saving}
                    >
                      {saving ? "Sharing..." : "Share with Org"}
                    </Button>
                  </div>
                )}
              </div>
            </TabPanel>
          </Tabs>
        </div>

        {loading && (
          <div className="mt-4 text-center text-sm text-text-tertiary">Loading...</div>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
