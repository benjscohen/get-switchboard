"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { StatCard } from "@/components/admin/stat-card";
import { Select } from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentUsageStats {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  activeSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  uniqueUsers: number;
  sessionsOverTime: Array<{
    date: string;
    total: number;
    completed: number;
    failed: number;
  }>;
  messagesOverTime: Array<{
    date: string;
    total?: number;
    user_msgs?: number;
    assistant_msgs?: number;
    tool_msgs?: number;
  }>;
  userBreakdown: Array<{
    userId: string;
    userName: string | null;
    userEmail: string | null;
    sessionCount: number;
    completedCount: number;
    failedCount: number;
    inputTokens: number;
    outputTokens: number;
    messageCount: number;
    lastActive: string;
  }>;
  sessionsByModel: Array<{
    model: string;
    count: number;
  }>;
  activeSessionsList: Array<{
    id: string;
    userId: string;
    userName: string | null;
    userEmail: string | null;
    status: string;
    model: string;
    prompt: string;
    totalTurns: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  accent: "#635BFF",
  accentLight: "rgba(99, 91, 255, 0.15)",
  green: "#22c55e",
  greenLight: "rgba(34, 197, 94, 0.15)",
  red: "#ef4444",
  redLight: "rgba(239, 68, 68, 0.15)",
  amber: "#f59e0b",
  amberLight: "rgba(245, 158, 11, 0.15)",
  blue: "#3b82f6",
  blueLight: "rgba(59, 130, 246, 0.15)",
  gray: "#8898AA",
};

const PIE_COLORS = ["#635BFF", "#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4"];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Shared chart tooltip style
// ---------------------------------------------------------------------------

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#F6F9FC",
    border: "1px solid #E3E8EE",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#0A2540",
  },
};

// ---------------------------------------------------------------------------
// Sort helper
// ---------------------------------------------------------------------------

