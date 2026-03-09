import { supabaseAdmin } from "@/lib/supabase/admin";

export type ServiceResult<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: string; status: number };

export interface ScopedAuth {
  userId: string;
  organizationId: string;
  orgRole: string;
  teamIds?: string[];
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface ScopedEntity {
  organization_id: string | null;
  team_id: string | null;
  user_id: string | null;
}

export async function canEditScopedEntity(auth: ScopedAuth, entity: ScopedEntity): Promise<boolean> {
  if (entity.user_id) return entity.user_id === auth.userId;
  if (entity.organization_id) {
    return auth.orgRole === "owner" || auth.orgRole === "admin";
  }
  if (entity.team_id) {
    if (auth.orgRole === "owner" || auth.orgRole === "admin") return true;
    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", entity.team_id)
      .eq("user_id", auth.userId)
      .single();
    return membership?.role === "lead";
  }
  return false;
}

/** Build a ScopedAuth from a route-level auth object (fetches team memberships). */
export async function buildScopedAuth(auth: {
  userId: string;
  organizationId: string;
  orgRole: string;
}): Promise<ScopedAuth> {
  const { data: teamMemberships } = await supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("user_id", auth.userId);
  const teamIds = (teamMemberships ?? []).map((m) => m.team_id);
  return { userId: auth.userId, organizationId: auth.organizationId, orgRole: auth.orgRole, teamIds };
}

export function canViewScopedEntity(auth: ScopedAuth, entity: ScopedEntity): boolean {
  if (entity.user_id) return entity.user_id === auth.userId;
  if (entity.organization_id) return entity.organization_id === auth.organizationId;
  if (entity.team_id) return (auth.teamIds ?? []).includes(entity.team_id);
  return false;
}

/** Get the current scope of a scoped entity. */
export function getScopeInfo(entity: ScopedEntity): { scopeType: string; scopeId: string } {
  if (entity.organization_id) return { scopeType: "organization", scopeId: entity.organization_id };
  if (entity.team_id) return { scopeType: "team", scopeId: entity.team_id };
  if (entity.user_id) return { scopeType: "user", scopeId: entity.user_id };
  throw new Error("Entity has no scope set");
}

/**
 * Validate and build scope columns for a scope change.
 *
 * Authorization rules:
 * - Changing FROM any scope: must have edit permission on the current entity (already checked by caller)
 * - Changing TO organization: requires admin/owner
 * - Changing TO team: requires admin/owner, or team lead of the target team
 * - Changing TO user: only to own user scope
 *
 * Returns the DB column updates to apply, or an error.
 */
export async function buildScopeTransfer(
  auth: ScopedAuth,
  targetScope: string,
  targetTeamId?: string,
): Promise<ServiceResult<{ organization_id: string | null; team_id: string | null; user_id: string | null }>> {
  if (targetScope === "organization") {
    if (auth.orgRole !== "owner" && auth.orgRole !== "admin") {
      return { ok: false, error: "Only org admins/owners can transfer to organization scope", status: 403 };
    }
    return {
      ok: true,
      data: { organization_id: auth.organizationId, team_id: null, user_id: null },
    };
  }

  if (targetScope === "team") {
    if (!targetTeamId) {
      return { ok: false, error: "team_id is required when changing scope to 'team'", status: 400 };
    }
    // Verify team belongs to this org
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("id", targetTeamId)
      .eq("organization_id", auth.organizationId)
      .single();
    if (!team) {
      return { ok: false, error: "Team not found in your organization", status: 404 };
    }
    // Check permissions: org admin, or team lead
    const isOrgAdmin = auth.orgRole === "owner" || auth.orgRole === "admin";
    if (!isOrgAdmin) {
      const { data: membership } = await supabaseAdmin
        .from("team_members")
        .select("role")
        .eq("team_id", targetTeamId)
        .eq("user_id", auth.userId)
        .single();
      if (membership?.role !== "lead") {
        return { ok: false, error: "Only org admins or team leads can transfer to team scope", status: 403 };
      }
    }
    return {
      ok: true,
      data: { organization_id: null, team_id: targetTeamId, user_id: null },
    };
  }

  if (targetScope === "user") {
    return {
      ok: true,
      data: { organization_id: null, team_id: null, user_id: auth.userId },
    };
  }

  return { ok: false, error: `Invalid scope: '${targetScope}'. Must be 'user', 'team', or 'organization'.`, status: 400 };
}
