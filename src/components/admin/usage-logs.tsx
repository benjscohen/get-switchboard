"use client";

import { useState, useEffect, useCallback } from "react";
import { UsageTable } from "@/components/admin/usage-table";
import { Select } from "@/components/ui/select";

interface UsageData {
  logs: Array<{
    id: string;
    userEmail: string | null;
    apiKeyPrefix: string | null;
    toolName: string | null;
    integrationId: string | null;
    status: string;
    errorMessage: string | null;
    durationMs: number | null;
    createdAt: string;
  }>;
  page: number;
  totalPages: number;
  total: number;
}

export function UsageLogs() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7d");
  const [status, setStatus] = useState("");
  const [tool, setTool] = useState("");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), period });
    if (status) params.set("status", status);
    if (tool) params.set("tool", tool);

    const res = await fetch(`/api/admin/usage?${params}`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }, [page, period, status, tool]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [period, status, tool]);

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
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            { value: "success", label: "Success" },
            { value: "error", label: "Error" },
            { value: "unauthorized", label: "Unauthorized" },
          ]}
        />
        <input
          type="text"
          placeholder="Filter by tool name..."
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent"
        />
        {data && (
          <span className="ml-auto text-sm text-text-secondary">
            {data.total} total logs
          </span>
        )}
      </div>

      {loading && !data ? (
        <div className="py-12 text-center text-text-tertiary">Loading...</div>
      ) : data ? (
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <UsageTable
            logs={data.logs}
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </div>
  );
}
