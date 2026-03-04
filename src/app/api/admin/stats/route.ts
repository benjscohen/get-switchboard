import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const period = req.nextUrl.searchParams.get("period") ?? "7d";
  const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin.rpc("get_admin_stats", {
    since_date: since.toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }

  // The RPC returns a JSON object directly
  const stats = data as Record<string, unknown>;

  return NextResponse.json({
    totalRequests: Number(stats.totalRequests),
    successCount: Number(stats.successCount),
    errorCount: Number(stats.errorCount),
    errorRate:
      Number(stats.totalRequests) > 0
        ? Number(stats.errorCount) / Number(stats.totalRequests)
        : 0,
    activeUsers: Number(stats.activeUsers),
    activeKeys: Number(stats.activeKeys),
    timeSeries: (stats.timeSeries as Array<Record<string, unknown>>).map((r) => ({
      date: String(r.date),
      count: Number(r.count),
      errors: Number(r.errors),
    })),
    topTools: (stats.topTools as Array<Record<string, unknown>>).map((r) => ({
      toolName: r.toolName,
      count: Number(r.count),
    })),
    topUsers: (stats.topUsers as Array<Record<string, unknown>>).map((r) => ({
      userId: r.userId,
      email: r.email,
      count: Number(r.count),
    })),
  });
}
