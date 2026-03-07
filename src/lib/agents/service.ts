import { supabaseAdmin } from "@/lib/supabase/admin";
import { upsertEmbeddings, getQueryEmbedding, extractKeywords, searchByEmbedding, keywordScore, hybridScore } from "@/lib/embeddings";
import { type ServiceResult, type ScopedAuth, slugify, canEditScopedEntity, canViewScopedEntity } from "@/lib/shared/scoped-entity";
import { normalizeToolAccess } from "@/lib/agents/tool-access-utils";
import { DEFAULT_AGENT_TEMPLATES, type AgentTemplate } from "@/lib/agents/templates";

// Re-export shared types for convenience
export { type ServiceResult, slugify } from "@/lib/shared/scoped-entity";

// ── Types ──

export interface AgentRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string;
  tool_access: string[];
  model: string | null;
  organization_id: string | null;
  team_id: string | null;
  user_id: string | null;
  enabled: boolean;
  current_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AgentVersionRow {
  id: string;
  agent_id: string;
  version: number;
  name: string;
  description: string | null;
  instructions: string;
  tool_access: string[];
  model: string | null;
  enabled: boolean;
  change_type: "created" | "updated" | "rolled_back";
  changed_by: string;
  change_summary: string | null;
  created_at: string;
}

export type AgentAuth = ScopedAuth;

export interface CreateAgentInput {
  scope: string;
  teamId?: string;
  name: string;
  slug?: string;
  description?: string;
  instructions: string;
  toolAccess?: string[];
  model?: string;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  instructions?: string;
  toolAccess?: string[];
  model?: string;
  enabled?: boolean;
}

// ── Helpers ──

