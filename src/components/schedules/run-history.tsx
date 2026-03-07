"use client";

import { useState, useEffect } from "react";
import { statusColor } from "./types";

interface Run {
  id: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  result: string | null;
  error: string | null;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function RunHistory({ scheduleId }: { scheduleId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/schedules/${scheduleId}/runs?limit=5`)
      .then((r) => r.ok ? r.json() : [])
      .then(setRuns)
      .finally(() => setLoading(false));
  }, [scheduleId]);

  if (loading) {
    return (
      <div className="mt-3 space-y-2 pl-4 border-l-2 border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-6 w-full rounded bg-bg-hover animate-pulse" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="mt-3 pl-4 border-l-2 border-border">
        <p className="text-xs text-text-tertiary">No runs yet</p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5 pl-4 border-l-2 border-border">
      <p className="text-xs font-medium text-text-secondary mb-2">Recent Runs</p>
      {runs.map((run) => (
        <div key={run.id} className="flex items-center gap-3 text-xs">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${statusColor(run.status)}`}>
            {run.status}
          </span>
          <span className="text-text-tertiary">{formatTime(run.scheduledAt)}</span>
          <span className="text-text-tertiary">{formatDuration(run.durationMs)}</span>
          {run.error && (
            <span className="text-red-400 truncate max-w-[200px]" title={run.error}>
              {run.error}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
