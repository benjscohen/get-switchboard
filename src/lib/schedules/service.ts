import { supabaseAdmin } from "@/lib/supabase/admin";
import { type ServiceResult, type ScopedAuth, slugify, canEditScopedEntity, canViewScopedEntity } from "@/lib/shared/scoped-entity";
import { validateCron, getNextRun, describeCron } from "./cron-utils";

export { type ServiceResult, slugify } from "@/lib/shared/scoped-entity";

// ── Types ──

export interface ScheduleRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cron_expression: string;
  timezone: string;
  prompt: string;
  agent_id: string | null;
  skill_id: string | null;
  skill_arguments: Record<string, unknown>;
  tool_access: string[];
  model: string | null;
  delivery: DeliveryTarget[];
  organization_id: string | null;
  team_id: string | null;
  user_id: string | null;
  enabled: boolean;
  paused: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  run_count: number;
  consecutive_failures: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRunRow {
  id: string;
  schedule_id: string;
  session_id: string | null;
  status: string;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  result: string | null;
  error: string | null;
  delivery_results: unknown[];
  prompt: string;
  model: string | null;
  created_at: string;
}

export type DeliveryTarget =
  | { type: "slack_channel"; channel_id: string; channel_name?: string }
  | { type: "slack_dm" }
  | { type: "file"; path: string };

export type ScheduleAuth = ScopedAuth;

export interface CreateScheduleInput {
  scope: string;
  teamId?: string;
  name: string;
  slug?: string;
  description?: string;
  cron: string;
  timezone?: string;
  prompt: string;
  agentId?: string;
  skillId?: string;
  skillArguments?: Record<string, unknown>;
  toolAccess?: string[];
  model?: string;
  delivery?: DeliveryTarget[];
  enabled?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  cron?: string;
  timezone?: string;
  prompt?: string;
  agentId?: string;
  skillId?: string;
  skillArguments?: Record<string, unknown>;
  toolAccess?: string[];
  model?: string;
  delivery?: DeliveryTarget[];
  enabled?: boolean;
}

// ── Helpers ──

