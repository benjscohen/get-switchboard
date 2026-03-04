import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth, requireOrgAdmin } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug, is_personal, created_at")
    .eq("id", auth.organizationId)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const { count: memberCount } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", auth.organizationId);

  const { data: domains } = await supabaseAdmin
    .from("organization_domains")
    .select("id, domain, is_primary, created_at")
    .eq("organization_id", auth.organizationId)
    .order("is_primary", { ascending: false });

  return NextResponse.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    isPersonal: org.is_personal,
    createdAt: org.created_at,
    memberCount: memberCount ?? 0,
    domains: (domains ?? []).map((d) => ({
      id: d.id,
      domain: d.domain,
      isPrimary: d.is_primary,
      createdAt: d.created_at,
    })),
    currentUserRole: auth.orgRole,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const { name } = body as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ name: name.trim() })
    .eq("id", auth.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
