"use client";

import { useState } from "react";
import type { AuditEvent } from "@/lib/audit-log";
import { formatRelativeTime } from "@/lib/format-time";

function getEventColor(eventType: string): string {
  if (eventType.endsWith(".created") || eventType.endsWith(".added")) return "bg-green-500";
  if (eventType.endsWith(".updated") || eventType.endsWith(".role_changed")) return "bg-blue-500";
  if (eventType.endsWith(".deleted") || eventType.endsWith(".removed") || eventType.endsWith(".revoked")) return "bg-red-500";
  if (eventType.endsWith(".rolled_back")) return "bg-amber-500";
  return "bg-gray-400";
}

export function AuditEventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);

  const hasDetails =
    Object.keys(event.metadata).length > 0 || event.previousAttributes;

  return (
    <div>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
          hasDetails ? "cursor-pointer hover:bg-bg-hover" : "cursor-default"
        }`}
      >
        {/* Color dot */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${getEventColor(event.eventType)}`} />

        {/* Event type badge */}
        <span className="shrink-0 rounded bg-bg-hover px-2 py-0.5 font-mono text-xs text-text-secondary">
          {event.eventType}
        </span>

        {/* Description or actor */}
        <span className="min-w-0 flex-1 truncate text-text-primary">
          {event.description || event.eventType}
        </span>

        {/* Actor */}
        <span className="shrink-0 text-text-secondary">
          {event.actorName || event.actorId}
        </span>

        {/* Time */}
        <span className="shrink-0 text-text-tertiary" title={new Date(event.createdAt).toLocaleString()}>
          {formatRelativeTime(event.createdAt)}
        </span>

        {/* Expand indicator */}
        {hasDetails && (
          <svg
            className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 bg-bg-hover/30 px-4 py-3 pl-9">
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-text-tertiary">Time:</dt>
              <dd className="text-text-secondary">{new Date(event.createdAt).toLocaleString()}</dd>
            </div>
            {event.resourceId && (
              <div className="flex gap-2">
                <dt className="text-text-tertiary">Resource:</dt>
                <dd className="font-mono text-xs text-text-secondary">
                  {event.resourceType}/{event.resourceId}
                </dd>
              </div>
            )}
            {event.actorType !== "user" && (
              <div className="flex gap-2">
                <dt className="text-text-tertiary">Actor type:</dt>
                <dd className="text-text-secondary">{event.actorType}</dd>
              </div>
            )}

            {/* Previous attributes (what changed) */}
            {event.previousAttributes && Object.keys(event.previousAttributes).length > 0 && (
              <div>
                <dt className="mb-1 text-text-tertiary">Changes:</dt>
                <dd className="space-y-1">
                  {Object.entries(event.previousAttributes).map(([key, oldVal]) => {
                    const newVal = event.metadata[key];
                    return (
                      <div key={key} className="font-mono text-xs">
                        <span className="text-text-tertiary">{key}:</span>{" "}
                        <span className="text-red-400 line-through">{JSON.stringify(oldVal)}</span>{" "}
                        <span className="text-green-400">{JSON.stringify(newVal)}</span>
                      </div>
                    );
                  })}
                </dd>
              </div>
            )}

            {/* Metadata */}
            {Object.keys(event.metadata).length > 0 && !event.previousAttributes && (
              <div>
                <dt className="mb-1 text-text-tertiary">Details:</dt>
                <dd>
                  <pre className="rounded bg-bg-card p-2 font-mono text-xs text-text-secondary">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
