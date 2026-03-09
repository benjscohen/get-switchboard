"use client";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { KanbanData, ThreadSession } from "@/lib/threads/types";

interface SessionListProps {
  data: KanbanData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const sections: { key: keyof KanbanData; label: string; dot: string }[] = [
  { key: "active", label: "Active", dot: "bg-accent" },
  { key: "waiting", label: "Waiting", dot: "bg-yellow-500" },
  { key: "done", label: "Done", dot: "bg-green-500" },
];

function SessionRow({
  session,
  selected,
  onClick,
}: {
  session: ThreadSession;
  selected: boolean;
  onClick: () => void;
}) {
  const isActive = session.status === "pending" || session.status === "running";
  const timeStr = session.completedAt
    ? formatRelativeTime(session.completedAt)
    : formatRelativeTime(session.updatedAt);
  const prompt =
    session.prompt.length > 80
      ? session.prompt.slice(0, 80) + "..."
      : session.prompt;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border transition-colors",
        selected
          ? "bg-accent/5 border-l-2 border-l-accent"
          : "hover:bg-bg-hover border-l-2 border-l-transparent"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isActive && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          )}
          <span className="text-xs text-text-tertiary truncate">
            {session.model ?? "Agent"}
          </span>
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

export function SessionList({ data, selectedId, onSelect }: SessionListProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {sections.map(({ key, label, dot }) => {
        const sessions = data[key];
        if (sessions.length === 0) return null;
        return (
          <div key={key}>
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-2 border-b border-border">
              <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
              <span className="text-xs font-medium text-text-secondary">{label}</span>
              <span className="text-[11px] text-text-tertiary">{sessions.length}</span>
            </div>
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                selected={s.id === selectedId}
                onClick={() => onSelect(s.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
