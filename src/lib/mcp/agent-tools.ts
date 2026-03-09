import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  filterAgentsForUser,
  agentPromptName,
  type AgentRecord,
} from "./agent-filtering";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent as deleteAgentService,
  listAgentVersions,
  getAgentVersion,
  rollbackAgent,
  searchAgents,
  listTemplates,
  createFromTemplate,
} from "@/lib/agents/service";
import type { ToolMeta } from "./tool-filtering";
import { withToolLogging } from "./tool-logging";
import { getFullMcpAuth, ok, err } from "./types";
import { getFullCatalog } from "@/lib/integrations/catalog";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

const TOOL_DESCRIPTION = `Manage reusable AI agent configurations. Agents become MCP prompts that any team member can load with /agent:<name>.

Quick start:
  1. list_templates → see ready-made agents
  2. create_from_template (slug: "research-assistant") → instant agent
  3. list → see your agents with their prompt names

Operations:
  list               — List all agents you can see (org + team + personal)
  get                — Get full agent details by prompt name
  create             — Create a new agent from scratch
  create_from_template — Create an agent from a template (fastest way)
  list_templates     — Browse available agent templates
  update             — Update an existing agent (by id)
  delete             — Delete an agent (by id)
  search             — Semantic search across agents
  history            — View version history for an agent
  version            — View a specific version snapshot
  rollback           — Rollback an agent to a previous version
  list_integrations  — List available integrations for tool_access

Scope:
  "user"         — Only you can see/use it
  "organization" — Everyone in your org (requires admin/owner role)
  "team"         — Team members only (requires team_id)

tool_access format:
  Whole integration: ["slack", "google-calendar"]
  Specific tools:    ["slack:slack_post_message", "google-calendar:google_calendar_list_events"]
  Mixed:             ["slack", "google-calendar:google_calendar_list_events", "platform"]`;

