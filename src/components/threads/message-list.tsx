"use client";
import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Skeleton } from "@/components/ui/skeleton";
import type { ThreadMessage } from "@/lib/threads/types";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ThreadMessage[];
  loading: boolean;
}

function ToolMessage({ message }: { message: ThreadMessage }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mx-6 my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn("transition-transform", expanded && "rotate-90")}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Tool call
      </button>
      {expanded && (
        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-bg-hover p-3 text-xs font-mono text-text-secondary">
          {message.content}
        </pre>
      )}
    </div>
  );
}

export function MessageList({ messages, loading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="ml-auto h-10 w-1/2" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-text-tertiary">
        No messages yet
      </p>
    );
  }

  return (
    <div className="p-6 space-y-1">
      {messages.map((msg) => {
        if (msg.role === "tool")
          return <ToolMessage key={msg.id} message={msg} />;

        if (msg.role === "user") {
          return (
            <div key={msg.id} className="flex justify-end my-2">
              <div className="max-w-[80%] rounded-xl rounded-br-sm bg-accent/10 px-4 py-2.5 text-sm text-text-primary">
                {msg.content}
              </div>
            </div>
          );
        }

        // assistant
        return (
          <div key={msg.id} className="my-2 max-w-[85%]">
            <MarkdownContent content={msg.content} />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
