import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const authResult = await requireOrgAdmin();
  if (!authResult.authenticated) return authResult.response;

  const period = req.nextUrl.searchParams.get("period") ?? "7d";
  const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin.rpc("get_agent_usage_stats", {
    since_date: since.toISOString(),
    p_organization_id: authResult.organizationId,
  });

  if (error) {
    console.error("Failed to fetch agent usage stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent usage stats" },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
