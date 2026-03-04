import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const { data: domains } = await supabaseAdmin
    .from("organization_domains")
    .select("id, domain, is_primary, created_at")
    .eq("organization_id", auth.organizationId)
    .order("is_primary", { ascending: false });

  return NextResponse.json(
    (domains ?? []).map((d) => ({
      id: d.id,
      domain: d.domain,
      isPrimary: d.is_primary,
      createdAt: d.created_at,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await req.json();
  const { domain } = body as { domain: string };

  if (!domain?.trim()) {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  const normalizedDomain = domain.trim().toLowerCase();

  // Basic domain format validation
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalizedDomain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  // Reject personal email domains
  const { data: isPersonal } = await supabaseAdmin
    .from("personal_email_domains")
    .select("domain")
    .eq("domain", normalizedDomain)
    .single();

  if (isPersonal) {
    return NextResponse.json(
      { error: "Personal email domains cannot be claimed" },
      { status: 400 }
    );
  }

  // Check if domain is already claimed
  const { data: existing } = await supabaseAdmin
    .from("organization_domains")
    .select("id")
    .eq("domain", normalizedDomain)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Domain is already claimed by another organization" },
      { status: 409 }
    );
  }

  // Check if this is the first domain (make it primary)
  const { count } = await supabaseAdmin
    .from("organization_domains")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", auth.organizationId);

  const { data: newDomain, error } = await supabaseAdmin
    .from("organization_domains")
    .insert({
      organization_id: auth.organizationId,
      domain: normalizedDomain,
      is_primary: (count ?? 0) === 0,
    })
    .select("id, domain, is_primary, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: newDomain.id,
      domain: newDomain.domain,
      isPrimary: newDomain.is_primary,
      createdAt: newDomain.created_at,
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const domainId = req.nextUrl.searchParams.get("id");
  if (!domainId) {
    return NextResponse.json({ error: "Domain id is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("organization_domains")
    .delete()
    .eq("id", domainId)
    .eq("organization_id", auth.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
