"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { modelLabel } from "@/lib/agent-models";
import { STATUS_CONFIG } from "@/lib/threads/status-config";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import type { ThreadSession, ThreadMessage } from "@/lib/threads/types";

interface SessionDetailProps {
  session: ThreadSession;
  onClose: () => void;
  onAction: () => void;
  messageInputRef?: React.Ref<HTMLTextAreaElement>;
}

export function SessionDetail({ session, onClose, onAction, messageInputRef }: SessionDetailProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [completing, setCompleting] = useState(false);


  const isActive = ["pending", "running", "idle"].includes(session.status);
  const isIdle = session.status === "idle";
  const isDone = ["completed", "failed", "timeout"].includes(session.status);
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;

  const latestCreatedAt = useRef<string | null>(null);
  const polling = useRef(false);

  // Full fetch — used on initial load and session change
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

  // Incremental fetch — only new messages since last known timestamp
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

  const handleStop = async () => {
    setStopping(true);
    try {
      await fetch(`/api/threads/${session.id}/stop`, { method: "POST" });
      onAction();
    } catch {
      /* ignore */
    } finally {
      setStopping(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await fetch(`/api/threads/${session.id}/complete`, { method: "POST" });
      onAction();
    } catch {
      /* ignore */
    } finally {
      setCompleting(false);
    }
  };

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
      onAction();
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
              <span
                key={tag}
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none",
                  tag === "web" ? "bg-blue-100 text-blue-700" :
                  tag === "slack" ? "bg-purple-100 text-purple-700" :
                  tag === "scheduled" ? "bg-amber-100 text-amber-700" :
                  "bg-neutral-100 text-neutral-600"
                )}
              >
                {tag}
              </span>
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
              onClick={handleStop}
              disabled={stopping}
            >
              {stopping ? "Stopping..." : <>Stop <kbd className="ml-1.5 rounded border border-border bg-bg-hover px-1 text-[10px] font-medium text-text-tertiary">S</kbd></>}
            </Button>
          )}
          {isIdle && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleComplete}
              disabled={completing}
            >
              {completing ? "Completing..." : <>Mark Done <kbd className="ml-1.5 rounded border border-border bg-bg-hover px-1 text-[10px] font-medium text-text-tertiary">E</kbd></>}
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
        <MessageList messages={messages} loading={loadingMsgs} sessionId={session.id} />
      </div>

      {/* Input */}
      {(isIdle || isDone) && <MessageInput onSend={handleRespond} textareaRef={messageInputRef} />}
    </div>
  );
}