export function formatSchedule(s: ScheduleRow) {
  const scope = s.organization_id ? "organization" : s.team_id ? "team" : "user";
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    cronExpression: s.cron_expression,
    cronDescription: describeCron(s.cron_expression),
    timezone: s.timezone,
    prompt: s.prompt,
    agentId: s.agent_id,
    skillId: s.skill_id,
    skillArguments: s.skill_arguments,
    toolAccess: s.tool_access,
    model: s.model,
    delivery: s.delivery,
    scope,
    organizationId: s.organization_id,
    teamId: s.team_id,
    userId: s.user_id,
    enabled: s.enabled,
    paused: s.paused,
    nextRunAt: s.next_run_at,
    lastRunAt: s.last_run_at,
    lastRunStatus: s.last_run_status,
    runCount: s.run_count,
    consecutiveFailures: s.consecutive_failures,
    createdBy: s.created_by,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

export function formatRun(r: ScheduleRunRow) {
  return {
    id: r.id,
    scheduleId: r.schedule_id,
    sessionId: r.session_id,
    status: r.status,
    scheduledAt: r.scheduled_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationMs: r.duration_ms,
    result: r.result,
    error: r.error,
    deliveryResults: r.delivery_results,
    prompt: r.prompt,
    model: r.model,
    createdAt: r.created_at,
  };
}

// ── CRUD ──

export async function listSchedules(auth: ScheduleAuth): Promise<ServiceResult<{
  organization: ReturnType<typeof formatSchedule>[];
  team: ReturnType<typeof formatSchedule>[];
  user: ReturnType<typeof formatSchedule>[];
}>> {
  const teamIds = auth.teamIds ?? [];

  const queries = [
    supabaseAdmin.from("schedules").select("*").eq("organization_id", auth.organizationId).order("name"),
    supabaseAdmin.from("schedules").select("*").eq("user_id", auth.userId).order("name"),
  ];
  if (teamIds.length > 0) {
    queries.push(supabaseAdmin.from("schedules").select("*").in("team_id", teamIds).order("name"));
  }

  const results = await Promise.all(queries);
  const orgSchedules = (results[0].data ?? []) as ScheduleRow[];
  const userSchedules = (results[1].data ?? []) as ScheduleRow[];
  const teamSchedules = teamIds.length > 0 ? ((results[2].data ?? []) as ScheduleRow[]) : [];

  return {
    ok: true,
    data: {
      organization: orgSchedules.map(formatSchedule),
      team: teamSchedules.map(formatSchedule),
      user: userSchedules.map(formatSchedule),
    },
  };
}

export async function getScheduleById(auth: ScheduleAuth, id: string): Promise<ServiceResult<ReturnType<typeof formatSchedule>>> {
  const { data: schedule } = await supabaseAdmin.from("schedules").select("*").eq("id", id).single();
  if (!schedule) return { ok: false, error: "Schedule not found", status: 404 };

  const s = schedule as ScheduleRow;
  if (!canViewScopedEntity(auth, s)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  return { ok: true, data: formatSchedule(s) };
}

export async function createSchedule(auth: ScheduleAuth, input: CreateScheduleInput): Promise<ServiceResult<ReturnType<typeof formatSchedule>>> {
  const { scope, teamId, name, slug: customSlug, description, cron, timezone = "UTC", prompt, agentId, skillId, skillArguments, toolAccess = [], model, delivery, enabled } = input;

  if (!name?.trim() || !prompt?.trim() || !scope || !cron) {
    return { ok: false, error: "name, prompt, scope, and cron are required", status: 400 };
  }

  const validation = validateCron(cron);
  if (!validation.valid) {
    return { ok: false, error: `Invalid cron expression: ${validation.error}`, status: 400 };
  }

  const slug = customSlug || slugify(name.trim());
  if (!slug) {
    return { ok: false, error: "Invalid name for slug generation", status: 400 };
  }

  const nextRunAt = getNextRun(cron, timezone).toISOString();

  const insertData: Record<string, unknown> = {
    name: name.trim(),
    slug,
    description: description?.trim() || null,
    cron_expression: cron,
    timezone,
    prompt: prompt.trim(),
    agent_id: agentId || null,
    skill_id: skillId || null,
    skill_arguments: skillArguments || {},
    tool_access: toolAccess,
    model: model?.trim() || null,
    delivery: delivery || [{ type: "slack_dm" }],
    enabled: enabled ?? true,
    next_run_at: nextRunAt,
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
    const { data: team } = await supabaseAdmin.from("teams").select("id").eq("id", teamId).eq("organization_id", auth.organizationId).single();
    if (!team) return { ok: false, error: "Team not found", status: 404 };

    const isOrgAdmin = auth.orgRole === "owner" || auth.orgRole === "admin";
    if (!isOrgAdmin) {
      const { data: membership } = await supabaseAdmin.from("team_members").select("role").eq("team_id", teamId).eq("user_id", auth.userId).single();
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

  const { data: schedule, error } = await supabaseAdmin.from("schedules").insert(insertData).select("*").single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A schedule with this slug already exists in this scope", status: 409 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true, data: formatSchedule(schedule as ScheduleRow), status: 201 };
}

export async function updateSchedule(auth: ScheduleAuth, id: string, input: UpdateScheduleInput): Promise<ServiceResult<ReturnType<typeof formatSchedule>>> {
  const { data: schedule } = await supabaseAdmin.from("schedules").select("*").eq("id", id).single();
  if (!schedule) return { ok: false, error: "Schedule not found", status: 404 };

  const s = schedule as ScheduleRow;
  if (!(await canEditScopedEntity(auth, s))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.prompt !== undefined) updates.prompt = input.prompt.trim();
  if (input.agentId !== undefined) updates.agent_id = input.agentId || null;
  if (input.skillId !== undefined) updates.skill_id = input.skillId || null;
  if (input.skillArguments !== undefined) updates.skill_arguments = input.skillArguments;
  if (input.toolAccess !== undefined) updates.tool_access = input.toolAccess;
  if (input.model !== undefined) updates.model = input.model?.trim() || null;
  if (input.delivery !== undefined) updates.delivery = input.delivery;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.timezone !== undefined) updates.timezone = input.timezone;

  if (input.cron !== undefined) {
    const validation = validateCron(input.cron);
    if (!validation.valid) {
      return { ok: false, error: `Invalid cron expression: ${validation.error}`, status: 400 };
    }
    updates.cron_expression = input.cron;
  }

  // Recompute next_run_at if cron or timezone changed
  const newCron = (input.cron ?? s.cron_expression) as string;
  const newTz = (input.timezone ?? s.timezone) as string;
  if (input.cron !== undefined || input.timezone !== undefined) {
    updates.next_run_at = getNextRun(newCron, newTz).toISOString();
  }

  const { data: updated, error } = await supabaseAdmin.from("schedules").update(updates).eq("id", id).select("*").single();
  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: formatSchedule(updated as ScheduleRow) };
}

export async function deleteSchedule(auth: ScheduleAuth, id: string): Promise<ServiceResult<{ ok: true }>> {
  const { data: schedule } = await supabaseAdmin.from("schedules").select("*").eq("id", id).single();
  if (!schedule) return { ok: false, error: "Schedule not found", status: 404 };

  const s = schedule as ScheduleRow;
  if (!(await canEditScopedEntity(auth, s))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const { error } = await supabaseAdmin.from("schedules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: { ok: true } };
}

export async function pauseSchedule(auth: ScheduleAuth, id: string): Promise<ServiceResult<ReturnType<typeof formatSchedule>>> {
  const { data: schedule } = await supabaseAdmin.from("schedules").select("*").eq("id", id).single();
  if (!schedule) return { ok: false, error: "Schedule not found", status: 404 };

  const s = schedule as ScheduleRow;
  if (!(await canEditScopedEntity(auth, s))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  if (s.paused) return { ok: true, data: formatSchedule(s) };

  const { data: updated, error } = await supabaseAdmin
    .from("schedules")
    .update({ paused: true, next_run_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: formatSchedule(updated as ScheduleRow) };
}

export async function resumeSchedule(auth: ScheduleAuth, id: string): Promise<ServiceResult<ReturnType<typeof formatSchedule>>> {
  const { data: schedule } = await supabaseAdmin.from("schedules").select("*").eq("id", id).single();
  if (!schedule) return { ok: false, error: "Schedule not found", status: 404 };

  const s = schedule as ScheduleRow;
  if (!(await canEditScopedEntity(auth, s))) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  if (!s.paused) return { ok: true, data: formatSchedule(s) };

  const nextRunAt = getNextRun(s.cron_expression, s.timezone).toISOString();

  const { data: updated, error } = await supabaseAdmin
    .from("schedules")
    .update({ paused: false, next_run_at: nextRunAt, consecutive_failures: 0, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: formatSchedule(updated as ScheduleRow) };
}

export async function triggerSchedule(auth: ScheduleAuth, id: string): Promise<ServiceResult<{ runId: string }>> {
  const { data: schedule } = await supabaseAdmin.from("schedules").select("*").eq("id", id).single();
  if (!schedule) return { ok: false, error: "Schedule not found", status: 404 };

  const s = schedule as ScheduleRow;
  if (!canViewScopedEntity(auth, s)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const { data: run, error } = await supabaseAdmin
    .from("schedule_runs")
    .insert({
      schedule_id: id,
      status: "pending",
      scheduled_at: new Date().toISOString(),
      prompt: s.prompt,
      model: s.model,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: { runId: run.id as string }, status: 201 };
}

export async function listScheduleRuns(
  auth: ScheduleAuth,
  scheduleId: string,
  opts?: { limit?: number },
): Promise<ServiceResult<ReturnType<typeof formatRun>[]>> {
  const { data: schedule } = await supabaseAdmin.from("schedules").select("*").eq("id", scheduleId).single();
  if (!schedule) return { ok: false, error: "Schedule not found", status: 404 };

  const s = schedule as ScheduleRow;
  if (!canViewScopedEntity(auth, s)) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const limit = opts?.limit ?? 20;
  const { data: runs, error } = await supabaseAdmin
    .from("schedule_runs")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: ((runs ?? []) as ScheduleRunRow[]).map(formatRun) };
}
