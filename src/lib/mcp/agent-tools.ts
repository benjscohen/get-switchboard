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
} from "@/lib/agents/service";
import type { ToolMeta } from "./tool-filtering";
import { withToolLogging } from "./tool-logging";
import { getFullMcpAuth, ok, err } from "./types";
import { getFullCatalog } from "@/lib/integrations/catalog";

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
    "Manage agent definitions (reusable AI agent configurations). CRUD, search, version history, and rollback.",
    {
      operation: z.enum(["list", "get", "create", "update", "delete", "history", "version", "rollback", "search", "list_integrations"])
        .describe("Agent operation to perform"),
      id: z.string().optional()
        .describe("Agent ID (required for update, delete, history, version, rollback)"),
      name: z.string().optional()
        .describe("Agent prompt name for 'get' (e.g. agent:org:research-assistant), or display name for 'create'/'update'"),
      scope: z.enum(["user", "organization", "team"]).optional()
        .describe("Agent visibility scope (required for create)"),
      slug: z.string().optional()
        .describe("URL-friendly slug (auto-generated from name if omitted)"),
      description: z.string().optional()
        .describe("Short description of the agent"),
      instructions: z.string().optional()
        .describe("Agent system prompt / instructions"),
      tool_access: z.array(z.string()).optional()
        .describe("Array of integration IDs or integration:tool entries (e.g. [\"slack\", \"google-calendar:google_calendar_list_events\"]). Use list_integrations to see available options."),
      model: z.string().optional()
        .describe("Preferred model (e.g. claude-sonnet-4-6)"),
      team_id: z.string().optional()
        .describe("Team ID (required when scope is 'team')"),
      enabled: z.boolean().optional()
        .describe("Enable or disable the agent (update only)"),
      version: z.number().optional()
        .describe("Version number (for 'version' to view a specific version, for 'rollback' as target)"),
    },
    withToolLogging("manage_agents", "platform", async (args, extra) => {
      // "list" returns empty array when unauthenticated; all others require auth
      if (args.operation === "list") {
        const auth = getFullMcpAuth(extra);
        if (!auth) return ok([]);

        const result = await listAgents(auth);
        if (!result.ok) return err(result.error);

        const all = [
          ...result.data.organization,
          ...result.data.team,
          ...result.data.user,
        ].map((a) => ({
          id: a.id,
          name: `agent:${a.scope === "organization" ? "org" : a.scope}:${a.slug}`,
          description: a.description,
          toolCount: a.toolAccess.length,
          model: a.model,
        }));

        return ok(all);
      }

      const auth = getFullMcpAuth(extra);
      if (!auth) return err("Unauthorized");

      switch (args.operation) {
        case "get": {
          if (!args.name) return err("Missing required field: name");

          const result = await listAgents(auth);
          if (!result.ok) return err(result.error);

          const all = [...result.data.organization, ...result.data.team, ...result.data.user];
          const agent = all.find((a) => `agent:${a.scope === "organization" ? "org" : a.scope}:${a.slug}` === args.name);

          if (!agent) return err(`Agent "${args.name}" not found or not available`);
          return ok(agent);
        }

        case "create": {
          if (!args.scope || !args.name || !args.instructions) {
            return err("Missing required fields: scope, name, instructions");
          }

          const result = await createAgent(auth, {
            scope: args.scope,
            teamId: args.team_id,
            name: args.name,
            slug: args.slug,
            description: args.description,
            instructions: args.instructions,
            toolAccess: args.tool_access,
            model: args.model,
          });

          if (!result.ok) return err(result.error);
          return ok(JSON.stringify(result.data, null, 2) + "\n\nNote: This agent will be available as an MCP prompt after server restart.");
        }

        case "update": {
          if (!args.id) return err("Missing required field: id");

          const result = await updateAgent(auth, args.id, {
            name: args.name,
            description: args.description,
            instructions: args.instructions,
            toolAccess: args.tool_access,
            model: args.model,
            enabled: args.enabled,
          });

          if (!result.ok) return err(result.error);
          return ok(JSON.stringify(result.data, null, 2) + "\n\nNote: MCP prompt changes take effect after server restart.");
        }

        case "delete": {
          if (!args.id) return err("Missing required field: id");

          const result = await deleteAgentService(auth, args.id);

          if (!result.ok) return err(result.error);
          return ok("Agent deleted successfully.");
        }

        case "history": {
          if (!args.id) return err("Missing required field: id");

          const result = await listAgentVersions(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "version": {
          if (!args.id || args.version === undefined) {
            return err("Missing required fields: id, version");
          }

          const result = await getAgentVersion(auth, args.id, args.version);
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "rollback": {
          if (!args.id || args.version === undefined) {
            return err("Missing required fields: id, version");
          }

          const result = await rollbackAgent(auth, args.id, args.version);
          if (!result.ok) return err(result.error);
          return ok(JSON.stringify(result.data, null, 2) + "\n\nRollback applied. MCP prompt changes take effect after server restart.");
        }

        case "search": {
          if (!args.name) return err("Missing required field: name (used as search query)");

          const result = await searchAgents(auth, args.name, { limit: 10 });
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "list_integrations": {
          const catalog = await getFullCatalog();
          return ok(catalog.map((c) => ({
            id: c.id.startsWith("proxy:") ? c.id.replace("proxy:", "") : c.id,
            name: c.name,
            kind: c.kind,
            category: c.category,
            toolCount: c.toolCount,
            tools: c.tools.map((t) => t.name),
          })));
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
