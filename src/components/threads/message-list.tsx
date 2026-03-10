"use client";
import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Skeleton } from "@/components/ui/skeleton";
import type { ThreadMessage } from "@/lib/threads/types";
import {
  parseMcpToolName,
  humanizeToolName,
  getServerDisplayInfo,
  resolveCallToolDisplay,
  resolveDiscoverToolsDisplay,
  getToolInputPreview,
} from "@/lib/tool-display";
import { formatToolInputPreview } from "@/lib/tool-input-preview";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: ThreadMessage[];
  loading: boolean;
  sessionId?: string;
  sessionStatus?: string;
}

function getToolName(message: ThreadMessage): string {
  const meta = message.metadata;
  if (meta?.toolName) return String(meta.toolName);
  if (meta?.tool_name) return String(meta.tool_name);
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

function ToolIcon({ serverName, iconPath, size = 14 }: { serverName: string | null; iconPath?: string; size?: number }) {
  if (iconPath) {
    return <img src={iconPath} width={size} height={size} alt="" className="shrink-0" />;
  }
  if (serverName) {
    const info = getServerDisplayInfo(serverName);
    if (info?.iconPath) {
      return <img src={info.iconPath} width={size} height={size} alt={info.displayName} className="shrink-0" />;
    }
    if (serverName === "supabase") {
      return (
        <svg width={size} height={size} viewBox="0 0 109 113" fill="none" className="shrink-0">
          <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fill="url(#supabase-a)" />
          <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fill="url(#supabase-b)" fillOpacity="0.2" />
          <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z" fill="#3ECF8E" />
          <defs>
            <linearGradient id="supabase-a" x1="53.9738" y1="54.974" x2="94.1635" y2="71.8295" gradientUnits="userSpaceOnUse">
              <stop stopColor="#249361" /><stop offset="1" stopColor="#3ECF8E" />
            </linearGradient>
            <linearGradient id="supabase-b" x1="36.1558" y1="30.578" x2="54.4844" y2="65.0806" gradientUnits="userSpaceOnUse">
              <stop /><stop offset="1" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    if (serverName === "context7") {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect width="24" height="24" rx="4" fill="#111" />
          <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#fff" fontFamily="system-ui">C7</text>
        </svg>
      );
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function resolveToolDisplay(message: ThreadMessage) {
  const rawToolName = getToolName(message);
  const parsed = parseMcpToolName(rawToolName);
  const innerToolName = parsed.toolName;

  if (innerToolName === "call_tool") {
    const resolved = resolveCallToolDisplay(message.content);
    if (resolved) {
      const label = resolved.integrationName
        ? `${resolved.integrationName}: ${resolved.displayName}`
        : resolved.displayName;
      return { label, iconPath: resolved.iconPath, serverName: parsed.serverName };
    }
  }

  if (innerToolName === "discover_tools") {
    const label = resolveDiscoverToolsDisplay(message.content);
    return { label, iconPath: "/integrations/switchboard.svg", serverName: parsed.serverName };
  }

  return {
    label: humanizeToolName(innerToolName),
    iconPath: undefined as string | undefined,
    serverName: parsed.serverName,
  };
}

function getPreviewText(message: ThreadMessage): string {
  const rawToolName = getToolName(message);
  return getToolInputPreview(rawToolName, message.content, formatToolInputPreview);
}

/** Checkmark icon for completed tools */
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-emerald-500">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Spinning gear icon for active tools */
function GearSpinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-text-tertiary animate-spin">
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  );
}

function ToolMessage({ message, isLastTool, isRunning }: { message: ThreadMessage; isLastTool: boolean; isRunning: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { label, iconPath, serverName } = resolveToolDisplay(message);
  const preview = getPreviewText(message);
  const { formatted } = formatToolContent(message.content);
  const showGear = isLastTool && isRunning;

  return (
    <div className="px-6 py-0.5">
      <div className="flex items-center gap-1.5 min-w-0 text-xs">
        {showGear ? <GearSpinIcon /> : <CheckIcon />}
        <ToolIcon serverName={serverName} iconPath={iconPath} />
        <span className="font-medium text-text-secondary whitespace-nowrap">{label}</span>
        {preview && (
          <>
            <span className="text-text-tertiary">&mdash;</span>
            <span className="text-text-tertiary truncate min-w-0">{preview}</span>
          </>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto shrink-0 rounded p-0.5 text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors"
          title={expanded ? "Collapse" : "Expand JSON"}
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
        </button>
      </div>
      {expanded && (
        <pre className="mt-1 ml-5 max-h-64 overflow-auto rounded-md bg-bg-hover p-3 text-xs font-mono text-text-secondary border border-border">
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

/** Flat trail of tool calls — always visible, matching Slack density */
function ToolGroup({ messages, isLastGroup, isRunning }: { messages: ThreadMessage[]; isLastGroup: boolean; isRunning: boolean }) {
  return (
    <div className="my-1">
      {messages.map((m, i) => (
        <ToolMessage
          key={m.id}
          message={m}
          isLastTool={isLastGroup && i === messages.length - 1}
          isRunning={isRunning}
        />
      ))}
    </div>
  );
}

export function MessageList({ messages, loading, sessionId, sessionStatus }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const isRunning = sessionStatus === "running";

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

  // Find the last tool group index for "running" gear icon
  let lastToolGroupIdx = -1;
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].type === "tool-group") {
      lastToolGroupIdx = i;
      break;
    }
  }

  return (
    <div className="p-6 space-y-1">
      {groups.map((group, i) => {
        if (group.type === "tool-group") {
          return (
            <ToolGroup
              key={group.messages[0].id}
              messages={group.messages}
              isLastGroup={i === lastToolGroupIdx}
              isRunning={isRunning}
            />
          );
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
