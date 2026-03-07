"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { scopePrefix, scopeBadgeLabel } from "@/lib/shared/scope-utils";

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

interface AgentListProps {
  agents: Agent[];
  canEdit: boolean;
  teamNames: Record<string, string>;
  onEdit: (agent: Agent) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onHistory: (agent: Agent) => void;
  onPreview: (agent: Agent) => void;
}

export function AgentList({
  agents,
  canEdit,
  teamNames,
  onEdit,
  onDelete,
  onToggle,
  onHistory,
  onPreview,
}: AgentListProps) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <Card
          key={agent.id}
          hover={false}
          className="p-4 cursor-pointer transition-colors hover:bg-bg-hover/50"
          role="button"
          tabIndex={0}
          onClick={() => onPreview(agent)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPreview(agent); } }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{agent.name}</h3>
                <Badge>
                  agent:{scopePrefix(agent.scope)}:{agent.slug}
                </Badge>
                <Badge variant="accent">{scopeBadgeLabel(agent.scope, agent.teamId, teamNames)}</Badge>
                {agent.toolAccess.length > 0 && (
                  <span className="text-xs text-text-tertiary">
                    {agent.toolAccess.length} tool{agent.toolAccess.length !== 1 ? "s" : ""}
                  </span>
                )}
                {agent.model && (
                  <span className="text-xs text-text-tertiary">{agent.model}</span>
                )}
                {!agent.enabled && (
                  <span className="text-xs text-text-tertiary">(disabled)</span>
                )}
              </div>
              {agent.description && (
                <p className="mt-1 text-xs text-text-secondary">{agent.description}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onToggle(agent.id, !agent.enabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    agent.enabled ? "bg-accent" : "bg-border"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      agent.enabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <Button size="sm" variant="ghost" onClick={() => onHistory(agent)}>
                  History
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEdit(agent)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(agent.id)}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
