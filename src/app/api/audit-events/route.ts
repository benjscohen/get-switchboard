import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  // Only org admins can view audit events
  if (
    auth.orgRole !== "owner" &&
    auth.orgRole !== "admin" &&
    auth.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const eventType = params.get("eventType") || undefined;
  const resourceType = params.get("resourceType") || undefined;
  const actorId = params.get("actorId") || undefined;
  const since = params.get("since") || undefined;
  const until = params.get("until") || undefined;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(params.get("limit") || "50", 10))
  );
  const offset = (page - 1) * limit;

  // Super-admins can view any org's events
  const orgId =
    auth.role === "admin" && params.get("organizationId")
      ? params.get("organizationId")!
      : auth.organizationId;

  const rpcName =
    auth.role === "admin" ? "get_admin_audit_events" : "get_audit_events";
  const rpcParams: Record<string, unknown> = {
    p_organization_id: orgId,
    p_event_type: eventType ?? null,
    p_resource_type: resourceType ?? null,
    p_actor_id: actorId ?? null,
    p_since: since ?? null,
    p_until: until ?? null,
    p_page_offset: offset,
    p_page_limit: limit,
  };

  const { data, error } = await supabaseAdmin.rpc(rpcName, rpcParams);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as { events: unknown[]; total: number };

  return NextResponse.json({
    events: result.events,
    page,
    totalPages: Math.ceil(result.total / limit),
    total: result.total,
  });
}
