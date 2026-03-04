"use client";

import { useState, useEffect, useCallback } from "react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Tabs, TabList, TabTrigger, TabPanel } from "@/components/ui/tabs";
import { SkillList } from "@/components/skills/skill-list";
import { SkillEditor } from "@/components/skills/skill-editor";

interface SkillArgument {
  name: string;
  description: string;
  required: boolean;
}

interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  arguments: SkillArgument[];
  scope: "organization" | "team" | "user";
  teamId?: string;
  enabled: boolean;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

interface SkillsData {
  organization: Skill[];
  team: Skill[];
  user: Skill[];
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillsData>({ organization: [], team: [], user: [] });
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState<"organization" | "team" | "user" | null>(null);
  const [orgRole, setOrgRole] = useState<string>("member");

  const fetchSkills = useCallback(async () => {
    const res = await fetch("/api/skills");
    if (res.ok) {
      setSkills(await res.json());
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (res.ok) {
      setTeams(await res.json());
    }
  }, []);

  const fetchOrgRole = useCallback(async () => {
    const res = await fetch("/api/org");
    if (res.ok) {
      const data = await res.json();
      setOrgRole(data.currentUserRole);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchSkills(), fetchTeams(), fetchOrgRole()]).then(() =>
      setLoading(false)
    );
  }, [fetchSkills, fetchTeams, fetchOrgRole]);

  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  // Server-side auth handles actual permissions; UI uses org admin as proxy for editability.
  // Team leads can also edit team skills — the server enforces this on save.
  const canEditTeamIds = teams.map((t) => t.id);

  async function handleSave(data: Partial<Skill>) {
    if (editing) {
      await fetch(`/api/skills/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else if (creating) {
      await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, scope: data.scope ?? creating }),
      });
    }
    setEditing(null);
    setCreating(null);
    fetchSkills();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    fetchSkills();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    fetchSkills();
  }

  if (loading) {
    return (
      <Container className="py-10">
        <p className="text-text-tertiary">Loading...</p>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Skills</h1>
        <Button size="sm" onClick={() => setCreating("user")}>
          + New Skill
        </Button>
      </div>

      <Tabs defaultTab="organization">
        <TabList className="mb-6">
          <TabTrigger id="organization">Organization</TabTrigger>
          <TabTrigger id="team">Teams</TabTrigger>
          <TabTrigger id="user">Personal</TabTrigger>
        </TabList>

        <TabPanel id="organization">
          <SkillList
            skills={skills.organization}
            canEdit={isOrgAdmin}
            onEdit={setEditing}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        </TabPanel>

        <TabPanel id="team">
          <SkillList
            skills={skills.team}
            canEdit={isOrgAdmin || canEditTeamIds.length > 0}
            onEdit={setEditing}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        </TabPanel>

        <TabPanel id="user">
          <SkillList
            skills={skills.user}
            canEdit={true}
            onEdit={setEditing}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        </TabPanel>
      </Tabs>

      {(editing || creating) && (
        <SkillEditor
          skill={editing ?? undefined}
          teams={teams}
          defaultScope={creating ?? editing?.scope ?? "user"}
          canEditOrg={isOrgAdmin}
          canEditTeamIds={canEditTeamIds}
          onSave={handleSave}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
        />
      )}
    </Container>
  );
}
