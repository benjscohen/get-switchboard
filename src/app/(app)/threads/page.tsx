"use client";
import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionList } from "@/components/threads/session-list";
import { SessionDetail } from "@/components/threads/session-detail";
import { ComposeThread } from "@/components/threads/compose-thread";
import type { KanbanData, ThreadSession } from "@/lib/threads/types";

export default function ThreadsPage() {
  const [data, setData] = useState<KanbanData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
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

  // Auto-select first session if none selected and not composing
  useEffect(() => {
    if (!selectedId && !composing && data) {
      const first =
        data.active[0] ?? data.waiting[0] ?? data.done[0] ?? null;
      if (first) setSelectedId(first.id);
    }
  }, [data, selectedId, composing]);

  const allSessions = data
    ? [...data.active, ...data.waiting, ...data.done]
    : [];

  const selectedSession = selectedId
    ? allSessions.find((s) => s.id === selectedId) ?? null
    : null;

  const totalCount = allSessions.length;

  const handleNewThread = () => {
    setSelectedId(null);
    setComposing(true);
  };

  const handleCreated = (id: string) => {
    // Optimistically inject a placeholder into active
    if (data) {
      const placeholder: ThreadSession = {
        id,
        status: "pending",
        prompt: "Starting...",
        result: null,
        error: null,
        model: null,
        totalTurns: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      };
      setData({
        ...data,
        active: [placeholder, ...data.active],
      });
    }
    setComposing(false);
    setSelectedId(id);
    fetchData();
  };

  const showTwoPanel = !loading && (totalCount > 0 || composing);

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
        {!loading && (
          <button
            onClick={handleNewThread}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            + New
          </button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {loading ? (
          <div className="flex-1 p-6">
            <div className="flex gap-6">
              <div className="w-80 space-y-3">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
              <div className="flex-1 space-y-4">
                <Skeleton className="h-16 w-3/4" />
                <Skeleton className="ml-auto h-10 w-1/2" />
                <Skeleton className="h-20 w-3/4" />
              </div>
            </div>
          </div>
        ) : !data || (!showTwoPanel && totalCount === 0) ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-text-secondary">No threads yet</p>
              <p className="mt-1 text-xs text-text-tertiary">
                Start a new thread to have an agent work on something
              </p>
              <button
                onClick={handleNewThread}
                className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                New Thread
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Sidebar — session list */}
            <div className="w-80 shrink-0 border-r border-border">
              <SessionList
                data={data}
                selectedId={selectedId}
                onSelect={(id) => {
                  setComposing(false);
                  setSelectedId(id);
                }}
                onAction={fetchData}
              />
            </div>
            {/* Detail panel */}
            <div className="flex-1 min-w-0">
              {composing ? (
                <ComposeThread
                  onCreated={handleCreated}
                  onCancel={() => setComposing(false)}
                />
              ) : selectedSession ? (
                <SessionDetail
                  session={selectedSession}
                  onClose={() => setSelectedId(null)}
                  onAction={fetchData}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-text-tertiary">
                    Select a thread to view messages
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
