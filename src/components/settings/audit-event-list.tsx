"use client";

import { AuditEventRow } from "@/components/settings/audit-event-row";
import type { AuditEvent } from "@/lib/audit-log";

interface AuditEventListProps {
  events: AuditEvent[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function AuditEventList({ events, page, totalPages, onPageChange }: AuditEventListProps) {
  return (
    <div>
      <div className="divide-y divide-border">
        {events.map((event) => (
          <AuditEventRow key={event.id} event={event} />
        ))}
        {events.length === 0 && (
          <div className="py-12 text-center text-text-tertiary">
            No audit events found
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded border border-border px-3 py-1 text-sm transition-colors hover:bg-bg-hover disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-border px-3 py-1 text-sm transition-colors hover:bg-bg-hover disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
