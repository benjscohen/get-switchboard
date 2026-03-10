"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { modelLabel } from "@/lib/agent-models";
import { STATUS_CONFIG } from "@/lib/threads/status-config";
import { TagPill } from "./tag-pill";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import type { ThreadSession, ThreadMessage } from "@/lib/threads/types";

interface SessionDetailProps {
  session: ThreadSession;
  onClose: () => void;
  onComplete: () => void;
  onStop: () => void;
  onReopen: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  isStopping?: boolean;
  messageInputRef?: React.Ref<HTMLTextAreaElement>;
}

export function SessionDetail({
  session,
  onClose,
  onComplete,
  onStop,
  onReopen,
  onRetry,
  onRefresh,
  isStopping,
  messageInputRef,
}: SessionDetailProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);

  const isActive = ["pending", "running", "idle"].includes(session.status);
  const isIdle = session.status === "idle";
  const isFailed = session.status === "failed" || session.status === "timeout";
  const isDone = ["completed", "failed", "timeout"].includes(session.status);
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;

  const latestCreatedAt = useRef<string | null>(null);
  const polling = useRef(false);

  const fetchAllMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/threads/${session.id}/messages`);
      if (res.ok) {
        const msgs: ThreadMessage[] = await res.json();
        setMessages(msgs);
        if (msgs.length > 0) {
          latestCreatedAt.current = msgs[msgs.length - 1].createdAt;
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingMsgs(false);
    }
  }, [session.id]);

  const fetchNewMessages = useCallback(async () => {
    if (!latestCreatedAt.current || polling.current) return;
    polling.current = true;
    try {
      const res = await fetch(
        `/api/threads/${session.id}/messages?after=${encodeURIComponent(latestCreatedAt.current)}`
      );
      if (res.ok) {
        const newMsgs: ThreadMessage[] = await res.json();
        if (newMsgs.length > 0) {
          latestCreatedAt.current = newMsgs[newMsgs.length - 1].createdAt;
          const newIds = new Set(newMsgs.map((m) => m.id));
          setMessages((prev) => [
            ...prev.filter((m) => !m.id.startsWith("temp-") && !newIds.has(m.id)),
            ...newMsgs,
          ]);
        }
      }
    } catch {
      /* ignore */
    } finally {
      polling.current = false;
    }
  }, [session.id]);

  useEffect(() => {
    latestCreatedAt.current = null;
    fetchAllMessages();
    if (isActive) {
      const interval = setInterval(fetchNewMessages, 1000);
      return () => clearInterval(interval);
    }
  }, [fetchAllMessages, fetchNewMessages, isActive]);

  const handleRespond = async (message: string, files: File[] = []) => {
    const optimistic: ThreadMessage = {
      id: `temp-${Date.now()}`,
      sessionId: session.id,
      role: "user",
      content: message,
      metadata: { source: "web" },
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      if (files.length > 0) {
        const formData = new FormData();
        formData.append("message", message);
        for (const file of files) {
          formData.append("files", file);
        }
        await fetch(`/api/threads/${session.id}/respond`, {
          method: "POST",
          body: formData,
        });
      } else {
        await fetch(`/api/threads/${session.id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
      }
      onRefresh();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant={config.variant}>{config.detailLabel}</Badge>
            {session.tags.length > 0 && session.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
            {session.model && (
              <span className="text-xs text-text-tertiary">
                {modelLabel(session.model)}
              </span>
            )}
            {session.totalTurns != null && (
              <span className="text-xs text-text-tertiary">
                {session.totalTurns} turns
              </span>
            )}
          </div>
          {session.title && (
            <h2 className="text-base font-semibold text-text-primary mb-1">
              {session.title}
            </h2>
          )}
          <p className="text-sm text-text-secondary line-clamp-2 leading-snug">
            {session.prompt}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            Started {new Date(session.createdAt).toLocaleString()}
            {session.completedAt &&
              ` · Completed ${new Date(session.completedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.status === "running" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onStop}
              disabled={isStopping}
            >
              {isStopping ? "Stopping..." : <>Stop <kbd className="ml-1.5 rounded border border-border bg-bg-hover px-1 text-[10px] font-medium text-text-tertiary">S</kbd></>}
            </Button>
          )}
          {isIdle && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onComplete}
            >
              Mark Done <kbd className="ml-1.5 rounded border border-border bg-bg-hover px-1 text-[10px] font-medium text-text-tertiary">E</kbd>
            </Button>
          )}
          {session.status === "completed" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onReopen}
            >
              Reopen <kbd className="ml-1.5 rounded border border-border bg-bg-hover px-1 text-[10px] font-medium text-text-tertiary">U</kbd>
            </Button>
          )}
          {isFailed && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetry}
            >
              Retry <kbd className="ml-1.5 rounded border border-border bg-bg-hover px-1 text-[10px] font-medium text-text-tertiary">U</kbd>
            </Button>
          )}
        </div>
      </div>

      {/* Error bar */}
      {session.error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2">
          <p className="text-xs text-red-600">{session.error}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} loading={loadingMsgs} sessionId={session.id} sessionStatus={session.status} />
      </div>

      {/* Input */}
      {(isIdle || isDone) && <MessageInput onSend={handleRespond} textareaRef={messageInputRef} />}
    </div>
  );
}
