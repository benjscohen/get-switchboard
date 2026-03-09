import { SessionCard } from "./session-card";
import type { ThreadSession } from "@/lib/threads/types";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  title: string;
  color: "accent" | "yellow" | "green";
  sessions: ThreadSession[];
  onSelect: (id: string) => void;
}

const dotColors = {
  accent: "bg-accent",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
};

export function KanbanColumn({
  title,
  color,
  sessions,
  onSelect,
}: KanbanColumnProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dotColors[color])} />
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <span className="text-xs text-text-tertiary">({sessions.length})</span>
      </div>
      <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-tertiary">
            No sessions
          </p>
        ) : (
          sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onClick={() => onSelect(s.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