export function registerAgentTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
  agents: AgentRecord[],
): void {
  // Register each agent as an MCP prompt (skip duplicates — different users
  // can have the same slug; per-user filtering happens at list time)
  const registeredPrompts = new Set<string>();
  for (const agent of agents) {
    const promptName = agentPromptName(agent);
    if (registeredPrompts.has(promptName)) continue;
    registeredPrompts.add(promptName);

    const promptContent = [
      agent.instructions,
      "",
      `Tool Access: ${agent.tool_access.length > 0 ? agent.tool_access.join(", ") : "none"}`,
    ];
    if (agent.model) {
      promptContent.push(`Preferred Model: ${agent.model}`);
    }
    const text = promptContent.join("\n");

    server.prompt(promptName, agent.description || agent.name, () => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
    }));
  }

  // Register manage_agents tool (consolidated CRUD)
  server.tool(
    "manage_agents",
    TOOL_DESCRIPTION,
    {
      operation: z.enum([
        "list", "get", "create", "create_from_template", "list_templates",
        "update", "delete", "search", "list_integrations",
        "history", "version", "rollback",
      ])
        .describe("Operation to perform. Start with 'list_templates' or 'list' to explore."),
      id: z.string().optional()
        .describe("Agent UUID. Required for: update, delete, history, version, rollback. Get it from 'list'."),
      name: z.string().optional()
        .describe("Multi-purpose: prompt name for 'get' (e.g. 'agent:org:research-assistant'), display name for 'create'/'update', search query for 'search'."),
      scope: z.enum(["user", "organization", "team"]).optional()
        .describe("Visibility scope. Required for 'create'. Optional override for 'create_from_template'. Default: template's defaultScope."),
      slug: z.string().optional()
        .describe("URL-friendly identifier. Auto-generated from name if omitted. For 'create_from_template': the template slug to use (e.g. 'research-assistant')."),
      description: z.string().optional()
        .describe("Short summary of what the agent does (1-2 sentences)."),
      instructions: z.string().optional()
        .describe("System prompt for the agent. Example: 'You are a research assistant. When given a topic, conduct thorough research using available tools...'"),
      tool_access: z.array(z.string().min(1, "Each tool_access entry must be non-empty. Use an integration ID (e.g. 'slack') or a specific tool (e.g. 'slack:slack_post_message').")).optional()
        .describe('Integration/tool access list. Formats: whole integration ["slack"], specific tool ["slack:slack_post_message"], or mixed. Use list_integrations to see options.'),
      model: z.string().optional()
        .describe("Preferred model identifier (e.g. 'claude-sonnet-4-6'). Optional — defaults to the caller's model."),
      team_id: z.string().optional()
        .describe("Team UUID. Required when scope is 'team'."),
      enabled: z.boolean().optional()
        .describe("Enable/disable the agent. Only used with 'update'."),
      version: z.number().optional()
        .describe("Version number. For 'version': which snapshot to view. For 'rollback': target version to restore."),
    },
    withToolLogging("manage_agents", "platform", async (args, extra) => {
      // "list" and "list_templates" return empty/defaults when unauthenticated
      if (args.operation === "list") {
        const auth = getFullMcpAuth(extra);
        if (!auth) return ok({ agents: [], count: 0, tip: "Authenticate with an API key to see your agents." });

        const result = await listAgents(auth);
        if (!result.ok) return err(result.error);

        const all = [
          ...result.data.organization,
          ...result.data.team,
          ...result.data.user,
        ].map((a) => ({
          id: a.id,
          promptName: `agent:${a.scope === "organization" ? "org" : a.scope}:${a.slug}`,
          name: a.name,
          description: a.description,
          scope: a.scope,
          tools: a.toolAccess,
          model: a.model,
          enabled: a.enabled,
          version: a.currentVersion,
        }));

        if (all.length === 0) {
          return ok({
            agents: [],
            count: 0,
            tip: "No agents yet. Try 'list_templates' to see ready-made agents you can create instantly, or 'create' to build one from scratch.",
          });
        }

        return ok({
          agents: all,
          count: all.length,
          tip: "Use 'get' with a promptName to see full details. Load an agent as a prompt with /agent:<promptName>.",
        });
      }

      if (args.operation === "list_templates") {
        const templates = await listTemplates();
        return ok({
          templates: templates.map((t) => ({
            slug: t.slug,
            name: t.name,
            description: t.description,
            category: t.category,
            defaultScope: t.defaultScope,
            toolAccess: t.toolAccess,
            model: t.model ?? null,
          })),
          count: templates.length,
          tip: "Create an agent from a template: use operation 'create_from_template' with slug set to the template slug (e.g. 'research-assistant'). You can override scope, name, instructions, tool_access, and model.",
        });
      }

      const auth = getFullMcpAuth(extra);
      if (!auth) return err("Unauthorized. Check that your API key is valid and included in the request.");

      switch (args.operation) {
        case "get": {
          if (!args.name) {
            return err(
              "Missing required field: name\n\n" +
              "Provide the agent's prompt name, e.g. 'agent:org:research-assistant'.\n" +
              "Use operation 'list' to see all available agents and their prompt names."
            );
          }

          const result = await listAgents(auth);
          if (!result.ok) return err(result.error);

          const all = [...result.data.organization, ...result.data.team, ...result.data.user];
          const agent = all.find((a) => `agent:${a.scope === "organization" ? "org" : a.scope}:${a.slug}` === args.name);

          if (!agent) {
            return err(
              `Agent "${args.name}" not found.\n\n` +
              "Expected format: 'agent:<scope>:<slug>' (e.g. 'agent:org:research-assistant', 'agent:user:my-helper').\n" +
              "Use operation 'list' to see all available agents."
            );
          }
          return ok(agent);
        }

        case "create": {
          const missing: string[] = [];
          if (!args.scope) missing.push("scope — 'user', 'organization', or 'team'");
          if (!args.name) missing.push("name — display name (e.g. 'Research Assistant')");
          if (!args.instructions) missing.push("instructions — system prompt text");

          if (missing.length > 0) {
            return err(
              "Missing required fields:\n" +
              missing.map((m) => `  • ${m}`).join("\n") +
              "\n\nTip: For a faster start, try 'list_templates' to see ready-made agents you can create with 'create_from_template'."
            );
          }

          const result = await createAgent(auth, {
            scope: args.scope!,
            teamId: args.team_id,
            name: args.name!,
            slug: args.slug,
            description: args.description,
            instructions: args.instructions!,
            toolAccess: args.tool_access,
            model: args.model,
          });

          if (!result.ok) return err(result.error);

          const data = result.data;
          const promptName = `agent:${data.scope === "organization" ? "org" : data.scope}:${data.slug}`;

          logAuditEvent({
            organizationId: auth.organizationId,
            actorId: auth.userId,
            eventType: AuditEventType.AGENT_CREATED,
            resourceType: "agent",
            resourceId: data.id,
            description: `Created agent "${data.name}" (${data.scope}) via MCP`,
            metadata: { name: data.name, scope: data.scope, slug: data.slug },
          });
          return ok({
            ...data,
            promptName,
            tip: `Agent created! It will be available as an MCP prompt (${promptName}) after server restart. Use 'list' to see all agents.`,
          });
        }

        case "create_from_template": {
          if (!args.slug) {
            const templates = await listTemplates();
            return err(
              "Missing required field: slug (the template slug to create from).\n\n" +
              "Available templates:\n" +
              templates.map((t) => `  • "${t.slug}" — ${t.name}: ${t.description}`).join("\n") +
              "\n\nSet slug to one of these values."
            );
          }

          const result = await createFromTemplate(auth, args.slug, {
            scope: args.scope,
            name: args.name,
            instructions: args.instructions,
            toolAccess: args.tool_access,
            model: args.model,
          });

          if (!result.ok) {
            if (result.templateNotFound && result.availableSlugs) {
              return err(
                `Template "${args.slug}" not found.\n\n` +
                "Available template slugs:\n" +
                result.availableSlugs.map((s) => `  • "${s}"`).join("\n") +
                "\n\nUse one of these slugs, or try 'list_templates' for full details."
              );
            }
            return err(result.error);
          }

          const data = result.data;
          const promptName = `agent:${data.scope === "organization" ? "org" : data.scope}:${data.slug}`;
          return ok({
            ...data,
            promptName,
            tip: `Agent created from template! It will be available as an MCP prompt (${promptName}) after server restart.`,
          });
        }

        case "update": {
          if (!args.id) {
            return err(
              "Missing required field: id (agent UUID).\n\n" +
              "Use operation 'list' to find the agent's id."
            );
          }

          const result = await updateAgent(auth, args.id, {
            name: args.name,
            description: args.description,
            instructions: args.instructions,
            toolAccess: args.tool_access,
            model: args.model,
            enabled: args.enabled,
            scope: args.scope,
            teamId: args.team_id,
          });

          if (!result.ok) return err(result.error);

          const data = result.data;
          const promptName = `agent:${data.scope === "organization" ? "org" : data.scope}:${data.slug}`;

          const isScopeChange = args.scope !== undefined;
          logAuditEvent({
            organizationId: auth.organizationId,
            actorId: auth.userId,
            eventType: isScopeChange ? AuditEventType.AGENT_SCOPE_CHANGED : AuditEventType.AGENT_UPDATED,
            resourceType: "agent",
            resourceId: args.id,
            description: isScopeChange
              ? `Agent scope changed to ${args.scope} via MCP`
              : `Updated agent via MCP`,
            metadata: { name: args.name, scope: args.scope, version: data.currentVersion },
          });

          return ok({
            ...data,
            promptName,
            tip: `Agent updated (v${data.currentVersion}). MCP prompt changes take effect after server restart.`,
          });
        }

        case "delete": {
          if (!args.id) {
            return err(
              "Missing required field: id (agent UUID).\n\n" +
              "Use operation 'list' to find the agent's id."
            );
          }

          const result = await deleteAgentService(auth, args.id);
          if (!result.ok) return err(result.error);

          logAuditEvent({
            organizationId: auth.organizationId,
            actorId: auth.userId,
            eventType: AuditEventType.AGENT_DELETED,
            resourceType: "agent",
            resourceId: args.id,
            description: `Deleted agent via MCP`,
          });

          return ok({ deleted: true, tip: "Agent deleted. The MCP prompt will be removed after server restart." });
        }

        case "history": {
          if (!args.id) {
            return err(
              "Missing required field: id (agent UUID).\n\n" +
              "Use operation 'list' to find the agent's id."
            );
          }

          const result = await listAgentVersions(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "version": {
          const missing: string[] = [];
          if (!args.id) missing.push("id — agent UUID");
          if (args.version === undefined) missing.push("version — version number to view");

          if (missing.length > 0) {
            return err(
              "Missing required fields:\n" +
              missing.map((m) => `  • ${m}`).join("\n") +
              "\n\nUse 'history' to see available versions for an agent."
            );
          }

          const result = await getAgentVersion(auth, args.id!, args.version!);
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "rollback": {
          const missing: string[] = [];
          if (!args.id) missing.push("id — agent UUID");
          if (args.version === undefined) missing.push("version — target version to restore");

          if (missing.length > 0) {
            return err(
              "Missing required fields:\n" +
              missing.map((m) => `  • ${m}`).join("\n") +
              "\n\nUse 'history' to see available versions for an agent."
            );
          }

          const result = await rollbackAgent(auth, args.id!, args.version!);
          if (!result.ok) return err(result.error);

          const data = result.data;
          const promptName = `agent:${data.scope === "organization" ? "org" : data.scope}:${data.slug}`;

          logAuditEvent({
            organizationId: auth.organizationId,
            actorId: auth.userId,
            eventType: AuditEventType.AGENT_ROLLED_BACK,
            resourceType: "agent",
            resourceId: args.id!,
            description: `Rolled back agent to version ${args.version} via MCP`,
            metadata: { targetVersion: args.version, newVersion: data.currentVersion },
          });

          return ok({
            ...data,
            promptName,
            tip: `Rolled back to version ${args.version}. Now at v${data.currentVersion}. MCP prompt changes take effect after server restart.`,
          });
        }

        case "search": {
          if (!args.name) {
            return err(
              "Missing required field: name (used as search query).\n\n" +
              "Provide a search term, e.g. name: 'research' or name: 'standup slack'."
            );
          }

          const result = await searchAgents(auth, args.name, { limit: 10 });
          if (!result.ok) return err(result.error);

          if (result.data.length === 0) {
            return ok({ results: [], count: 0, tip: "No agents matched your search. Try 'list' to see all agents, or 'list_templates' for templates." });
          }

          return ok({
            results: result.data.map((a) => ({
              ...a,
              promptName: `agent:${a.scope === "organization" ? "org" : a.scope}:${a.slug}`,
            })),
            count: result.data.length,
          });
        }

        case "list_integrations": {
          const catalog = await getFullCatalog();
          const integrations = catalog.map((c) => ({
            id: c.id.startsWith("proxy:") ? c.id.replace("proxy:", "") : c.id,
            name: c.name,
            kind: c.kind,
            category: c.category,
            toolCount: c.toolCount,
            tools: c.tools.map((t) => t.name),
          }));

          return ok({
            integrations,
            count: integrations.length,
            tip: 'Use these IDs in tool_access. Whole integration: ["slack"]. Specific tool: ["slack:slack_post_message"]. Mixed: ["slack", "google-calendar:google_calendar_list_events"].',
          });
        }
      }
    })
  );

  // Mark agent tool as platform tool (always visible, no connection required)
  toolMeta.set("manage_agents", { integrationId: "platform", orgId: null });
}

/** Merge agent prompts into the existing prompts/list handler. Called after skills registration. */
export function getAgentPromptEntries(agents: AgentRecord[], ctx: { userId?: string; organizationId?: string; teamIds?: string[] }) {
  const visible = filterAgentsForUser(agents, ctx);
  return visible.map((agent) => ({
    name: agentPromptName(agent),
    description: agent.description || agent.name,
    arguments: [] as Array<{ name: string; description: string; required: boolean }>,
  }));
}
