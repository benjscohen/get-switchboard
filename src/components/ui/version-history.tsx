"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEscapeKey } from "@/hooks/use-escape-key";

export interface BaseVersion {
  id: string;
  version: number;
  changeType: string;
  changeSummary: string | null;
  createdAt: string;
}

interface VersionHistoryProps<T extends BaseVersion> {
  apiUrl: string;
  subtitle: string;
  subtitleMono?: boolean;
  currentVersion?: number;
  changeTypeLabels: Record<string, string>;
  changeTypeBadgeVariants: Record<string, "default" | "accent" | "success">;
  renderDetail: (version: T) => ReactNode;
  onRollback: (version: number) => Promise<void>;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistory<T extends BaseVersion>({
  apiUrl,
  subtitle,
  subtitleMono,
  currentVersion,
  changeTypeLabels,
  changeTypeBadgeVariants,
  renderDetail,
  onRollback,
  onClose,
}: VersionHistoryProps<T>) {
  const [versions, setVersions] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  useEscapeKey(onClose);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    const res = await fetch(apiUrl);
    if (res.ok) {
      setVersions(await res.json());
    }
    setLoading(false);
  }, [apiUrl]);

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
      <div className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Version History</h2>
            <p className={`text-sm text-text-secondary ${subtitleMono ? "font-mono" : ""}`}>
              {subtitle}
            </p>
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
                  <div key={v.id} className="rounded-lg border border-border bg-bg-card">
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => setExpanded(isExpanded ? null : v.version)}
                    >
                      <span className="text-sm font-medium text-text-secondary">
                        v{v.version}
                      </span>
                      <Badge variant={changeTypeBadgeVariants[v.changeType]}>
                        {changeTypeLabels[v.changeType]}
                      </Badge>
                      {isCurrent && <Badge variant="accent">Current</Badge>}
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
                        {renderDetail(v)}
                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={rollingBack !== null}
                            onClick={() => handleRollback(v.version)}
                          >
                            {rollingBack === v.version
                              ? "Rolling back..."
                              : `Rollback to v${v.version}`}
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
