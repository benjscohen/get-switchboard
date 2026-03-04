import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.authenticated) return authResult.response;

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "50", 10)));
  const period = params.get("period") ?? "7d";
  const status = params.get("status");
  const tool = params.get("tool");
  const userId = params.get("userId");

  const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin.rpc("get_admin_usage_logs", {
    since_date: since.toISOString(),
    filter_status: status || null,
    filter_tool: tool || null,
    filter_user_id: userId || null,
    page_offset: (page - 1) * limit,
    page_limit: limit,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch usage logs" }, { status: 500 });
  }

  const result = data as { logs: Array<Record<string, unknown>>; total: number };

  return NextResponse.json({
    logs: (result.logs ?? []).map((log) => ({
      id: log.id,
      userId: log.user_id,
      userEmail: log.user_email,
      apiKeyPrefix: log.api_key_prefix ?? null,
      toolName: log.tool_name,
      integrationId: log.integration_id,
      status: log.status,
      errorMessage: log.error_message,
      durationMs: log.duration_ms,
      createdAt: log.created_at,
    })),
    total: Number(result.total),
    page,
    limit,
    totalPages: Math.ceil(Number(result.total) / limit),
  });
}
