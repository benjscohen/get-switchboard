"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentList } from "@/components/agents/agent-list";
import { AgentEditor } from "@/components/agents/agent-editor";
import { AgentHistory } from "@/components/agents/agent-history";
import { AgentPreview } from "@/components/agents/agent-preview";
import type { AgentTemplate } from "@/lib/agents/templates";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string;
  toolAccess: string[];
  model: string | null;
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

interface AgentsData {
  organization: Agent[];
  team: Agent[];
  user: Agent[];
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentsData>({ organization: [], team: [], user: [] });
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState<"organization" | "team" | "user" | null>(null);
  const [orgRole, setOrgRole] = useState<string>("member");
  const [viewingHistory, setViewingHistory] = useState<Agent | null>(null);
  const [previewing, setPreviewing] = useState<Agent | null>(null);
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) {
      setAgents(await res.json());
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
    const res = await fetch("/api/agent-templates");
    if (res.ok) {
      setTemplates(await res.json());
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchTeams(), fetchOrgRole(), fetchTemplates()]).then(() =>
      setLoading(false)
    );
  }, [fetchAgents, fetchTeams, fetchOrgRole, fetchTemplates]);

  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";

  const canEditTeamIds = teams.map((t) => t.id);

  const teamNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of teams) map[t.id] = t.name;
    return map;
  }, [teams]);

  const { allAgents, existingSlugs } = useMemo(() => {
    const all = [...agents.organization, ...agents.team, ...agents.user];
    const slugs = new Set(all.map((a) => a.slug));
    return { allAgents: all, existingSlugs: slugs };
  }, [agents]);

  async function handleSave(data: Partial<Agent>) {
    if (editing) {
      await fetch(`/api/agents/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else if (creating) {
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, scope: data.scope ?? creating }),
      });
    }
    setEditing(null);
    setCreating(null);
    fetchAgents();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    fetchAgents();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    fetchAgents();
  }

  async function handleRollback(agentId: string, version: number) {
    await fetch(`/api/agents/${agentId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    fetchAgents();
  }

  async function handleAddTemplate(template: AgentTemplate) {
    setAddingTemplate(template.id);
    try {
      const scope =
        template.defaultScope === "organization" && isOrgAdmin
          ? "organization"
          : "user";
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          slug: template.slug,
          description: template.description,
          instructions: template.instructions,
          toolAccess: template.toolAccess,
          model: template.model,
          scope,
        }),
      });
      await fetchAgents();
    } finally {
      setAddingTemplate(null);
    }
  }

  const hasAgents = allAgents.length > 0;
  const visibleTemplates = showAllTemplates || !hasAgents ? templates : templates.slice(0, 4);

  return (
    <>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Reusable AI agent configurations available to your MCP clients.
        </p>
        <Button size="sm" onClick={() => setCreating("user")}>
          + New Agent
        </Button>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-8">
          <div>
            <div className="mb-3 h-4 w-24 rounded bg-bg-hover animate-pulse" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-bg-card p-4 animate-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-28 rounded bg-bg-hover" />
                        <div className="h-5 w-16 rounded bg-bg-hover" />
                      </div>
                      <div className="h-3 w-full rounded bg-bg-hover" />
                    </div>
                    <div className="h-8 w-14 rounded bg-bg-hover" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 h-4 w-24 rounded bg-bg-hover animate-pulse" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-bg-card p-4 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="h-4 w-32 rounded bg-bg-hover" />
                      <div className="h-3 w-48 rounded bg-bg-hover" />
                    </div>
                    <div className="h-8 w-20 rounded bg-bg-hover" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Templates section */}
      {!loading && !hasAgents && (
        <p className="mb-4 text-sm text-text-secondary">
          Get started by adding agents from our templates, or create your own.
        </p>
      )}

      {!loading && <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
          {hasAgents ? "Agent Templates" : "Templates"}
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
                          ? tpl.toolAccess.join(", ") || "Integration"
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

        {hasAgents && templates.length > 4 && (
          <button
            onClick={() => setShowAllTemplates(!showAllTemplates)}
            className="mt-3 text-xs text-accent hover:underline"
          >
            {showAllTemplates
              ? "Show fewer templates"
              : `Show all ${templates.length} templates`}
          </button>
        )}
      </div>}

      {/* Agents list */}
      {!loading && hasAgents && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Your Agents
          </h2>
          <AgentList
            agents={allAgents}
            canEdit={true}
            teamNames={teamNames}
            onEdit={setEditing}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onHistory={setViewingHistory}
            onPreview={setPreviewing}
          />
        </>
      )}

      {(editing || creating) && (
        <AgentEditor
          agent={editing ?? undefined}
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

      {previewing && (
        <AgentPreview
          agent={previewing}
          teamNames={teamNames}
          onEdit={() => {
            const agent = previewing;
            setPreviewing(null);
            setEditing(agent);
          }}
          onHistory={() => {
            const agent = previewing;
            setPreviewing(null);
            setViewingHistory(agent);
          }}
          onClose={() => setPreviewing(null)}
        />
      )}

      {viewingHistory && (
        <AgentHistory
          agentId={viewingHistory.id}
          agentName={viewingHistory.name}
          onRollback={(version) => handleRollback(viewingHistory.id, version)}
          onClose={() => setViewingHistory(null)}
        />
      )}
    </>
  );
}
