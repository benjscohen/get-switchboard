import { supabaseAdmin } from "@/lib/supabase/admin";
import { upsertEmbeddings, deleteEmbedding, getQueryEmbedding, extractKeywords, searchByEmbedding, keywordScore, hybridScore, EMBEDDING_TABLES } from "@/lib/embeddings";
export { type ScopedAuth } from "@/lib/shared/scoped-entity";

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
  current_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SkillVersionRow {
  id: string;
  skill_id: string;
  version: number;
  name: string;
  description: string | null;
  content: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  enabled: boolean;
  change_type: "created" | "updated" | "rolled_back";
  changed_by: string;
  change_summary: string | null;
  created_at: string;
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
    currentVersion: s.current_version,
    createdBy: s.created_by,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

export function formatVersion(v: SkillVersionRow) {
  return {
    id: v.id,
    skillId: v.skill_id,
    version: v.version,
    name: v.name,
    description: v.description,
    content: v.content,
    arguments: v.arguments,
    enabled: v.enabled,
    changeType: v.change_type,
    changedBy: v.changed_by,
    changeSummary: v.change_summary,
    createdAt: v.created_at,
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

// ── Embedding Helpers ──

export function buildSkillSearchText(s: SkillRow): string {
  const parts = [
    `Skill: ${s.name}`,
    `Slug: ${s.slug}`,
  ];
  if (s.description) parts.push(`Description: ${s.description}`);
  parts.push(`Content: ${s.content.slice(0, 2000)}`);
  if (s.arguments.length > 0) {
    const argText = s.arguments.map((a) => `${a.name}: ${a.description}`).join(", ");
    parts.push(`Arguments: ${argText}`);
  }
  return parts.join("\n");
}

const { table: SKILL_TABLE, idColumn: SKILL_ID_COL } = EMBEDDING_TABLES.skills;

function queueSkillEmbedding(s: SkillRow): void {
  upsertEmbeddings(SKILL_TABLE, SKILL_ID_COL, [{
    id: s.id,
    searchText: buildSkillSearchText(s),
    extraColumns: { name: s.name, description: s.description },
  }]).catch((err) => console.warn("[skills] embedding failed:", err));
}

function removeSkillEmbedding(id: string): void {
  deleteEmbedding(SKILL_TABLE, SKILL_ID_COL, id)
    .catch((err) => console.warn("[skills] remove embedding failed:", err));
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

  const s = skill as SkillRow;

  // Record version 1
  const { error: versionError } = await supabaseAdmin.from("skill_versions").insert({
    skill_id: s.id,
    version: 1,
    name: s.name,
    description: s.description,
    content: s.content,
    arguments: s.arguments,
    enabled: s.enabled,
    change_type: "created",
    changed_by: auth.userId,
  });
  if (versionError) console.error("Failed to record skill version:", versionError.message);

  queueSkillEmbedding(s);

  return { ok: true, data: formatSkill(s), status: 201 };
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

  // Early return if no meaningful fields changed
  if (
    input.name === undefined &&
    input.description === undefined &&
    input.content === undefined &&
    input.arguments === undefined &&
    input.enabled === undefined
  ) {
    return { ok: true, data: formatSkill(s) };
  }

  const newVersion = s.current_version + 1;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    current_version: newVersion,
  };
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

  const u = updated as SkillRow;

  // Record new version
  const { error: versionError } = await supabaseAdmin.from("skill_versions").insert({
    skill_id: id,
    version: newVersion,
    name: u.name,
    description: u.description,
    content: u.content,
    arguments: u.arguments,
    enabled: u.enabled,
    change_type: "updated",
    changed_by: auth.userId,
  });
  if (versionError) console.error("Failed to record skill version:", versionError.message);

  queueSkillEmbedding(u);

  return { ok: true, data: formatSkill(u) };
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

  removeSkillEmbedding(id);

  return { ok: true, data: { ok: true } };
}

// ── Version / Audit Functions ──

export async function listSkillVersions(
  auth: SkillAuth,
  skillId: string,
): Promise<ServiceResult<ReturnType<typeof formatVersion>[]>> {
  const { data: skill } = await supabaseAdmin.from("skills").select("*").eq("id", skillId).single();
  if (!skill) return { ok: false, error: "Skill not found", status: 404 };

  const s = skill as SkillRow;
  if (!canViewSkill(auth, s)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const { data: versions, error } = await supabaseAdmin
    .from("skill_versions")
    .select("*")
    .eq("skill_id", skillId)
    .order("version", { ascending: false });

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: ((versions ?? []) as SkillVersionRow[]).map(formatVersion) };
}

export async function getSkillVersion(
  auth: SkillAuth,
  skillId: string,
  version: number,
): Promise<ServiceResult<ReturnType<typeof formatVersion>>> {
  const { data: skill } = await supabaseAdmin.from("skills").select("*").eq("id", skillId).single();
  if (!skill) return { ok: false, error: "Skill not found", status: 404 };

  const s = skill as SkillRow;
  if (!canViewSkill(auth, s)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const { data: ver, error } = await supabaseAdmin
    .from("skill_versions")
    .select("*")
    .eq("skill_id", skillId)
    .eq("version", version)
    .single();

  if (error || !ver) return { ok: false, error: "Version not found", status: 404 };
  return { ok: true, data: formatVersion(ver as SkillVersionRow) };
}

export async function rollbackSkill(
  auth: SkillAuth,
  skillId: string,
  targetVersion: number,
): Promise<ServiceResult<ReturnType<typeof formatSkill>>> {
  const { data: skill } = await supabaseAdmin.from("skills").select("*").eq("id", skillId).single();
  if (!skill) return { ok: false, error: "Skill not found", status: 404 };

  const s = skill as SkillRow;
  if (!(await canEditSkill(auth, s))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  if (targetVersion === s.current_version) {
    return { ok: false, error: "Already at this version", status: 400 };
  }

  const { data: ver } = await supabaseAdmin
    .from("skill_versions")
    .select("*")
    .eq("skill_id", skillId)
    .eq("version", targetVersion)
    .single();

  if (!ver) return { ok: false, error: "Version not found", status: 404 };

  const newVersion = s.current_version + 1;

  const { data: updated, error } = await supabaseAdmin
    .from("skills")
    .update({
      name: ver.name,
      description: ver.description,
      content: ver.content,
      arguments: ver.arguments,
      enabled: ver.enabled,
      current_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", skillId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };

  const { error: versionError } = await supabaseAdmin.from("skill_versions").insert({
    skill_id: skillId,
    version: newVersion,
    name: ver.name,
    description: ver.description,
    content: ver.content,
    arguments: ver.arguments,
    enabled: ver.enabled,
    change_type: "rolled_back",
    changed_by: auth.userId,
    change_summary: `Rolled back to version ${targetVersion}`,
  });
  if (versionError) console.error("Failed to record skill version:", versionError.message);

  queueSkillEmbedding(updated as SkillRow);

  return { ok: true, data: formatSkill(updated as SkillRow) };
}

// ── Search ──

export async function searchSkills(
  auth: SkillAuth,
  query: string,
  opts?: { limit?: number },
): Promise<ServiceResult<Array<ReturnType<typeof formatSkill> & { score: number }>>> {
  const limit = opts?.limit ?? 10;
  const { rpc, filterParam } = EMBEDDING_TABLES.skills;

  // Reuse listSkills to get all visible skills
  const listResult = await listSkills(auth);
  if (!listResult.ok) return listResult as ServiceResult<never>;

  const allFormatted = [
    ...listResult.data.organization,
    ...listResult.data.team,
    ...listResult.data.user,
  ];

  if (allFormatted.length === 0) return { ok: true, data: [] };

  const skillIds = allFormatted.map((s) => s.id);

  // Semantic search
  const queryEmbedding = await getQueryEmbedding(query);
  const semanticScores = new Map<string, number>();
  if (queryEmbedding.length > 0) {
    const dbResults = await searchByEmbedding(rpc, queryEmbedding, skillIds, filterParam, limit * 3);
    for (const r of dbResults) semanticScores.set(r.id, r.similarity);
  }

  // Keyword search using shared helper
  const queryKeywords = extractKeywords(query);
  const kwScores = new Map<string, number>();
  if (queryKeywords.length > 0) {
    for (const s of allFormatted) {
      const searchText = [s.name, s.slug, s.description ?? "", s.content.slice(0, 2000)].join(" ");
      const entryKeywords = extractKeywords(searchText);
      const nameLower = s.name.toLowerCase();
      const queryLower = query.toLowerCase();
      const nameBonus = nameLower.includes(queryLower) || queryLower.includes(nameLower) ? 0.2 : 0;
      const score = keywordScore(queryKeywords, entryKeywords) + nameBonus;
      if (score > 0) kwScores.set(s.id, score);
    }
  }

  // Hybrid scoring
  const hasSemantic = semanticScores.size > 0;
  const scored = allFormatted.map((s) => {
    const semantic = semanticScores.get(s.id) ?? 0;
    const kw = kwScores.get(s.id) ?? 0;
    const nameBonus = s.name.toLowerCase() === query.toLowerCase() ? 0.3 : 0;
    const score = hybridScore(semantic, kw, nameBonus, hasSemantic);
    return { skill: s, score };
  });

  const threshold = hasSemantic ? 0.2 : 0.1;
  const filtered = scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    ok: true,
    data: filtered.map((r) => ({ ...r.skill, score: r.score })),
  };
}
