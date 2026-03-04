import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, name, org_role")
    .eq("organization_id", auth.organizationId)
    .order("name");

  return NextResponse.json(
    (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.name, // name is the display field; email not stored in profiles
      role: m.org_role,
    }))
  );
}
