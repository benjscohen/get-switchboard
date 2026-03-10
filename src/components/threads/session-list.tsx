"use client";
import { useState, useEffect } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import type { KanbanData, ThreadSession, SearchResponse } from "@/lib/threads/types";
import { TagPill } from "./tag-pill";

interface SessionListProps {
  data: KanbanData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onRetry: (id: string) => void;
  stoppingIds: Set<string>;
  searchInputRef?: React.Ref<HTMLInputElement>;
  onSearchChange: (query: string) => void;
  onSearchTrigger: (query: string, page?: number) => void;
  searchResults: SearchResponse | null;
  searching: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

const sections: { key: keyof Pick<KanbanData, "active" | "waiting" | "done">; label: string; dot: string }[] = [
  { key: "active", label: "Active", dot: "bg-accent" },
  { key: "waiting", label: "Waiting", dot: "bg-yellow-500" },
  { key: "done", label: "Done", dot: "bg-green-500" },
];

const rowTransition = { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const };

function SessionRow({
  session,
  selected,
  onClick,
  onMarkDone,
  onReopen,
  onRetry,
  isStopping,
}: {
  session: ThreadSession;
  selected: boolean;
  onClick: () => void;
  onMarkDone?: () => void;
  onReopen?: () => void;
  onRetry?: () => void;
  isStopping?: boolean;
}) {
  const isActive = session.status === "pending" || session.status === "running";
  const isIdle = session.status === "idle";
  const timeStr = session.completedAt
    ? formatRelativeTime(session.completedAt)
    : formatRelativeTime(session.updatedAt);
  const displayTitle = session.title ?? (
    truncate(session.prompt, 80)
  );

  return (
    <motion.div
      layoutId={session.id}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={rowTransition}
      layout
    >
      <button
        data-session-id={session.id}
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
            {isActive && !isStopping && (
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
            )}
            {isStopping && (
              <span className="text-[10px] font-medium text-yellow-600">Stopping...</span>
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
            {onReopen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReopen();
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-yellow-600 hover:bg-yellow-50 transition-all"
                title="Reopen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 1 9 9" />
                  <polyline points="1 17 3 21 7 19" />
                </svg>
              </button>
            )}
            {onRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-tertiary hover:text-orange-600 hover:bg-orange-50 transition-all"
                title="Retry"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-9-9" />
                  <polyline points="21 3 21 9 15 9" />
                </svg>
              </button>
            )}
            <span className="text-[11px] text-text-tertiary whitespace-nowrap">
              {timeStr}
            </span>
          </div>
        </div>
        <p className={cn(
          "text-sm leading-snug line-clamp-1",
          session.title ? "font-medium text-text-primary" : "text-text-primary"
        )}>
          {displayTitle}
        </p>
        {session.title && (
          <p className="text-xs text-text-tertiary line-clamp-1 mt-0.5">
            {session.prompt.length > 80 ? session.prompt.slice(0, 80) + "..." : session.prompt}
          </p>
        )}
        {session.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {session.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
        )}
      </button>
    </motion.div>
  );
}

export function SessionList({
  data,
  selectedId,
  onSelect,
  onComplete,
  onReopen,
  onRetry,
  stoppingIds,
  searchInputRef,
  onSearchChange,
  onSearchTrigger,
  searchResults,
  searching,
  onLoadMore,
  loadingMore,
}: SessionListProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Trigger server search when debounced value changes
  useEffect(() => {
    onSearchChange(debouncedSearch);
    if (debouncedSearch.trim()) {
      onSearchTrigger(debouncedSearch);
    }
  }, [debouncedSearch, onSearchChange, onSearchTrigger]);

  const isSearchActive = debouncedSearch.trim().length > 0;
  const hasMoreDone = data.done.length < data.counts.done;

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <Input
          ref={searchInputRef}
          placeholder="Search threads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <LayoutGroup>
          {isSearchActive ? (
            // Server search results
            searching && !searchResults ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-2 text-sm text-text-tertiary">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </div>
              </div>
            ) : searchResults && searchResults.results.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-text-tertiary">No matching threads</p>
              </div>
            ) : searchResults ? (
              <>
                <div className="px-4 py-2 border-b border-border">
                  <span className="text-xs text-text-tertiary">
                    {searchResults.total} result{searchResults.total !== 1 ? "s" : ""}
                    {searching && (
                      <span className="ml-1.5 inline-block h-3 w-3 animate-spin rounded-full border border-text-tertiary border-t-transparent align-middle" />
                    )}
                  </span>
                </div>
                <AnimatePresence mode="popLayout">
                  {searchResults.results.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      selected={s.id === selectedId}
                      onClick={() => onSelect(s.id)}
                      onMarkDone={s.status === "idle" ? () => onComplete(s.id) : undefined}
                      onReopen={s.status === "completed" ? () => onReopen(s.id) : undefined}
                      onRetry={["failed", "timeout"].includes(s.status) ? () => onRetry(s.id) : undefined}
                      isStopping={stoppingIds.has(s.id)}
                    />
                  ))}
                </AnimatePresence>
                {searchResults.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <button
                      onClick={() => onSearchTrigger(debouncedSearch, searchResults.page - 1)}
                      disabled={searchResults.page <= 1}
                      className="text-xs font-medium text-accent disabled:opacity-30 disabled:cursor-not-allowed hover:underline"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-text-tertiary">
                      Page {searchResults.page} of {searchResults.totalPages}
                    </span>
                    <button
                      onClick={() => onSearchTrigger(debouncedSearch, searchResults.page + 1)}
                      disabled={searchResults.page >= searchResults.totalPages}
                      className="text-xs font-medium text-accent disabled:opacity-30 disabled:cursor-not-allowed hover:underline"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : null
          ) : (
            // Grouped kanban view
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
                const count = data.counts[key];
                if (sessions.length === 0 && count === 0) return null;
                return (
                  <div key={key}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-2 border-b border-border">
                      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                      <span className="text-xs font-medium text-text-secondary">{label}</span>
                      <span className="text-[11px] text-text-tertiary">
                        {count}
                      </span>
                    </div>
                    <AnimatePresence mode="popLayout">
                      {sessions.map((s) => (
                        <SessionRow
                          key={s.id}
                          session={s}
                          selected={s.id === selectedId}
                          onClick={() => onSelect(s.id)}
                          onMarkDone={s.status === "idle" ? () => onComplete(s.id) : undefined}
                          onReopen={s.status === "completed" ? () => onReopen(s.id) : undefined}
                          onRetry={["failed", "timeout"].includes(s.status) ? () => onRetry(s.id) : undefined}
                          isStopping={stoppingIds.has(s.id)}
                        />
                      ))}
                    </AnimatePresence>
                    {key === "done" && hasMoreDone && (
                      <button
                        onClick={onLoadMore}
                        disabled={loadingMore}
                        className="w-full px-4 py-3 text-xs font-medium text-accent hover:bg-bg-hover transition-colors disabled:opacity-50 border-b border-border"
                      >
                        {loadingMore ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent" />
                            Loading...
                          </span>
                        ) : (
                          `Load more (${data.counts.done - data.done.length} remaining)`
                        )}
                      </button>
                    )}
                  </div>
                );
              });
            })()
          )}
        </LayoutGroup>
      </div>
    </div>
  );
}
