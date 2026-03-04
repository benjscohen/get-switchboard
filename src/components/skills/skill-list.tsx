"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

interface SkillListProps {
  skills: Skill[];
  canEdit: boolean;
  onEdit: (skill: Skill) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

function scopePrefix(scope: string) {
  if (scope === "organization") return "org";
  if (scope === "team") return "team";
  return "user";
}

export function SkillList({ skills, canEdit, onEdit, onDelete, onToggle }: SkillListProps) {
  if (skills.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-tertiary">
        No skills yet.{canEdit && " Create one to get started."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {skills.map((skill) => (
        <Card key={skill.id} hover={false} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{skill.name}</h3>
                <Badge>
                  {scopePrefix(skill.scope)}:{skill.slug}
                </Badge>
                {skill.arguments.length > 0 && (
                  <span className="text-xs text-text-tertiary">
                    {skill.arguments.length} arg{skill.arguments.length !== 1 ? "s" : ""}
                  </span>
                )}
                {!skill.enabled && (
                  <span className="text-xs text-text-tertiary">(disabled)</span>
                )}
              </div>
              {skill.description && (
                <p className="mt-1 text-xs text-text-secondary">{skill.description}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onToggle(skill.id, !skill.enabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    skill.enabled ? "bg-accent" : "bg-border"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      skill.enabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <Button size="sm" variant="ghost" onClick={() => onEdit(skill)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(skill.id)}>
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
