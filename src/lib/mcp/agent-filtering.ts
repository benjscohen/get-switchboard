export interface AgentRecord {
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
}

export interface AgentFilterContext {
  userId?: string;
  organizationId?: string;
  teamIds?: string[];
}

/**
 * Returns the MCP prompt name for an agent, namespaced by scope.
 */
export function agentPromptName(agent: AgentRecord): string {
  if (agent.organization_id) return `agent:org:${agent.slug}`;
  if (agent.team_id) return `agent:team:${agent.slug}`;
  return `agent:user:${agent.slug}`;
}

/**
 * Filters agents to only those visible to the current user.
 */
export function filterAgentsForUser(
  agents: AgentRecord[],
  ctx: AgentFilterContext
): AgentRecord[] {
  return agents.filter((a) => {
    if (!a.enabled) return false;

    if (a.organization_id) {
      return a.organization_id === ctx.organizationId;
    }
    if (a.team_id) {
      return ctx.teamIds?.includes(a.team_id) ?? false;
    }
    if (a.user_id) {
      return a.user_id === ctx.userId;
    }
    return false;
  });
}
