export interface SkillRecord {
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
}

export interface SkillFilterContext {
  userId?: string;
  organizationId?: string;
  teamIds?: string[];
}

/**
 * Returns the MCP prompt name for a skill, namespaced by scope.
 */
export function skillPromptName(skill: SkillRecord): string {
  if (skill.organization_id) return `org:${skill.slug}`;
  if (skill.team_id) return `team:${skill.slug}`;
  return `user:${skill.slug}`;
}

/**
 * Filters skills to only those visible to the current user.
 */
export function filterSkillsForUser(
  skills: SkillRecord[],
  ctx: SkillFilterContext
): SkillRecord[] {
  return skills.filter((s) => {
    if (!s.enabled) return false;

    if (s.organization_id) {
      return s.organization_id === ctx.organizationId;
    }
    if (s.team_id) {
      return ctx.teamIds?.includes(s.team_id) ?? false;
    }
    if (s.user_id) {
      return s.user_id === ctx.userId;
    }
    return false;
  });
}

/**
 * Interpolates {{argName}} placeholders in skill content.
 */
export function interpolateSkillContent(
  content: string,
  args: Record<string, string>
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return args[name] ?? match;
  });
}
