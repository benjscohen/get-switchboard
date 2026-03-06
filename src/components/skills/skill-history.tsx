"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SkillVersion {
  id: string;
  skillId: string;
  version: number;
  name: string;
  description: string | null;
  content: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  enabled: boolean;
  changeType: "created" | "updated" | "rolled_back";
  changedBy: string;
  changeSummary: string | null;
  createdAt: string;
}

interface SkillHistoryProps {
  skillId: string;
  skillName: string;
  currentVersion?: number;
  onRollback: (version: number) => Promise<void>;
  onClose: () => void;
}

const changeTypeLabel: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  rolled_back: "Rolled back",
};

const changeTypeBadgeVariant: Record<string, "default" | "accent" | "success"> = {
  created: "success",
  updated: "accent",
  rolled_back: "default",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SkillHistory({ skillId, skillName, currentVersion, onRollback, onClose }: SkillHistoryProps) {
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/skills/${skillId}/versions`);
    if (res.ok) {
      setVersions(await res.json());
    }
    setLoading(false);
  }, [skillId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  async function handleRollback(version: number) {
    setRollingBack(version);
    try {
      await onRollback(version);
      await fetchVersions();
    } finally {
      setRollingBack(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Version History</h2>
            <p className="text-sm text-text-secondary">{skillName}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border p-4 animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-12 rounded bg-bg-hover" />
                    <div className="h-5 w-16 rounded bg-bg-hover" />
                    <div className="ml-auto h-4 w-24 rounded bg-bg-hover" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && versions.length === 0 && (
            <p className="text-sm text-text-secondary">No version history available.</p>
          )}

          {!loading && versions.length > 0 && (
            <div className="space-y-2">
              {versions.map((v) => {
                const isCurrent = v.version === currentVersion;
                const isExpanded = expanded === v.version;
                return (
                  <div
                    key={v.id}
                    className="rounded-lg border border-border bg-bg-card"
                  >
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => setExpanded(isExpanded ? null : v.version)}
                    >
                      <span className="text-sm font-medium text-text-secondary">
                        v{v.version}
                      </span>
                      <Badge variant={changeTypeBadgeVariant[v.changeType]}>
                        {changeTypeLabel[v.changeType]}
                      </Badge>
                      {isCurrent && (
                        <Badge variant="accent">Current</Badge>
                      )}
                      {v.changeSummary && (
                        <span className="text-xs text-text-tertiary truncate">
                          {v.changeSummary}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-xs text-text-tertiary">
                        {formatDate(v.createdAt)}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`shrink-0 text-text-tertiary transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="M4 6l4 4 4-4" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 py-3 space-y-3">
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
                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={rollingBack !== null}
                            onClick={() => handleRollback(v.version)}
                          >
                            {rollingBack === v.version ? "Rolling back..." : `Rollback to v${v.version}`}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
