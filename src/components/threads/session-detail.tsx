"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { modelLabel } from "@/lib/agent-models";
import { STATUS_CONFIG } from "@/lib/threads/status-config";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import type { ThreadSession, ThreadMessage } from "@/lib/threads/types";

interface SessionDetailProps {
  session: ThreadSession;
  onClose: () => void;
  onAction: () => void;
}

export function SessionDetail({ session, onClose, onAction }: SessionDetailProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [stopping, setStopping] = useState(false);

  const isActive = ["pending", "running", "idle"].includes(session.status);
  const isIdle = session.status === "idle";
  const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/threads/${session.id}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoadingMsgs(false);
    }
  }, [session.id]);

  useEffect(() => {
    fetchMessages();
    if (isActive) {
      const interval = setInterval(fetchMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [fetchMessages, isActive]);

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

  const handleRespond = async (message: string) => {
    // Optimistically add the message
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
      await fetch(`/api/threads/${session.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      onAction();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl bg-bg border-l border-border flex flex-col h-full animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={config.variant}>{config.detailLabel}</Badge>
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
            <p className="text-sm text-text-primary line-clamp-2">
              {session.prompt}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Started {new Date(session.createdAt).toLocaleString()}
              {session.completedAt &&
                ` · Completed ${new Date(session.completedAt).toLocaleString()}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary p-1"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Action bar */}
        {isActive && (
          <div className="flex items-center gap-3 border-b border-border px-6 py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStop}
              disabled={stopping}
            >
              {stopping ? "Stopping..." : "Stop"}
            </Button>
            {session.error && (
              <span className="text-xs text-red-500 truncate">
                {session.error}
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <MessageList messages={messages} loading={loadingMsgs} />
        </div>

        {/* Input (only when idle) */}
        {isIdle && <MessageInput onSend={handleRespond} />}
      </div>
    </div>
  );
}
