"use client";
import { formatRelativeTime } from "@/lib/format-time";
import { modelLabel } from "@/lib/agent-models";
import type { ThreadSession } from "@/lib/threads/types";

interface SessionCardProps {
  session: ThreadSession;
  onClick: () => void;
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const isActive =
    session.status === "pending" || session.status === "running";
  const prompt =
    session.prompt.length > 100
      ? session.prompt.slice(0, 100) + "..."
      : session.prompt;
  const timeStr = session.completedAt
    ? formatRelativeTime(session.completedAt)
    : formatRelativeTime(session.updatedAt);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border bg-bg p-3.5 shadow-sm transition-all duration-150 hover:shadow-md hover:border-border-hover"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary min-w-0 truncate">
          {isActive && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          )}
          {session.model && <span>{modelLabel(session.model)}</span>}
          {session.totalTurns != null && (
            <>
              <span className="text-border">&middot;</span>
              <span>{session.totalTurns} turns</span>
            </>
          )}
        </div>
        <span className="text-[11px] text-text-tertiary whitespace-nowrap shrink-0">
          {timeStr}
        </span>
      </div>
      <p className="text-sm text-text-primary leading-snug line-clamp-2">
        {prompt}
      </p>
    </button>
  );
}
