"use client";
import { useState, useEffect, useCallback } from "react";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { KanbanBoard } from "@/components/threads/kanban-board";
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

  // Find the selected session across all columns for the detail view
  const selectedSession =
    selectedId && data
      ? (data.active.find((s) => s.id === selectedId) ??
        data.waiting.find((s) => s.id === selectedId) ??
        data.done.find((s) => s.id === selectedId) ??
        null)
      : null;

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Threads</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Monitor and manage your agent sessions
        </p>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : data ? (
        <KanbanBoard data={data} onSelectSession={setSelectedId} />
      ) : (
        <p className="text-text-secondary">Failed to load threads.</p>
      )}
      {selectedSession && (
        <SessionDetail
          session={selectedSession}
          onClose={() => setSelectedId(null)}
          onAction={fetchData}
        />
      )}
    </Container>
  );
}
