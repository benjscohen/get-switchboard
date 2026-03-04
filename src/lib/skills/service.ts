import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ──

export interface SkillRow {
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

export interface SkillAuth {
  userId: string;
  organizationId: string;
  orgRole: string;
  teamIds?: string[];
}

export interface CreateSkillInput {
  scope: string;
  teamId?: string;
  name: string;
  slug?: string;
  description?: string;
  content: string;
  arguments?: Array<{ name: string; description: string; required: boolean }>;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  content?: string;
  arguments?: Array<{ name: string; description: string; required: boolean }>;
  enabled?: boolean;
}

export type ServiceResult<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: string; status: number };

// ── Helpers ──

export function formatSkill(s: SkillRow) {
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

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function canEditSkill(auth: SkillAuth, skill: SkillRow): Promise<boolean> {
  if (skill.user_id) return skill.user_id === auth.userId;

  if (skill.organization_id) {
    return auth.orgRole === "owner" || auth.orgRole === "admin";
  }

  if (skill.team_id) {
    if (auth.orgRole === "owner" || auth.orgRole === "admin") return true;
    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", skill.team_id)
      .eq("user_id", auth.userId)
      .single();
    return membership?.role === "lead";
  }

  return false;
}

function canViewSkill(auth: SkillAuth, skill: SkillRow): boolean {
  if (skill.user_id) return skill.user_id === auth.userId;
  if (skill.organization_id) return skill.organization_id === auth.organizationId;
  if (skill.team_id) return (auth.teamIds ?? []).includes(skill.team_id);
  return false;
}

// ── CRUD Functions ──

export async function listSkills(auth: SkillAuth): Promise<ServiceResult<{
  organization: ReturnType<typeof formatSkill>[];
  team: ReturnType<typeof formatSkill>[];
  user: ReturnType<typeof formatSkill>[];
}>> {
  const teamIds = auth.teamIds ?? [];

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

  return {
    ok: true,
    data: {
      organization: orgSkills.map(formatSkill),
      team: teamSkills.map(formatSkill),
      user: userSkills.map(formatSkill),
    },
  };
}

export async function getSkillById(auth: SkillAuth, id: string): Promise<ServiceResult<ReturnType<typeof formatSkill>>> {
  const { data: skill } = await supabaseAdmin
    .from("skills")
    .select("*")
    .eq("id", id)
    .single();

  if (!skill) return { ok: false, error: "Skill not found", status: 404 };

  const s = skill as SkillRow;

  if (!canViewSkill(auth, s)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  return { ok: true, data: formatSkill(s) };
}

export async function createSkill(auth: SkillAuth, input: CreateSkillInput): Promise<ServiceResult<ReturnType<typeof formatSkill>>> {
  const { scope, teamId, name, slug: customSlug, description, content, arguments: args = [] } = input;

  if (!name?.trim() || !content?.trim() || !scope) {
    return { ok: false, error: "name, content, and scope are required", status: 400 };
  }

  const slug = customSlug || slugify(name.trim());
  if (!slug) {
    return { ok: false, error: "Invalid name for slug generation", status: 400 };
  }

  const insertData: Record<string, unknown> = {
    name: name.trim(),
    slug,
    description: description?.trim() || null,
    content: content.trim(),
    arguments: args,
    created_by: auth.userId,
  };

  if (scope === "organization") {
    if (auth.orgRole !== "owner" && auth.orgRole !== "admin") {
      return { ok: false, error: "Forbidden", status: 403 };
    }
    insertData.organization_id = auth.organizationId;
  } else if (scope === "team") {
    if (!teamId) {
      return { ok: false, error: "teamId is required for team scope", status: 400 };
    }
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("organization_id", auth.organizationId)
      .single();
    if (!team) {
      return { ok: false, error: "Team not found", status: 404 };
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
        return { ok: false, error: "Forbidden", status: 403 };
      }
    }
    insertData.team_id = teamId;
  } else if (scope === "user") {
    insertData.user_id = auth.userId;
  } else {
    return { ok: false, error: "Invalid scope", status: 400 };
  }

  const { data: skill, error } = await supabaseAdmin
    .from("skills")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A skill with this slug already exists in this scope", status: 409 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true, data: formatSkill(skill as SkillRow), status: 201 };
}

export async function updateSkill(auth: SkillAuth, id: string, input: UpdateSkillInput): Promise<ServiceResult<ReturnType<typeof formatSkill>>> {
  const { data: skill } = await supabaseAdmin
    .from("skills")
    .select("*")
    .eq("id", id)
    .single();

  if (!skill) return { ok: false, error: "Skill not found", status: 404 };

  const s = skill as SkillRow;
  if (!(await canEditSkill(auth, s))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.content !== undefined) updates.content = input.content.trim();
  if (input.arguments !== undefined) updates.arguments = input.arguments;
  if (input.enabled !== undefined) updates.enabled = input.enabled;

  const { data: updated, error } = await supabaseAdmin
    .from("skills")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true, data: formatSkill(updated as SkillRow) };
}

export async function deleteSkill(auth: SkillAuth, id: string): Promise<ServiceResult<{ ok: true }>> {
  const { data: skill } = await supabaseAdmin
    .from("skills")
    .select("*")
    .eq("id", id)
    .single();

  if (!skill) return { ok: false, error: "Skill not found", status: 404 };

  const s = skill as SkillRow;
  if (!(await canEditSkill(auth, s))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const { error } = await supabaseAdmin.from("skills").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true, data: { ok: true } };
}
