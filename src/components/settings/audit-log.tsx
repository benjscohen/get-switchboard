"use client";

import { useState, useEffect, useCallback } from "react";
import { Select } from "@/components/ui/select";
import { AuditEventList } from "@/components/settings/audit-event-list";
import type { AuditEvent } from "@/lib/audit-log";

interface AuditData {
  events: AuditEvent[];
  page: number;
  totalPages: number;
  total: number;
}

const RESOURCE_TYPES = [
  { value: "", label: "All resources" },
  { value: "organization", label: "Organization" },
  { value: "organization_domain", label: "Domain" },
  { value: "member", label: "Member" },
  { value: "api_key", label: "API Key" },
  { value: "agent_key", label: "Agent Key" },
  { value: "connection", label: "Connection" },
  { value: "skill", label: "Skill" },
  { value: "agent", label: "Agent" },
  { value: "schedule", label: "Schedule" },
  { value: "team", label: "Team" },
  { value: "team_member", label: "Team Member" },
  { value: "secret", label: "Secret" },
  { value: "secret_share", label: "Secret Share" },
  { value: "file", label: "File" },
  { value: "folder", label: "Folder" },
  { value: "mcp_server", label: "MCP Server" },
  { value: "profile", label: "Profile" },
];

export function AuditLog() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7d");
  const [resourceType, setResourceType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });

    // Convert period to since timestamp
    const now = new Date();
    if (period === "24h") {
      params.set("since", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    } else if (period === "7d") {
      params.set("since", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
    } else if (period === "30d") {
      params.set("since", new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
    }

    if (resourceType) params.set("resourceType", resourceType);

    const res = await fetch(`/api/audit-events?${params}`);
    if (res.ok) {
      const json = await res.json();
      // Map snake_case from API to camelCase
      setData({
        events: (json.events ?? []).map((e: Record<string, unknown>) => ({
          id: e.id,
          actorId: e.actor_id,
          actorType: e.actor_type,
          actorName: e.actor_name,
          eventType: e.event_type,
          resourceType: e.resource_type,
          resourceId: e.resource_id,
          description: e.description,
          metadata: e.metadata ?? {},
          previousAttributes: e.previous_attributes,
          createdAt: e.created_at,
        })),
        page: json.page,
        totalPages: json.totalPages,
        total: json.total,
      });
    }
    setLoading(false);
  }, [page, period, resourceType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [period, resourceType]);

  // Client-side search filter on event type + description
  const filteredEvents = data?.events.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.eventType.toLowerCase().includes(q) ||
      (e.description?.toLowerCase().includes(q) ?? false) ||
      (e.actorName?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          options={[
            { value: "24h", label: "Last 24 hours" },
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
          ]}
        />
        <Select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          options={RESOURCE_TYPES}
        />
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent"
        />
        {data && (
          <span className="ml-auto text-sm text-text-secondary">
            {data.total} total events
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-bg-hover animate-pulse" />
                <div className="h-4 w-40 rounded bg-bg-hover animate-pulse" />
                <div className="h-4 w-32 rounded bg-bg-hover animate-pulse" />
                <div className="ml-auto h-4 w-20 rounded bg-bg-hover animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : data ? (
        <div className="rounded-xl border border-border bg-bg-card">
          <AuditEventList
            events={filteredEvents ?? []}
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </div>
  );
}
