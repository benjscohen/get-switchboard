"use client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format-time";
import { modelLabel } from "@/lib/agent-models";
import { STATUS_CONFIG } from "@/lib/threads/status-config";
import type { ThreadSession } from "@/lib/threads/types";

interface SessionCardProps {
  session: ThreadSession;
  onClick: () => void;
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;
  const isActive =
    session.status === "pending" || session.status === "running";
  const truncatedPrompt =
    session.prompt.length > 120
      ? session.prompt.slice(0, 120) + "..."
      : session.prompt;
  const timeStr = session.completedAt
    ? formatRelativeTime(session.completedAt)
    : formatRelativeTime(session.updatedAt);

  return (
    <Card className="cursor-pointer p-4" onClick={onClick}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
          )}
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        <span className="text-xs text-text-tertiary whitespace-nowrap">
          {timeStr}
        </span>
      </div>
      <p className="text-sm text-text-primary mb-2 line-clamp-3">
        {truncatedPrompt}
      </p>
      <div className="flex items-center gap-3 text-xs text-text-tertiary">
        {session.model && <span>{modelLabel(session.model)}</span>}
        {session.totalTurns != null && (
          <span>{session.totalTurns} turns</span>
        )}
      </div>
    </Card>
  );
}
