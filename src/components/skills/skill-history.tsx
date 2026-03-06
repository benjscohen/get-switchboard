"use client";

import { VersionHistory, type BaseVersion } from "@/components/ui/version-history";

interface SkillVersion extends BaseVersion {
  skillId: string;
  name: string;
  description: string | null;
  content: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  enabled: boolean;
  changeType: "created" | "updated" | "rolled_back";
  changedBy: string;
}

interface SkillHistoryProps {
  skillId: string;
  skillName: string;
  currentVersion?: number;
  onRollback: (version: number) => Promise<void>;
  onClose: () => void;
}

const changeTypeLabels: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  rolled_back: "Rolled back",
};

const changeTypeBadgeVariants: Record<string, "default" | "accent" | "success"> = {
  created: "success",
  updated: "accent",
  rolled_back: "default",
};

export function SkillHistory({ skillId, skillName, currentVersion, onRollback, onClose }: SkillHistoryProps) {
  return (
    <VersionHistory<SkillVersion>
      apiUrl={`/api/skills/${skillId}/versions`}
      subtitle={skillName}
      currentVersion={currentVersion}
      changeTypeLabels={changeTypeLabels}
      changeTypeBadgeVariants={changeTypeBadgeVariants}
      renderDetail={(v) => (
        <>
          <div>
            <span className="text-xs font-medium text-text-secondary">Name:</span>
            <span className="ml-2 text-sm">{v.name}</span>
          </div>
          {v.description && (
            <div>
              <span className="text-xs font-medium text-text-secondary">Description:</span>
              <span className="ml-2 text-sm">{v.description}</span>
            </div>
          )}
          <div>
            <span className="text-xs font-medium text-text-secondary">Content:</span>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-bg-hover p-3 text-xs whitespace-pre-wrap">
              {v.content}
            </pre>
          </div>
          {v.arguments.length > 0 && (
            <div>
              <span className="text-xs font-medium text-text-secondary">
                Arguments: {v.arguments.map((a) => a.name).join(", ")}
              </span>
            </div>
          )}
        </>
      )}
      onRollback={onRollback}
      onClose={onClose}
    />
  );
}
