import { supabaseAdmin } from "@/lib/supabase/admin";
import { StatCard } from "@/components/admin/stat-card";
import { BarChart } from "@/components/admin/bar-chart";

export default async function SettingsOverviewPage() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [statsResult, todayResult, recentResult] = await Promise.all([
    supabaseAdmin.rpc("get_admin_stats", {
      since_date: since7d.toISOString(),
    }),
    supabaseAdmin
      .from("usage_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    supabaseAdmin
      .from("usage_logs")
      .select(`
        id,
        user_id,
        tool_name,
        status,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stats = (statsResult.data ?? {}) as Record<string, unknown>;
  const totalRequests = Number(stats.totalRequests ?? 0);
  const errorCount = Number(stats.errorCount ?? 0);
  const activeUsers = Number(stats.activeUsers ?? 0);
  const requestsToday = todayResult.count ?? 0;

  const timeSeries = (
    (stats.timeSeries as Array<Record<string, unknown>>) ?? []
  ).map((r) => ({
    label: new Date(String(r.date)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    value: Number(r.count),
    errorValue: Number(r.errors),
  }));

  const topTools = (
    (stats.topTools as Array<Record<string, unknown>>) ?? []
  ).map((r) => ({
    name: r.toolName as string,
    count: Number(r.count),
  }));

  // Fetch emails for recent logs
  const recentLogs = recentResult.data ?? [];
  const userIds = [...new Set(recentLogs.map((l) => l.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", userIds)
    : { data: [] };

  const emailMap = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  const errorRate = totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Requests (7d)" value={totalRequests} />
        <StatCard label="Active Users (7d)" value={activeUsers} />
        <StatCard label="Error Rate (7d)" value={`${errorRate}%`} />
        <StatCard label="Requests Today" value={requestsToday} />
      </div>

      {/* Requests over time */}
      {timeSeries.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Requests Over Time</h2>
          <div className="rounded-xl border border-border bg-bg-card p-6">
            <BarChart data={timeSeries} />
          </div>
        </section>
      )}

      {/* Top tools */}
      {topTools.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Top Tools</h2>
          <div className="rounded-xl border border-border bg-bg-card p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="pb-2 font-medium">Tool</th>
                  <th className="pb-2 text-right font-medium">Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topTools.map((t) => (
                  <tr key={t.name} className="hover:bg-bg-hover">
                    <td className="py-2">{t.name}</td>
                    <td className="py-2 text-right tabular-nums">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
        <div className="rounded-xl border border-border bg-bg-card p-4">
          {recentLogs.length === 0 ? (
            <p className="py-4 text-center text-text-tertiary">No activity yet</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentLogs.map((log) => (
                <li key={log.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        log.status === "success"
                          ? "text-green-500"
                          : log.status === "unauthorized"
                            ? "text-amber-600"
                            : "text-red-500"
                      }
                    >
                      {log.status}
                    </span>
                    <span>{log.tool_name ?? "—"}</span>
                    <span className="text-text-tertiary">
                      {emailMap.get(log.user_id) ?? log.user_id}
                    </span>
                  </div>
                  <span className="text-text-secondary">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
