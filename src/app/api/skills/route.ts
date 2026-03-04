import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  organization_id: string | null;
  team_id: string | null;
  user_id: string | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function formatSkill(s: SkillRow) {
  const scope = s.organization_id ? "organization" : s.team_id ? "team" : "user";
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    content: s.content,
    arguments: s.arguments,
    scope,
    organizationId: s.organization_id,
    teamId: s.team_id,
    userId: s.user_id,
    enabled: s.enabled,
    createdBy: s.created_by,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  // Get user's team IDs
  const { data: teamMemberships } = await supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("user_id", auth.userId);
  const teamIds = (teamMemberships ?? []).map((m) => m.team_id);

  // Fetch all visible skills: org + user's teams + own
  const queries = [
    supabaseAdmin
      .from("skills")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .order("name"),
    supabaseAdmin
      .from("skills")
      .select("*")
      .eq("user_id", auth.userId)
      .order("name"),
  ];

  if (teamIds.length > 0) {
    queries.push(
      supabaseAdmin
        .from("skills")
        .select("*")
        .in("team_id", teamIds)
        .order("name")
    );
  }

  const results = await Promise.all(queries);
  const orgSkills = (results[0].data ?? []) as SkillRow[];
  const userSkills = (results[1].data ?? []) as SkillRow[];
  const teamSkills = teamIds.length > 0 ? ((results[2].data ?? []) as SkillRow[]) : [];

  return NextResponse.json({
    organization: orgSkills.map(formatSkill),
    team: teamSkills.map(formatSkill),
    user: userSkills.map(formatSkill),
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const {
    scope,
    teamId,
    name,
    slug: customSlug,
    description,
    content,
    arguments: args = [],
  } = body as {
    scope?: string;
    teamId?: string;
    name?: string;
    slug?: string;
    description?: string;
    content?: string;
    arguments?: Array<{ name: string; description: string; required: boolean }>;
  };

  if (!name?.trim() || !content?.trim() || !scope) {
    return NextResponse.json({ error: "name, content, and scope are required" }, { status: 400 });
  }

  const slug = customSlug || slugify(name.trim());
  if (!slug) {
    return NextResponse.json({ error: "Invalid name for slug generation" }, { status: 400 });
  }

  // Build scope fields
  let insertData: Record<string, unknown> = {
    name: name.trim(),
    slug,
    description: description?.trim() || null,
    content: content.trim(),
    arguments: args,
    created_by: auth.userId,
  };

  if (scope === "organization") {
    if (auth.orgRole !== "owner" && auth.orgRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    insertData.organization_id = auth.organizationId;
  } else if (scope === "team") {
    if (!teamId) {
      return NextResponse.json({ error: "teamId is required for team scope" }, { status: 400 });
    }
    // Verify team belongs to org and user is lead or org admin
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("organization_id", auth.organizationId)
      .single();
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const isOrgAdmin = auth.orgRole === "owner" || auth.orgRole === "admin";
    if (!isOrgAdmin) {
      const { data: membership } = await supabaseAdmin
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", auth.userId)
        .single();
      if (membership?.role !== "lead") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    insertData.team_id = teamId;
  } else if (scope === "user") {
    insertData.user_id = auth.userId;
  } else {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const { data: skill, error } = await supabaseAdmin
    .from("skills")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A skill with this slug already exists in this scope" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(formatSkill(skill as SkillRow), { status: 201 });
}
