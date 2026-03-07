"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useEscapeKey } from "@/hooks/use-escape-key";
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

interface AgentPreviewProps {
  agent: Agent;
  teamNames: Record<string, string>;
  onEdit: () => void;
  onHistory: () => void;
  onClose: () => void;
}


export function AgentPreview({ agent, teamNames, onEdit, onHistory, onClose }: AgentPreviewProps) {
  useEscapeKey(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <Badge>agent:{scopePrefix(agent.scope)}:{agent.slug}</Badge>
            <Badge variant="accent">{scopeBadgeLabel(agent.scope, agent.teamId, teamNames)}</Badge>
            {!agent.enabled && (
              <Badge variant="default">Disabled</Badge>
            )}
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
          {agent.description && (
            <p className="text-sm text-text-secondary">{agent.description}</p>
          )}

          {agent.toolAccess.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
                Tool Access
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {agent.toolAccess.map((tool) => (
                  <span key={tool} className="rounded-md bg-bg-hover px-2 py-0.5 text-xs font-mono">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {agent.model && (
            <div>
              <h3 className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
                Model
              </h3>
              <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent">
                {agent.model}
              </span>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
              Instructions
            </h3>
            <div className="rounded-lg border border-border bg-bg p-4">
              <MarkdownContent content={agent.instructions} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border p-6 pt-4">
          <Button size="sm" variant="ghost" onClick={onHistory}>
            History
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
