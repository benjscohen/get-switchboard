import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Verify a session exists and belongs to the given organization.
 * Returns the session row on success, or a NextResponse error on failure.
 */
export async function verifySessionAccess(
  sessionId: string,
  organizationId: string,
  extraFields?: string,
): Promise<
  | { ok: true; session: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const fields = extraFields
    ? `id, organization_id, ${extraFields}`
    : "id, organization_id";

  const { data, error } = await supabaseAdmin
    .from("agent_sessions")
    .select(fields)
    .eq("id", sessionId)
    .single();

  if (error || !data) {
    return { ok: false, response: NextResponse.json({ error: "Session not found" }, { status: 404 }) };
  }

  const session = data as unknown as Record<string, unknown>;

  if (session.organization_id !== organizationId) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, session };
}
