"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useEscapeKey } from "@/hooks/use-escape-key";

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

interface SkillPreviewProps {
  skill: Skill;
  teamNames: Record<string, string>;
  onEdit: () => void;
  onHistory: () => void;
  onClose: () => void;
}

function scopeBadgeLabel(skill: Skill, teamNames: Record<string, string>): string {
  if (skill.scope === "organization") return "Organization";
  if (skill.scope === "team") return teamNames[skill.teamId ?? ""] ?? "Team";
  return "Personal";
}

function scopePrefix(scope: string) {
  if (scope === "organization") return "org";
  if (scope === "team") return "team";
  return "user";
}

export function SkillPreview({ skill, teamNames, onEdit, onHistory, onClose }: SkillPreviewProps) {
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
            <h2 className="text-lg font-semibold">{skill.name}</h2>
            <Badge>{scopePrefix(skill.scope)}:{skill.slug}</Badge>
            <Badge variant="accent">{scopeBadgeLabel(skill, teamNames)}</Badge>
            {!skill.enabled && (
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
          {skill.description && (
            <p className="text-sm text-text-secondary">{skill.description}</p>
          )}

          {skill.arguments.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
                Arguments
              </h3>
              <div className="space-y-1">
                {skill.arguments.map((arg) => (
                  <div key={arg.name} className="flex items-center gap-2 text-sm">
                    <code className="rounded bg-bg-hover px-1.5 py-0.5 text-xs font-mono">
                      {arg.name}
                    </code>
                    {arg.required && (
                      <span className="text-xs text-accent">required</span>
                    )}
                    {arg.description && (
                      <span className="text-text-secondary">{arg.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
              Content
            </h3>
            <div className="rounded-lg border border-border bg-bg p-4">
              <MarkdownContent content={skill.content} highlightArgs />
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
