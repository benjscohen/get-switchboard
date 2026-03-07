"use client";

import { VersionHistory, type BaseVersion } from "@/components/ui/version-history";
import { MarkdownContent } from "@/components/ui/markdown-content";

interface AgentVersion extends BaseVersion {
  agentId: string;
  name: string;
  description: string | null;
  instructions: string;
  toolAccess: string[];
  model: string | null;
  enabled: boolean;
  changeType: "created" | "updated" | "rolled_back";
  changedBy: string;
}

interface AgentHistoryProps {
  agentId: string;
  agentName: string;
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

export function AgentHistory({ agentId, agentName, currentVersion, onRollback, onClose }: AgentHistoryProps) {
  return (
    <VersionHistory<AgentVersion>
      apiUrl={`/api/agents/${agentId}/versions`}
      subtitle={agentName}
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
            <span className="text-xs font-medium text-text-secondary">Instructions:</span>
            <div className="mt-1 max-h-48 overflow-auto rounded-md bg-bg-hover p-3">
              <MarkdownContent content={v.instructions} />
            </div>
          </div>
          {v.toolAccess.length > 0 && (
            <div>
              <span className="text-xs font-medium text-text-secondary">
                Tool Access: {v.toolAccess.map(e => { const colon = e.indexOf(":"); return colon === -1 ? e : e.slice(0, colon) + " > " + e.slice(colon + 1); }).join(", ")}
              </span>
            </div>
          )}
          {v.model && (
            <div>
              <span className="text-xs font-medium text-text-secondary">
                Model: {v.model}
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
