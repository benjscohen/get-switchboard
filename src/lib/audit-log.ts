import { supabaseAdmin } from "@/lib/supabase/admin";

export const AuditEventType = {
  // Organization
  ORGANIZATION_UPDATED: "organization.updated",
  // Domains
  ORGANIZATION_DOMAIN_CREATED: "organization_domain.created",
  ORGANIZATION_DOMAIN_DELETED: "organization_domain.deleted",
  // Members
  MEMBER_ROLE_CHANGED: "member.role_changed",
  MEMBER_REMOVED: "member.removed",
  // API Keys
  API_KEY_CREATED: "api_key.created",
  API_KEY_REVOKED: "api_key.revoked",
  // Agent Keys
  AGENT_KEY_CREATED: "agent_key.created",
  AGENT_KEY_UPDATED: "agent_key.updated",
  AGENT_KEY_REVOKED: "agent_key.revoked",
  // Connections
  CONNECTION_DELETED: "connection.deleted",
  // Skills
  SKILL_CREATED: "skill.created",
  SKILL_UPDATED: "skill.updated",
  SKILL_DELETED: "skill.deleted",
  SKILL_ROLLED_BACK: "skill.rolled_back",
  SKILL_SCOPE_CHANGED: "skill.scope_changed",
  // Agents
  AGENT_CREATED: "agent.created",
  AGENT_UPDATED: "agent.updated",
  AGENT_DELETED: "agent.deleted",
  AGENT_ROLLED_BACK: "agent.rolled_back",
  AGENT_SCOPE_CHANGED: "agent.scope_changed",
  // Schedules
  SCHEDULE_CREATED: "schedule.created",
  SCHEDULE_UPDATED: "schedule.updated",
  SCHEDULE_DELETED: "schedule.deleted",
  SCHEDULE_ROLLED_BACK: "schedule.rolled_back",
  SCHEDULE_SCOPE_CHANGED: "schedule.scope_changed",
  // Teams
  TEAM_CREATED: "team.created",
  TEAM_UPDATED: "team.updated",
  TEAM_DELETED: "team.deleted",
  // Team Members
  TEAM_MEMBER_ADDED: "team_member.added",
  TEAM_MEMBER_ROLE_CHANGED: "team_member.role_changed",
  TEAM_MEMBER_REMOVED: "team_member.removed",
  // Vault Secrets
  SECRET_CREATED: "secret.created",
  SECRET_UPDATED: "secret.updated",
  SECRET_DELETED: "secret.deleted",
  // Secret Shares
  SECRET_SHARE_CREATED: "secret_share.created",
  SECRET_SHARE_DELETED: "secret_share.deleted",
  // Files
  FILE_CREATED: "file.created",
  FILE_UPDATED: "file.updated",
  FILE_DELETED: "file.deleted",
  FILE_MOVED: "file.moved",
  FILE_ROLLED_BACK: "file.rolled_back",
  // Folders
  FOLDER_CREATED: "folder.created",
  FOLDER_DELETED: "folder.deleted",
  // MCP Servers
  MCP_SERVER_CREATED: "mcp_server.created",
  MCP_SERVER_UPDATED: "mcp_server.updated",
  MCP_SERVER_DELETED: "mcp_server.deleted",
  // Profile
  PROFILE_UPDATED: "profile.updated",
} as const;

export type AuditEventTypeValue =
  (typeof AuditEventType)[keyof typeof AuditEventType];

export interface AuditEvent {
  id: string;
  actorId: string;
  actorType: string;
  actorName: string | null;
  eventType: string;
  resourceType: string;
  resourceId: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  previousAttributes: Record<string, unknown> | null;
  createdAt: string;
}

export function logAuditEvent(data: {
  organizationId: string;
  actorId: string;
  actorType?: "user" | "system" | "api_key";
  eventType: AuditEventTypeValue;
  resourceType: string;
  resourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  previousAttributes?: Record<string, unknown>;
}) {
  // Fire-and-forget — same pattern as logUsage()
  supabaseAdmin
    .from("audit_events")
    .insert({
      organization_id: data.organizationId,
      actor_id: data.actorId,
      actor_type: data.actorType ?? "user",
      event_type: data.eventType,
      resource_type: data.resourceType,
      resource_id: data.resourceId ?? null,
      description: data.description ?? null,
      metadata: data.metadata ?? {},
      previous_attributes: data.previousAttributes ?? null,
    })
    .then(undefined, () => {});
}
