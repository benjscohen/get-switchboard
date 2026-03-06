"use client";

import { VersionHistory, type BaseVersion } from "@/components/ui/version-history";

interface FileVersion extends BaseVersion {
  fileId: string;
  path: string;
  name: string;
  content: string | null;
  metadata: Record<string, unknown>;
  changeType: "created" | "updated" | "moved" | "rolled_back";
  changedBy: string;
}

interface FileHistoryProps {
  fileId: string;
  filePath: string;
  currentVersion?: number;
  onRollback: (version: number) => Promise<void>;
  onClose: () => void;
}

const changeTypeLabels: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  moved: "Moved",
  rolled_back: "Rolled back",
};

const changeTypeBadgeVariants: Record<string, "default" | "accent" | "success"> = {
  created: "success",
  updated: "accent",
  moved: "default",
  rolled_back: "default",
};

export function FileHistory({ fileId, filePath, currentVersion, onRollback, onClose }: FileHistoryProps) {
  return (
    <VersionHistory<FileVersion>
      apiUrl={`/api/files/${fileId}/versions`}
      subtitle={filePath}
      subtitleMono
      currentVersion={currentVersion}
      changeTypeLabels={changeTypeLabels}
      changeTypeBadgeVariants={changeTypeBadgeVariants}
      renderDetail={(v) => (
        <>
          <div>
            <span className="text-xs font-medium text-text-secondary">Content:</span>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-bg-hover p-3 text-xs whitespace-pre-wrap">
              {v.content ?? "(no content)"}
            </pre>
          </div>
          {Object.keys(v.metadata).length > 0 && (
            <div>
              <span className="text-xs font-medium text-text-secondary">Metadata:</span>
              <pre className="mt-1 rounded-md bg-bg-hover p-2 text-xs">
                {JSON.stringify(v.metadata, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
      onRollback={onRollback}
      onClose={onClose}
    />
  );
}
