"use client";
import { useState, useMemo } from "react";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { KanbanData, ThreadSession } from "@/lib/threads/types";

interface SessionListProps {
  data: KanbanData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAction: () => void;
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
  onMarkDone,
}: {
  session: ThreadSession;
  selected: boolean;
  onClick: () => void;
  onMarkDone?: () => void;
}) {
  const isActive = session.status === "pending" || session.status === "running";
  const isIdle = session.status === "idle";
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
        "group w-full text-left px-4 py-3 border-b border-border transition-colors",
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
        <div className="flex items-center gap-1.5 shrink-0">
          {isIdle && onMarkDone && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkDone();
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-green-600 hover:bg-green-50 transition-all"
              title="Mark done"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </button>
          )}
          <span className="text-[11px] text-text-tertiary whitespace-nowrap">
            {timeStr}
          </span>
        </div>
      </div>
      <p className="text-sm text-text-primary leading-snug line-clamp-2">
        {prompt}
      </p>
    </button>
  );
}

export function SessionList({ data, selectedId, onSelect, onAction }: SessionListProps) {
  const [search, setSearch] = useState("");

  const allSessions = useMemo(
    () => [...data.active, ...data.waiting, ...data.done],
    [data],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return allSessions.filter((s) => s.prompt.toLowerCase().includes(q));
  }, [search, allSessions]);

  const handleMarkDone = async (id: string) => {
    try {
      await fetch(`/api/threads/${id}/complete`, { method: "POST" });
      onAction();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <Input
          placeholder="Search threads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered !== null ? (
          // Search results — flat list
          filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-text-tertiary">No matching threads</p>
            </div>
          ) : (
            filtered.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                selected={s.id === selectedId}
                onClick={() => onSelect(s.id)}
                onMarkDone={s.status === "idle" ? () => handleMarkDone(s.id) : undefined}
              />
            ))
          )
        ) : (
          // Grouped view
          (() => {
            const hasAny = sections.some(({ key }) => data[key].length > 0);
            if (!hasAny) {
              return (
                <div className="flex items-center justify-center py-12">
                  <p className="text-xs text-text-tertiary">No threads yet</p>
                </div>
              );
            }
            return sections.map(({ key, label, dot }) => {
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
                      onMarkDone={s.status === "idle" ? () => handleMarkDone(s.id) : undefined}
                    />
                  ))}
                </div>
              );
            });
          })()
        )}
      </div>
    </div>
  );
}
