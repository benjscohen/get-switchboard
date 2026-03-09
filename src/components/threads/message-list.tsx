"use client";
import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Skeleton } from "@/components/ui/skeleton";
import type { ThreadMessage } from "@/lib/threads/types";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ThreadMessage[];
  loading: boolean;
  sessionId?: string;
}

function getToolName(message: ThreadMessage): string {
  const meta = message.metadata;
  if (meta?.toolName) return String(meta.toolName);
  if (meta?.tool_name) return String(meta.tool_name);
  // Try to extract from content — tool results often start with the tool name
  const firstLine = message.content.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length < 60 && !firstLine.startsWith("{")) {
    return firstLine;
  }
  return "Tool call";
}

function formatToolContent(content: string): { formatted: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(content);
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { formatted: content, isJson: false };
  }
}

function ToolMessage({ message }: { message: ThreadMessage }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = getToolName(message);
  const { formatted } = formatToolContent(message.content);

  return (
    <div className="mx-6 my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors"
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="font-medium">{toolName}</span>
      </button>
      {expanded && (
        <pre className="mt-1 ml-6 max-h-64 overflow-auto rounded-md bg-bg-hover p-3 text-xs font-mono text-text-secondary border border-border">
          {formatted}
        </pre>
      )}
    </div>
  );
}

interface FileAttachment {
  name: string;
  storagePath: string;
  mimeType: string;
}

function FileAttachments({ files, sessionId }: { files: FileAttachment[]; sessionId?: string }) {
  if (!files.length || !sessionId) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file, i) => {
        const isImage = file.mimeType.startsWith("image/");
        return (
          <FileAttachmentItem key={i} file={file} sessionId={sessionId} isImage={isImage} />
        );
      })}
    </div>
  );
}

function FileAttachmentItem({ file, sessionId, isImage }: { file: FileAttachment; sessionId: string; isImage: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchUrl = async () => {
    if (url || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/threads/${sessionId}/files?path=${encodeURIComponent(file.storagePath)}`);
      if (res.ok) {
        const data = await res.json();
        setUrl(data.url);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch URL for images on mount
  useEffect(() => {
    if (isImage) fetchUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImage]);

  if (isImage) {
    if (loading) {
      return (
        <div className="h-48 w-64 animate-pulse rounded-lg bg-bg-hover border border-border" />
      );
    }
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={url}
            alt={file.name}
            className="max-h-64 max-w-sm rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow"
          />
        </a>
      );
    }
  }

  // Non-image file or image that failed to load
  return (
    <button
      onClick={fetchUrl}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2 text-sm hover:bg-bg-hover transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span className="text-text-secondary">{file.name}</span>
      {error && <span className="text-xs text-red-500">Failed</span>}
      {loading && <span className="text-xs text-text-tertiary">Loading...</span>}
    </button>
  );
}

// Collapse consecutive tool messages into a single group
function ToolGroup({ messages }: { messages: ThreadMessage[] }) {
  const [expanded, setExpanded] = useState(false);

  if (messages.length === 1) {
    return <ToolMessage message={messages[0]} />;
  }

  const toolNames = messages.map((m) => getToolName(m));

  return (
    <div className="mx-6 my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors"
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="font-medium">{messages.length} tool calls</span>
        <span className="text-text-tertiary">({toolNames.slice(0, 3).join(", ")}{toolNames.length > 3 ? ", ..." : ""})</span>
      </button>
      {expanded && (
        <div className="ml-4 mt-1 space-y-0.5">
          {messages.map((m) => (
            <ToolMessage key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageList({ messages, loading, sessionId }: MessageListProps) {
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

  // Group consecutive tool messages together
  const groups: Array<{ type: "tool-group"; messages: ThreadMessage[] } | { type: "message"; message: ThreadMessage }> = [];

  for (const msg of messages) {
    if (msg.role === "tool") {
      const last = groups[groups.length - 1];
      if (last && last.type === "tool-group") {
        last.messages.push(msg);
      } else {
        groups.push({ type: "tool-group", messages: [msg] });
      }
    } else {
      groups.push({ type: "message", message: msg });
    }
  }

  return (
    <div className="p-6 space-y-1">
      {groups.map((group, i) => {
        if (group.type === "tool-group") {
          return <ToolGroup key={group.messages[0].id} messages={group.messages} />;
        }

        const msg = group.message;

        if (msg.role === "user") {
          const userFiles = (msg.metadata?.fileAttachments as FileAttachment[] | undefined) ?? [];
          return (
            <div key={msg.id} className="flex justify-end my-2">
              <div className="max-w-[80%] rounded-xl rounded-br-sm bg-accent/10 px-4 py-2.5 text-sm text-text-primary">
                {msg.content}
                {userFiles.length > 0 && (
                  <FileAttachments files={userFiles} sessionId={sessionId} />
                )}
              </div>
            </div>
          );
        }

        // assistant
        const fileAttachments = (msg.metadata?.fileAttachments as FileAttachment[] | undefined) ?? [];
        return (
          <div key={msg.id} className="my-2 max-w-[85%]">
            <MarkdownContent content={msg.content} />
            {fileAttachments.length > 0 && (
              <FileAttachments files={fileAttachments} sessionId={sessionId} />
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
