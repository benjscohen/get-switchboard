"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionList } from "@/components/threads/session-list";
import { SessionDetail } from "@/components/threads/session-detail";
import { ComposeThread } from "@/components/threads/compose-thread";
import { KeyboardShortcutsHelp } from "@/components/threads/keyboard-shortcuts-help";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useToast } from "@/components/ui/toast";
import type { KanbanData, ThreadSession, SearchResponse } from "@/lib/threads/types";

type OptimisticAction = "complete" | "stop" | "reopen" | "retry";

const DONE_PAGE_SIZE = 20;

export default function ThreadsPage() {
  const [data, setData] = useState<KanbanData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const searchVersionRef = useRef(0);
  const doneLoadedCountRef = useRef(DONE_PAGE_SIZE);
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/threads?doneLimit=${DONE_PAGE_SIZE}&doneOffset=0`);
      if (!res.ok) return;
      const json = await res.json() as KanbanData;
      setData((prev) => {
        if (!prev || prev.done.length <= DONE_PAGE_SIZE) {
          // First load or no extra pages loaded — replace all
          doneLoadedCountRef.current = json.done.length;
          return json;
        }
        // Preserve extra loaded done pages: replace first page, keep the rest
        const extraDone = prev.done.slice(DONE_PAGE_SIZE);
        const mergedDone = [...json.done, ...extraDone.filter(
          (s) => !json.done.some((d) => d.id === s.id)
        )];
        doneLoadedCountRef.current = mergedDone.length;
        return { ...json, done: mergedDone };
      });
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

  const loadMoreDone = useCallback(async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      const offset = data.done.length;
      const res = await fetch(`/api/threads?doneLimit=${DONE_PAGE_SIZE}&doneOffset=${offset}`);
      if (!res.ok) return;
      const json = await res.json() as KanbanData;
      setData((prev) => {
        if (!prev) return prev;
        const existingIds = new Set(prev.done.map((s) => s.id));
        const newDone = json.done.filter((s) => !existingIds.has(s.id));
        const merged = [...prev.done, ...newDone];
        doneLoadedCountRef.current = merged.length;
        return { ...prev, done: merged, counts: json.counts };
      });
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [data, loadingMore]);

  const searchServer = useCallback(async (query: string, page: number) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    const version = ++searchVersionRef.current;
    setSearching(true);
    try {
      const res = await fetch(`/api/threads?search=${encodeURIComponent(query)}&page=${page}&limit=20`);
      if (!res.ok || version !== searchVersionRef.current) return;
      const json = await res.json() as SearchResponse;
      if (version !== searchVersionRef.current) return;
      setSearchResults(json);
    } catch {
      /* ignore */
    } finally {
      if (version === searchVersionRef.current) {
        setSearching(false);
      }
    }
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      searchVersionRef.current++;
    }
  }, []);

  // Trigger server search when debounced query changes (debounce is in SessionList)
  const handleSearchTrigger = useCallback((query: string, page?: number) => {
    searchServer(query, page ?? 1);
  }, [searchServer]);

  const allSessions = searchResults
    ? searchResults.results
    : data
      ? [...data.active, ...data.waiting, ...data.done]
      : [];

  const selectedSession = selectedId
    ? allSessions.find((s) => s.id === selectedId) ?? null
    : null;

  const totalCount = data
    ? (data.counts?.active ?? data.active.length) +
      (data.counts?.waiting ?? data.waiting.length) +
      (data.counts?.done ?? data.done.length)
    : 0;

  const handleNewThread = () => {
    setSelectedId(null);
    setComposing(true);
  };

  const handleCreated = (id: string) => {
    if (data) {
      const placeholder: ThreadSession = {
        id,
        status: "pending",
        prompt: "Starting...",
        result: null,
        error: null,
        model: null,
        totalTurns: null,
        title: null,
        tags: ["web"],
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

  const applyOptimisticAction = useCallback(
    (sessionId: string, action: OptimisticAction) => {
      if (!data) return;
      const snapshot = { ...data };

      // Find which section the session is in
      const findAndRemove = (): { session: ThreadSession; section: "active" | "waiting" | "done" } | null => {
        for (const section of ["active", "waiting", "done"] as const) {
          const idx = data[section].findIndex((s) => s.id === sessionId);
          if (idx !== -1) {
            const session = data[section][idx];
            return { session, section };
          }
        }
        return null;
      };

      const found = findAndRemove();
      if (!found) return;
      const { session, section } = found;

      // Build new data with session moved
      const newData: KanbanData = {
        active: data.active.filter((s) => s.id !== sessionId),
        waiting: data.waiting.filter((s) => s.id !== sessionId),
        done: data.done.filter((s) => s.id !== sessionId),
        counts: { ...data.counts },
      };

      if (action === "complete") {
        const updated = { ...session, status: "completed" as const, completedAt: new Date().toISOString() };
        newData.done = [updated, ...newData.done];
        if (section !== "done") {
          newData.counts[section]--;
          newData.counts.done++;
        }
      } else if (action === "stop") {
        // Keep in active but mark as stopping
        const updated = { ...session };
        newData.active = [...newData.active, updated];
        setStoppingIds((prev) => new Set(prev).add(sessionId));
      } else if (action === "reopen") {
        const updated = { ...session, status: "idle" as const, completedAt: null };
        newData.waiting = [updated, ...newData.waiting];
        if (section !== "waiting") {
          newData.counts[section]--;
          newData.counts.waiting++;
        }
      } else if (action === "retry") {
        const updated = { ...session, status: "pending" as const, completedAt: null };
        newData.active = [updated, ...newData.active];
        if (section !== "active") {
          newData.counts[section]--;
          newData.counts.active++;
        }
      }

      setData(newData);

      // Fire API call
      const isRetry = action === "retry";
      const apiCall = isRetry
        ? fetch(`/api/threads/${sessionId}/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Please retry from where you left off." }),
          })
        : fetch(
            ({
              complete: `/api/threads/${sessionId}/complete`,
              stop: `/api/threads/${sessionId}/stop`,
              reopen: `/api/threads/${sessionId}/reopen`,
            } as Record<string, string>)[action]!,
            { method: "POST" },
          );

      apiCall
        .then((res) => {
          if (!res.ok) throw new Error("API error");
          if (action === "stop") {
            setStoppingIds((prev) => {
              const next = new Set(prev);
              next.delete(sessionId);
              return next;
            });
          }
          // Show success toast with undo for complete/reopen
          if (action === "complete") {
            addToast("Marked as done", "success", {
              label: "Undo",
              onClick: () => applyOptimisticAction(sessionId, "reopen"),
            });
          } else if (action === "reopen") {
            addToast("Reopened", "success", {
              label: "Undo",
              onClick: () => applyOptimisticAction(sessionId, "complete"),
            });
          } else if (action === "retry") {
            addToast("Retrying...", "success");
          }
        })
        .catch(() => {
          // Rollback
          setData(snapshot);
          setStoppingIds((prev) => {
            const next = new Set(prev);
            next.delete(sessionId);
            return next;
          });
          addToast("Action failed — reverted", "error");
        })
        .finally(() => {
          // Reconcile with server after a short delay
          setTimeout(fetchData, 500);
        });
    },
    [data, fetchData, addToast],
  );

  const navigateBy = useCallback(
    (delta: number) => {
      if (allSessions.length === 0) return;
      if (composing) {
        setComposing(false);
        setSelectedId(delta > 0 ? allSessions[0].id : allSessions[allSessions.length - 1].id);
        return;
      }
      const currentIdx = selectedId
        ? allSessions.findIndex((s) => s.id === selectedId)
        : -1;
      let nextIdx: number;
      if (currentIdx === -1) {
        nextIdx = delta > 0 ? 0 : allSessions.length - 1;
      } else {
        nextIdx = Math.max(0, Math.min(allSessions.length - 1, currentIdx + delta));
      }
      const nextId = allSessions[nextIdx].id;
      setSelectedId(nextId);
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-session-id="${nextId}"]`);
        el?.scrollIntoView({ block: "nearest" });
      });
    },
    [allSessions, selectedId, composing],
  );

  // Hotkeys — plain object, ref-based hook doesn't need memoization
  const hotkeys: Record<string, (e: KeyboardEvent) => void> = {
    j: () => navigateBy(1),
    arrowdown: () => navigateBy(1),
    k: () => navigateBy(-1),
    arrowup: () => navigateBy(-1),
    c: () => handleNewThread(),
    "/": () => searchInputRef.current?.focus(),
    r: () => messageInputRef.current?.focus(),
    e: () => {
      if (selectedSession?.status === "idle") {
        applyOptimisticAction(selectedSession.id, "complete");
      }
    },
    s: () => {
      if (selectedSession?.status === "running") {
        applyOptimisticAction(selectedSession.id, "stop");
      }
    },
    u: () => {
      if (selectedSession?.status === "completed") {
        applyOptimisticAction(selectedSession.id, "reopen");
      } else if (selectedSession?.status === "failed" || selectedSession?.status === "timeout") {
        applyOptimisticAction(selectedSession.id, "retry");
      }
    },
    "?": () => setShowHelp((v) => !v),
    escape: () => {
      if (showHelp) {
        setShowHelp(false);
      } else if (composing) {
        setComposing(false);
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
  };

  useHotkeys(hotkeys, !loading);

  const showTwoPanel = !loading && (totalCount > 0 || composing);

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      {/* Compact header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-text-primary">Threads</h1>
          {data && (
            <span className="text-xs text-text-tertiary">
              {data.counts.active} active &middot; {data.counts.waiting} waiting &middot; {data.counts.done} done
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <>
              <button
                onClick={() => setShowHelp(true)}
                className="rounded-lg px-2 py-1.5 text-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
                title="Keyboard shortcuts"
              >
                <kbd className="rounded border border-border bg-bg-hover px-1.5 py-0.5 text-xs font-medium">?</kbd>
              </button>
              <button
                onClick={handleNewThread}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                + New
                <kbd className="ml-1.5 rounded border border-white/20 bg-white/10 px-1 text-[10px] font-medium">C</kbd>
              </button>
            </>
          )}
        </div>
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
                onComplete={(id) => applyOptimisticAction(id, "complete")}
                onReopen={(id) => applyOptimisticAction(id, "reopen")}
                onRetry={(id) => applyOptimisticAction(id, "retry")}
                stoppingIds={stoppingIds}
                searchInputRef={searchInputRef}
                onSearchChange={handleSearchChange}
                onSearchTrigger={handleSearchTrigger}
                searchResults={searchResults}
                searching={searching}
                onLoadMore={loadMoreDone}
                loadingMore={loadingMore}
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
                  onComplete={() => applyOptimisticAction(selectedSession.id, "complete")}
                  onStop={() => applyOptimisticAction(selectedSession.id, "stop")}
                  onReopen={() => applyOptimisticAction(selectedSession.id, "reopen")}
                  onRetry={() => applyOptimisticAction(selectedSession.id, "retry")}
                  onRefresh={fetchData}
                  isStopping={stoppingIds.has(selectedSession.id)}
                  messageInputRef={messageInputRef}
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

      <AnimatePresence>
        {showHelp && <KeyboardShortcutsHelp onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </div>
  );
}
