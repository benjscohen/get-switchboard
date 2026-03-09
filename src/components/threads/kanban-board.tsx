import { KanbanColumn } from "./kanban-column";
import type { KanbanData } from "@/lib/threads/types";

interface KanbanBoardProps {
  data: KanbanData;
  onSelectSession: (id: string) => void;
}

export function KanbanBoard({ data, onSelectSession }: KanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <KanbanColumn
        title="Active"
        color="accent"
        sessions={data.active}
        onSelect={onSelectSession}
      />
      <KanbanColumn
        title="Waiting on User"
        color="yellow"
        sessions={data.waiting}
        onSelect={onSelectSession}
      />
      <KanbanColumn
        title="Done"
        color="green"
        sessions={data.done}
        onSelect={onSelectSession}
      />
    </div>
  );
}
