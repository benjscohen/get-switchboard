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

export function canViewScopedEntity(auth: ScopedAuth, entity: ScopedEntity): boolean {
  if (entity.user_id) return entity.user_id === auth.userId;
  if (entity.organization_id) return entity.organization_id === auth.organizationId;
  if (entity.team_id) return (auth.teamIds ?? []).includes(entity.team_id);
  return false;
}