export function formatAgent(a: AgentRow) {
  const scope = a.organization_id ? "organization" : a.team_id ? "team" : "user";
  return {
    id: a.id,
    name: a.name,
    slug: a.slug,
    description: a.description,
    instructions: a.instructions,
    toolAccess: normalizeToolAccess(a.tool_access),
    model: a.model,
    scope,
    organizationId: a.organization_id,
    teamId: a.team_id,
    userId: a.user_id,
    enabled: a.enabled,
    currentVersion: a.current_version,
    createdBy: a.created_by,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export function formatVersion(v: AgentVersionRow) {
  return {
    id: v.id,
    agentId: v.agent_id,
    version: v.version,
    name: v.name,
    description: v.description,
    instructions: v.instructions,
    toolAccess: normalizeToolAccess(v.tool_access),
    model: v.model,
    enabled: v.enabled,
    changeType: v.change_type,
    changedBy: v.changed_by,
    changeSummary: v.change_summary,
    createdAt: v.created_at,
  };
}

async function canEditAgent(auth: AgentAuth, agent: AgentRow): Promise<boolean> {
  return canEditScopedEntity(auth, agent);
}

function canViewAgent(auth: AgentAuth, agent: AgentRow): boolean {
  return canViewScopedEntity(auth, agent);
}

// ── Embedding Helpers ──

export function buildAgentSearchText(a: AgentRow): string {
  const parts = [
    `Agent: ${a.name}`,
    `Slug: ${a.slug}`,
  ];
  if (a.description) parts.push(`Description: ${a.description}`);
  parts.push(`Instructions: ${a.instructions.slice(0, 2000)}`);
  if (a.tool_access.length > 0) {
    parts.push(`Tools: ${a.tool_access.join(", ")}`);
  }
  return parts.join("\n");
}

function queueAgentEmbedding(a: AgentRow): void {
  upsertEmbeddings("agent_embeddings", "agent_id", [{
    id: a.id,
    searchText: buildAgentSearchText(a),
    extraColumns: { name: a.name, description: a.description },
  }]).catch((err) => console.warn("[agents] embedding failed:", err));
}

// ── CRUD Functions ──

export async function listAgents(auth: AgentAuth): Promise<ServiceResult<{
  organization: ReturnType<typeof formatAgent>[];
  team: ReturnType<typeof formatAgent>[];
  user: ReturnType<typeof formatAgent>[];
}>> {
  const teamIds = auth.teamIds ?? [];

  const queries = [
    supabaseAdmin
      .from("agents")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .order("name"),
    supabaseAdmin
      .from("agents")
      .select("*")
      .eq("user_id", auth.userId)
      .order("name"),
  ];

  if (teamIds.length > 0) {
    queries.push(
      supabaseAdmin
        .from("agents")
        .select("*")
        .in("team_id", teamIds)
        .order("name")
    );
  }

  const results = await Promise.all(queries);
  const orgAgents = (results[0].data ?? []) as AgentRow[];
  const userAgents = (results[1].data ?? []) as AgentRow[];
  const teamAgents = teamIds.length > 0 ? ((results[2].data ?? []) as AgentRow[]) : [];

  return {
    ok: true,
    data: {
      organization: orgAgents.map(formatAgent),
      team: teamAgents.map(formatAgent),
      user: userAgents.map(formatAgent),
    },
  };
}

export async function getAgentById(auth: AgentAuth, id: string): Promise<ServiceResult<ReturnType<typeof formatAgent>>> {
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (!agent) return { ok: false, error: "Agent not found", status: 404 };

  const a = agent as AgentRow;

  if (!canViewAgent(auth, a)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  return { ok: true, data: formatAgent(a) };
}

export async function createAgent(auth: AgentAuth, input: CreateAgentInput): Promise<ServiceResult<ReturnType<typeof formatAgent>>> {
  const { scope, teamId, name, slug: customSlug, description, instructions, toolAccess = [], model } = input;

  if (!name?.trim() || !instructions?.trim() || !scope) {
    return { ok: false, error: "name, instructions, and scope are required", status: 400 };
  }

  const slug = customSlug || slugify(name.trim());
  if (!slug) {
    return { ok: false, error: "Invalid name for slug generation", status: 400 };
  }

  const insertData: Record<string, unknown> = {
    name: name.trim(),
    slug,
    description: description?.trim() || null,
    instructions: instructions.trim(),
    tool_access: toolAccess,
    model: model?.trim() || null,
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

  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "An agent with this slug already exists in this scope", status: 409 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const a = agent as AgentRow;

  // Record version 1
  const { error: versionError } = await supabaseAdmin.from("agent_versions").insert({
    agent_id: a.id,
    version: 1,
    name: a.name,
    description: a.description,
    instructions: a.instructions,
    tool_access: a.tool_access,
    model: a.model,
    enabled: a.enabled,
    change_type: "created",
    changed_by: auth.userId,
  });
  if (versionError) console.error("Failed to record agent version:", versionError.message);

  queueAgentEmbedding(a);

  return { ok: true, data: formatAgent(a), status: 201 };
}

export async function updateAgent(auth: AgentAuth, id: string, input: UpdateAgentInput): Promise<ServiceResult<ReturnType<typeof formatAgent>>> {
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (!agent) return { ok: false, error: "Agent not found", status: 404 };

  const a = agent as AgentRow;
  if (!(await canEditAgent(auth, a))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  // Early return if no meaningful fields changed
  if (
    input.name === undefined &&
    input.description === undefined &&
    input.instructions === undefined &&
    input.toolAccess === undefined &&
    input.model === undefined &&
    input.enabled === undefined
  ) {
    return { ok: true, data: formatAgent(a) };
  }

  const newVersion = a.current_version + 1;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    current_version: newVersion,
  };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.instructions !== undefined) updates.instructions = input.instructions.trim();
  if (input.toolAccess !== undefined) updates.tool_access = input.toolAccess;
  if (input.model !== undefined) updates.model = input.model?.trim() || null;
  if (input.enabled !== undefined) updates.enabled = input.enabled;

  const { data: updated, error } = await supabaseAdmin
    .from("agents")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  const u = updated as AgentRow;

  // Record new version
  const { error: versionError } = await supabaseAdmin.from("agent_versions").insert({
    agent_id: id,
    version: newVersion,
    name: u.name,
    description: u.description,
    instructions: u.instructions,
    tool_access: u.tool_access,
    model: u.model,
    enabled: u.enabled,
    change_type: "updated",
    changed_by: auth.userId,
  });
  if (versionError) console.error("Failed to record agent version:", versionError.message);

  queueAgentEmbedding(u);

  return { ok: true, data: formatAgent(u) };
}

export async function deleteAgent(auth: AgentAuth, id: string): Promise<ServiceResult<{ ok: true }>> {
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (!agent) return { ok: false, error: "Agent not found", status: 404 };

  const a = agent as AgentRow;
  if (!(await canEditAgent(auth, a))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const { error } = await supabaseAdmin.from("agents").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true, data: { ok: true } };
}

// ── Version / Audit Functions ──

export async function listAgentVersions(
  auth: AgentAuth,
  agentId: string,
): Promise<ServiceResult<ReturnType<typeof formatVersion>[]>> {
  const { data: agent } = await supabaseAdmin.from("agents").select("*").eq("id", agentId).single();
  if (!agent) return { ok: false, error: "Agent not found", status: 404 };

  const a = agent as AgentRow;
  if (!canViewAgent(auth, a)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const { data: versions, error } = await supabaseAdmin
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version", { ascending: false });

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: ((versions ?? []) as AgentVersionRow[]).map(formatVersion) };
}

export async function getAgentVersion(
  auth: AgentAuth,
  agentId: string,
  version: number,
): Promise<ServiceResult<ReturnType<typeof formatVersion>>> {
  const { data: agent } = await supabaseAdmin.from("agents").select("*").eq("id", agentId).single();
  if (!agent) return { ok: false, error: "Agent not found", status: 404 };

  const a = agent as AgentRow;
  if (!canViewAgent(auth, a)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const { data: ver, error } = await supabaseAdmin
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .eq("version", version)
    .single();

  if (error || !ver) return { ok: false, error: "Version not found", status: 404 };
  return { ok: true, data: formatVersion(ver as AgentVersionRow) };
}

export async function rollbackAgent(
  auth: AgentAuth,
  agentId: string,
  targetVersion: number,
): Promise<ServiceResult<ReturnType<typeof formatAgent>>> {
  const { data: agent } = await supabaseAdmin.from("agents").select("*").eq("id", agentId).single();
  if (!agent) return { ok: false, error: "Agent not found", status: 404 };

  const a = agent as AgentRow;
  if (!(await canEditAgent(auth, a))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  if (targetVersion === a.current_version) {
    return { ok: false, error: "Already at this version", status: 400 };
  }

  const { data: ver } = await supabaseAdmin
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .eq("version", targetVersion)
    .single();

  if (!ver) return { ok: false, error: "Version not found", status: 404 };

  const newVersion = a.current_version + 1;

  const { data: updated, error } = await supabaseAdmin
    .from("agents")
    .update({
      name: ver.name,
      description: ver.description,
      instructions: ver.instructions,
      tool_access: ver.tool_access,
      model: ver.model,
      enabled: ver.enabled,
      current_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };

  const { error: versionError } = await supabaseAdmin.from("agent_versions").insert({
    agent_id: agentId,
    version: newVersion,
    name: ver.name,
    description: ver.description,
    instructions: ver.instructions,
    tool_access: ver.tool_access,
    model: ver.model,
    enabled: ver.enabled,
    change_type: "rolled_back",
    changed_by: auth.userId,
    change_summary: `Rolled back to version ${targetVersion}`,
  });
  if (versionError) console.error("Failed to record agent version:", versionError.message);

  queueAgentEmbedding(updated as AgentRow);

  return { ok: true, data: formatAgent(updated as AgentRow) };
}

// ── Search ──

export async function searchAgents(
  auth: AgentAuth,
  query: string,
  opts?: { limit?: number },
): Promise<ServiceResult<Array<ReturnType<typeof formatAgent> & { score: number }>>> {
  const limit = opts?.limit ?? 10;

  // Fetch all visible agents (same queries as listAgents)
  const teamIds = auth.teamIds ?? [];
  const queries = [
    supabaseAdmin.from("agents").select("*").eq("organization_id", auth.organizationId),
    supabaseAdmin.from("agents").select("*").eq("user_id", auth.userId),
  ];
  if (teamIds.length > 0) {
    queries.push(supabaseAdmin.from("agents").select("*").in("team_id", teamIds));
  }

  const results = await Promise.all(queries);
  const allAgents: AgentRow[] = [];
  for (const r of results) {
    for (const row of (r.data ?? []) as AgentRow[]) {
      allAgents.push(row);
    }
  }

  // Dedupe by id
  const agentMap = new Map<string, AgentRow>();
  for (const a of allAgents) agentMap.set(a.id, a);
  const agents = Array.from(agentMap.values());

  if (agents.length === 0) {
    return { ok: true, data: [] };
  }

  const agentIds = agents.map((a) => a.id);

  // Semantic search
  const queryEmbedding = await getQueryEmbedding(query);
  const semanticScores = new Map<string, number>();
  if (queryEmbedding.length > 0) {
    const dbResults = await searchByEmbedding(
      "search_agent_embeddings", queryEmbedding, agentIds, "agent_ids", limit * 3,
    );
    for (const r of dbResults) semanticScores.set(r.id, r.similarity);
  }

  // Keyword search
  const queryKeywords = extractKeywords(query);
  const keywordScores = new Map<string, number>();
  if (queryKeywords.length > 0) {
    for (const a of agents) {
      const entryKeywords = extractKeywords(buildAgentSearchText(a));
      const kw = keywordScore(queryKeywords, entryKeywords);

      const nameLower = a.name.toLowerCase();
      const queryLower = query.toLowerCase();
      const nameBonus = nameLower.includes(queryLower) || queryLower.includes(nameLower) ? 0.2 : 0;

      const score = kw + nameBonus;
      if (score > 0) keywordScores.set(a.id, score);
    }
  }

  // Hybrid scoring
  const hasSemantic = semanticScores.size > 0;
  const scored = agents.map((a) => {
    const semantic = semanticScores.get(a.id) ?? 0;
    const kw = keywordScores.get(a.id) ?? 0;

    const nameLower = a.name.toLowerCase();
    const queryLower = query.toLowerCase();
    const nameBonus = nameLower === queryLower ? 0.3 : 0;

    const score = hybridScore(semantic, kw, nameBonus, hasSemantic);

    return { agent: a, score };
  });

  const threshold = hasSemantic ? 0.2 : 0.1;
  const filtered = scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    ok: true,
    data: filtered.map((r) => ({ ...formatAgent(r.agent), score: r.score })),
  };
}

// ── Templates ──

export async function listTemplates(): Promise<AgentTemplate[]> {
  const { data, error } = await supabaseAdmin
    .from("agent_templates")
    .select("*")
    .eq("enabled", true)
    .order("sort_order");

  if (error || !data || data.length === 0) {
    return DEFAULT_AGENT_TEMPLATES;
  }

  return data.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description ?? "",
    instructions: t.instructions,
    toolAccess: t.tool_access as string[],
    model: t.model ?? undefined,
    category: t.category as "general" | "integration",
    defaultScope: t.default_scope as "organization" | "user",
  }));
}

export async function createFromTemplate(
  auth: AgentAuth,
  templateSlug: string,
  overrides?: { scope?: string; name?: string; instructions?: string; toolAccess?: string[]; model?: string },
): Promise<ServiceResult<ReturnType<typeof formatAgent>> & { templateNotFound?: boolean; availableSlugs?: string[] }> {
  const templates = await listTemplates();
  const template = templates.find((t) => t.slug === templateSlug);

  if (!template) {
    return {
      ok: false,
      error: `Template "${templateSlug}" not found`,
      status: 404,
      templateNotFound: true,
      availableSlugs: templates.map((t) => t.slug),
    };
  }

  return createAgent(auth, {
    scope: overrides?.scope ?? template.defaultScope,
    name: overrides?.name ?? template.name,
    description: template.description,
    instructions: overrides?.instructions ?? template.instructions,
    toolAccess: overrides?.toolAccess ?? template.toolAccess,
    model: overrides?.model ?? template.model,
  });
}
