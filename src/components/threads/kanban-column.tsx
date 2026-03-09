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

const bgColors = {
  accent: "bg-accent/5",
  yellow: "bg-yellow-500/5",
  green: "bg-green-500/5",
};

export function KanbanColumn({
  title,
  color,
  sessions,
  onSelect,
}: KanbanColumnProps) {
  return (
    <div className={cn("flex flex-col rounded-xl", bgColors[color])}>
      <div className="flex items-center gap-2 px-4 py-3">
        <span className={cn("h-2 w-2 rounded-full", dotColors[color])} />
        <h2 className="text-sm font-medium text-text-primary">{title}</h2>
        <span className="ml-auto rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-tertiary">
          {sessions.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-text-tertiary">No sessions</p>
          </div>
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
