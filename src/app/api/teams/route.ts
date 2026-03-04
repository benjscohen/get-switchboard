import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth, requireOrgAdmin } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { data: teams } = await supabaseAdmin
    .from("teams")
    .select("id, name, slug, created_at, updated_at")
    .eq("organization_id", auth.organizationId)
    .order("name");

  // Get member counts per team
  const teamIds = (teams ?? []).map((t) => t.id);
  const { data: memberCounts } = teamIds.length
    ? await supabaseAdmin
        .from("team_members")
        .select("team_id")
        .in("team_id", teamIds)
    : { data: [] };

  const countMap = new Map<string, number>();
  for (const m of memberCounts ?? []) {
    countMap.set(m.team_id, (countMap.get(m.team_id) ?? 0) + 1);
  }

  return NextResponse.json(
    (teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      memberCount: countMap.get(t.id) ?? 0,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }))
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  const auth = await requireOrgAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const { name } = body as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = slugify(name.trim());
  if (!slug) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const { data: team, error } = await supabaseAdmin
    .from("teams")
    .insert({
      organization_id: auth.organizationId,
      name: name.trim(),
      slug,
    })
    .select("id, name, slug, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: team.id,
    name: team.name,
    slug: team.slug,
    memberCount: 0,
    createdAt: team.created_at,
  }, { status: 201 });
}
