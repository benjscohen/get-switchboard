"use client";
import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { KanbanBoard } from "@/components/threads/kanban-board";
import { SessionList } from "@/components/threads/session-list";
import { SessionDetail } from "@/components/threads/session-detail";
import type { KanbanData } from "@/lib/threads/types";

export default function ThreadsPage() {
  const [data, setData] = useState<KanbanData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/threads");
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const selectedSession =
    selectedId && data
      ? (data.active.find((s) => s.id === selectedId) ??
        data.waiting.find((s) => s.id === selectedId) ??
        data.done.find((s) => s.id === selectedId) ??
        null)
      : null;

  const totalCount = data
    ? data.active.length + data.waiting.length + data.done.length
    : 0;

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      {/* Compact header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-text-primary">Threads</h1>
          {data && (
            <span className="text-xs text-text-tertiary">
              {data.active.length} active &middot; {data.waiting.length} waiting &middot; {data.done.length} done
            </span>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {loading ? (
          <div className="flex-1 p-6">
            <div className="grid grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ))}
            </div>
          </div>
        ) : !data || totalCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-text-secondary">No threads yet</p>
              <p className="mt-1 text-xs text-text-tertiary">
                Sessions will appear here when agents run
              </p>
            </div>
          </div>
        ) : selectedSession ? (
          <>
            {/* Sidebar — compact session list */}
            <div className="w-80 shrink-0 border-r border-border">
              <SessionList
                data={data}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            {/* Detail panel */}
            <div className="flex-1 min-w-0">
              <SessionDetail
                session={selectedSession}
                onClose={() => setSelectedId(null)}
                onAction={fetchData}
              />
            </div>
          </>
        ) : (
          /* Full kanban view */
          <div className="flex-1 overflow-y-auto p-6">
            <KanbanBoard
              data={data}
              onSelectSession={setSelectedId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