type SortField = "sessionCount" | "messageCount" | "inputTokens" | "outputTokens" | "lastActive";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentUsageDashboard() {
  const [data, setData] = useState<AgentUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7d");
  const [sortField, setSortField] = useState<SortField>("sessionCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-usage?period=${period}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh active sessions every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedUsers = data?.userBreakdown
    ? [...data.userBreakdown].sort((a, b) => {
        let aVal: number | string;
        let bVal: number | string;
        if (sortField === "lastActive") {
          aVal = new Date(a.lastActive).getTime();
          bVal = new Date(b.lastActive).getTime();
        } else {
          aVal = a[sortField];
          bVal = b[sortField];
        }
        return sortDir === "asc"
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      })
    : [];

  const sessionsChartData = data?.sessionsOverTime.map((d) => ({
    ...d,
    date: formatDate(d.date),
  })) ?? [];

  const messagesChartData = data?.messagesOverTime.map((d) => ({
    date: formatDate(d.date),
    total: d.total ?? ((d.user_msgs ?? 0) + (d.assistant_msgs ?? 0) + (d.tool_msgs ?? 0)),
  })) ?? [];

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-6">
              <div className="h-3 w-20 rounded bg-bg-hover animate-pulse" />
              <div className="mt-3 h-8 w-16 rounded bg-bg-hover animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-64 rounded-xl border border-border bg-bg-card animate-pulse" />
        <div className="h-64 rounded-xl border border-border bg-bg-card animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const totalTokens = data.totalInputTokens + data.totalOutputTokens;
  const successRate = data.totalSessions > 0
    ? ((data.completedSessions / data.totalSessions) * 100).toFixed(0)
    : "0";

  return (
    <div className="space-y-8">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          options={[
            { value: "24h", label: "Last 24 hours" },
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
          ]}
        />
        <span className="text-sm text-text-tertiary">Auto-refreshes every 30s</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Total Sessions"
          value={formatNumber(data.totalSessions)}
          detail={`${successRate}% success rate`}
        />
        <StatCard
          label="Total Messages"
          value={formatNumber(data.totalMessages)}
        />
        <StatCard
          label="Total Tokens"
          value={formatNumber(totalTokens)}
          detail={`${formatNumber(data.totalInputTokens)} in / ${formatNumber(data.totalOutputTokens)} out`}
        />
        <StatCard
          label="Active Now"
          value={data.activeSessions}
        />
        <StatCard
          label="Unique Users"
          value={data.uniqueUsers}
        />
      </div>

      {/* Sessions over time */}
      {sessionsChartData.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Sessions Over Time</h2>
          <div className="rounded-xl border border-border bg-bg-card p-6">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={sessionsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EE" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#8898AA" }} />
                <YAxis tick={{ fontSize: 12, fill: "#8898AA" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stackId="1"
                  stroke={CHART_COLORS.green}
                  fill={CHART_COLORS.greenLight}
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stackId="1"
                  stroke={CHART_COLORS.red}
                  fill={CHART_COLORS.redLight}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Messages over time */}
      {messagesChartData.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Messages Over Time</h2>
          <div className="rounded-xl border border-border bg-bg-card p-6">
            <ResponsiveContainer width="100%" height={280}>
              <RechartsBarChart data={messagesChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EE" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#8898AA" }} />
                <YAxis tick={{ fontSize: 12, fill: "#8898AA" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="total" name="Messages" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Two-column: Usage by user + Sessions by model */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Usage by user (wide) */}
        <section className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Usage by User</h2>
          <div className="rounded-xl border border-border bg-bg-card p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="pb-2 pr-4 font-medium">User</th>
                    <SortableHeader
                      label="Sessions"
                      field="sessionCount"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Messages"
                      field="messageCount"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Input Tokens"
                      field="inputTokens"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Output Tokens"
                      field="outputTokens"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Last Active"
                      field="lastActive"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedUsers.map((u) => (
                    <tr key={u.userId} className="hover:bg-bg-hover">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{u.userName || "—"}</div>
                        <div className="text-xs text-text-tertiary">{u.userEmail}</div>
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {u.sessionCount}
                        {u.failedCount > 0 && (
                          <span className="ml-1 text-xs text-red-500">
                            ({u.failedCount} failed)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{formatNumber(u.messageCount)}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatNumber(u.inputTokens)}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatNumber(u.outputTokens)}</td>
                      <td className="py-2 pr-4 text-text-secondary whitespace-nowrap">
                        {timeAgo(u.lastActive)}
                      </td>
                    </tr>
                  ))}
                  {sortedUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-tertiary">
                        No agent usage yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Sessions by model */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Sessions by Model</h2>
          <div className="rounded-xl border border-border bg-bg-card p-6">
            {data.sessionsByModel.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.sessionsByModel}
                      dataKey="count"
                      nameKey="model"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {data.sessionsByModel.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {data.sessionsByModel.map((m, i) => (
                    <div key={m.model} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-text-secondary">{m.model}</span>
                      </div>
                      <span className="tabular-nums font-medium">{m.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-text-tertiary">No data</p>
            )}
          </div>
        </section>
      </div>

      {/* Active sessions */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Active Sessions
          {data.activeSessions > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500/15 px-1.5 text-xs font-medium text-green-600">
              {data.activeSessions}
            </span>
          )}
        </h2>
        <div className="rounded-xl border border-border bg-bg-card p-4">
          {data.activeSessionsList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="pb-2 pr-4 font-medium">User</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 font-medium">Prompt</th>
                    <th className="pb-2 pr-4 font-medium">Started</th>
                    <th className="pb-2 pr-4 font-medium">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.activeSessionsList.map((s) => (
                    <tr key={s.id} className="hover:bg-bg-hover">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{s.userName || "—"}</div>
                        <div className="text-xs text-text-tertiary">{s.userEmail}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            s.status === "running"
                              ? "text-green-500"
                              : s.status === "idle"
                                ? "text-amber-500"
                                : "text-text-tertiary"
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-text-secondary">{s.model || "—"}</td>
                      <td className="py-2 pr-4 max-w-xs truncate text-text-secondary" title={s.prompt}>
                        {s.prompt.slice(0, 80)}{s.prompt.length > 80 ? "…" : ""}
                      </td>
                      <td className="py-2 pr-4 text-text-secondary whitespace-nowrap">
                        {timeAgo(s.createdAt)}
                      </td>
                      <td className="py-2 pr-4 text-text-secondary whitespace-nowrap">
                        {timeAgo(s.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-text-tertiary">
              No active sessions
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable header helper
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="cursor-pointer pb-2 pr-4 font-medium select-none hover:text-text-primary"
      onClick={() => onSort(field)}
    >
      {label}
      {isActive && (
        <span className="ml-1 text-accent">{dir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );
}
