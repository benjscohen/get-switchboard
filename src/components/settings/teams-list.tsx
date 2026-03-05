"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Team {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
}

interface TeamMember {
  id: string;
  userId: string;
  role: string;
  name: string | null;
  image: string | null;
  joinedAt: string;
}

interface OrgMember {
  id: string;
  name: string | null;
  role: string;
}

interface TeamsListProps {
  initialTeams: Team[];
}

export function TeamsList({ initialTeams }: TeamsListProps) {
  const router = useRouter();
  const [teams, setTeams] = useState(initialTeams);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail modal state
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (res.ok) {
      const data = await res.json();
      setTeams(data);
    }
  }, []);

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeamName.trim() }),
    });
    if (res.ok) {
      setNewTeamName("");
      fetchTeams();
      router.refresh();
    }
    setCreating(false);
  }

  async function deleteTeam(id: string) {
    if (!confirm("Delete this team? This cannot be undone.")) return;
    await fetch(`/api/teams/${id}`, { method: "DELETE" });
    setSelectedTeam(null);
    fetchTeams();
    router.refresh();
  }

  async function openTeam(team: Team) {
    setSelectedTeam(team);
    setEditingName(team.name);
    setMembersLoading(true);

    const [membersRes, orgRes] = await Promise.all([
      fetch(`/api/teams/${team.id}/members`),
      fetch("/api/org/members"),
    ]);

    if (membersRes.ok) setTeamMembers(await membersRes.json());
    if (orgRes.ok) setOrgMembers(await orgRes.json());
    setMembersLoading(false);
  }

  async function renameTeam() {
    if (!selectedTeam || !editingName.trim() || editingName === selectedTeam.name) return;
    setSavingName(true);
    const res = await fetch(`/api/teams/${selectedTeam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName.trim() }),
    });
    if (res.ok) {
      fetchTeams();
      setSelectedTeam({ ...selectedTeam, name: editingName.trim() });
      router.refresh();
    }
    setSavingName(false);
  }

  async function addMember(userId: string) {
    if (!selectedTeam) return;
    const res = await fetch(`/api/teams/${selectedTeam.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const membersRes = await fetch(`/api/teams/${selectedTeam.id}/members`);
      if (membersRes.ok) setTeamMembers(await membersRes.json());
      fetchTeams();
    }
  }

  async function removeMember(userId: string) {
    if (!selectedTeam) return;
    await fetch(`/api/teams/${selectedTeam.id}/members?userId=${userId}`, {
      method: "DELETE",
    });
    const membersRes = await fetch(`/api/teams/${selectedTeam.id}/members`);
    if (membersRes.ok) setTeamMembers(await membersRes.json());
    fetchTeams();
  }

  async function changeRole(userId: string, role: string) {
    if (!selectedTeam) return;
    await fetch(`/api/teams/${selectedTeam.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const membersRes = await fetch(`/api/teams/${selectedTeam.id}/members`);
    if (membersRes.ok) setTeamMembers(await membersRes.json());
  }

  const memberUserIds = new Set(teamMembers.map((m) => m.userId));
  const availableMembers = orgMembers.filter((m) => !memberUserIds.has(m.id));

  return (
    <div className="space-y-6">
      {/* Create team */}
      <Card hover={false}>
        <h2 className="mb-4 text-sm font-medium text-text-secondary">
          Create Team
        </h2>
        <div className="flex gap-2">
          <Input
            placeholder="Team name"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            className="max-w-xs"
            onKeyDown={(e) => e.key === "Enter" && createTeam()}
          />
          <Button
            size="sm"
            onClick={createTeam}
            disabled={creating || !newTeamName.trim()}
          >
            {creating ? "Creating..." : "Create Team"}
          </Button>
        </div>
      </Card>

      {/* Teams list */}
      <Card hover={false}>
        <h2 className="mb-4 text-sm font-medium text-text-secondary">
          Teams{" "}
          <span className="text-text-tertiary">({teams.length})</span>
        </h2>
        {teams.length === 0 ? (
          <p className="text-sm text-text-tertiary">No teams yet.</p>
        ) : (
          <div className="space-y-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className="flex items-center justify-between rounded-lg bg-bg px-4 py-3 cursor-pointer hover:bg-bg-hover transition-colors"
                onClick={() => openTeam(team)}
              >
                <div>
                  <p className="text-sm font-medium">{team.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {team.memberCount}{" "}
                    {team.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
                <Button size="sm" variant="ghost">
                  Manage
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Team detail modal */}
      {selectedTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedTeam(null);
          }}
        >
          <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-bg-card p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selectedTeam.name}</h2>
              <button
                onClick={() => setSelectedTeam(null)}
                className="text-text-secondary hover:text-text-primary"
              >
                &times;
              </button>
            </div>

            {/* Rename */}
            <div className="mb-6">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Team Name
              </label>
              <div className="flex gap-2">
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  onClick={renameTeam}
                  disabled={savingName || editingName === selectedTeam.name}
                >
                  {savingName ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            {/* Members */}
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-text-secondary">
                Members
              </h3>
              {membersLoading ? (
                <p className="text-sm text-text-tertiary">Loading...</p>
              ) : teamMembers.length === 0 ? (
                <p className="text-sm text-text-tertiary">No members yet.</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg bg-bg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {m.image ? (
                          <img
                            src={m.image}
                            alt=""
                            className="h-6 w-6 rounded-full"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-hover text-xs font-medium text-text-secondary">
                            {(m.name?.[0] ?? "?").toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm">{m.name ?? "Unknown"}</span>
                        <Badge
                          variant={m.role === "lead" ? "accent" : "default"}
                        >
                          {m.role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            changeRole(
                              m.userId,
                              m.role === "lead" ? "member" : "lead"
                            )
                          }
                        >
                          {m.role === "lead" ? "Demote" : "Promote"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMember(m.userId)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add member */}
            {availableMembers.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-medium text-text-secondary">
                  Add Member
                </h3>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {availableMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-bg transition-colors"
                    >
                      <span className="text-sm">{m.name ?? m.id}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addMember(m.id)}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delete team */}
            <div className="flex justify-end border-t border-border pt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteTeam(selectedTeam.id)}
                className="text-red-500 hover:text-red-600"
              >
                Delete Team
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
