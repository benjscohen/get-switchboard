"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkillList } from "@/components/skills/skill-list";
import { SkillEditor } from "@/components/skills/skill-editor";
import type { SkillTemplate } from "@/lib/skills/templates";

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
  const [templates, setTemplates] = useState<SkillTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState<"organization" | "team" | "user" | null>(null);
  const [orgRole, setOrgRole] = useState<string>("member");
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);

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

  const fetchTemplates = useCallback(async () => {
    const res = await fetch("/api/skill-templates");
    if (res.ok) {
      setTemplates(await res.json());
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchSkills(), fetchTeams(), fetchOrgRole(), fetchTemplates()]).then(() =>
      setLoading(false)
    );
  }, [fetchSkills, fetchTeams, fetchOrgRole, fetchTemplates]);

  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  const canEditTeamIds = teams.map((t) => t.id);

  // Build team name lookup
  const teamNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of teams) map[t.id] = t.name;
    return map;
  }, [teams]);

  // Flatten all skills into one list
  const allSkills = useMemo(
    () => [...skills.organization, ...skills.team, ...skills.user],
    [skills]
  );

  // Track which template slugs are already added
  const existingSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSkills) set.add(s.slug);
    return set;
  }, [allSkills]);

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

  async function handleAddTemplate(template: SkillTemplate) {
    setAddingTemplate(template.id);
    try {
      const scope =
        template.defaultScope === "organization" && isOrgAdmin
          ? "organization"
          : "user";
      await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          slug: template.slug,
          description: template.description,
          content: template.content,
          arguments: template.arguments,
          scope,
        }),
      });
      await fetchSkills();
    } finally {
      setAddingTemplate(null);
    }
  }

  if (loading) {
    return (
      <Container className="py-10">
        <p className="text-text-tertiary">Loading...</p>
      </Container>
    );
  }

  const hasSkills = allSkills.length > 0;
  const visibleTemplates = showAllTemplates || !hasSkills ? templates : templates.slice(0, 4);

  return (
    <Container className="py-10">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Skills</h1>
        <Button size="sm" onClick={() => setCreating("user")}>
          + New Skill
        </Button>
      </div>
      <p className="mb-8 text-sm text-text-secondary">
        Skills are reusable prompt templates available to your MCP clients. Use /skill-name or
        select from prompts.
      </p>

      {/* Templates section */}
      {!hasSkills && (
        <p className="mb-4 text-sm text-text-secondary">
          Get started by adding skills from our templates, or create your own.
        </p>
      )}

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
          {hasSkills ? "Skill Templates" : "Templates"}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleTemplates.map((tpl) => {
            const alreadyAdded = existingSlugs.has(tpl.slug);
            const isAdding = addingTemplate === tpl.id;
            return (
              <Card key={tpl.id} hover={false} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{tpl.name}</h3>
                      <Badge variant={tpl.category === "integration" ? "accent" : "default"}>
                        {tpl.category === "integration"
                          ? tpl.requiredIntegration?.replace("_", " ") ?? "Integration"
                          : "General"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{tpl.description}</p>
                  </div>
                  <div className="shrink-0">
                    {alreadyAdded ? (
                      <span className="inline-flex items-center text-xs text-text-tertiary">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="mr-1"
                        >
                          <path d="M3 8.5l3.5 3.5 6.5-7" />
                        </svg>
                        Added
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAddTemplate(tpl)}
                        disabled={isAdding}
                      >
                        {isAdding ? "..." : "+ Add"}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {hasSkills && templates.length > 4 && (
          <button
            onClick={() => setShowAllTemplates(!showAllTemplates)}
            className="mt-3 text-xs text-accent hover:underline"
          >
            {showAllTemplates
              ? "Show fewer templates"
              : `Show all ${templates.length} templates`}
          </button>
        )}
      </div>

      {/* Skills list */}
      {hasSkills && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Your Skills
          </h2>
          <SkillList
            skills={allSkills}
            canEdit={true}
            teamNames={teamNames}
            onEdit={setEditing}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        </>
      )}

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
