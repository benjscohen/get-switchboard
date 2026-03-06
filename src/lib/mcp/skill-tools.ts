import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListPromptsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  filterSkillsForUser,
  skillPromptName,
  interpolateSkillContent,
  type SkillRecord,
} from "./skill-filtering";
import {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill as deleteSkillService,
  listSkillVersions,
  getSkillVersion,
  rollbackSkill,
} from "@/lib/skills/service";
import type { ToolMeta } from "./tool-filtering";
import { withToolLogging } from "./tool-logging";
import { getFullMcpAuth, ok, err } from "./types";

export function registerSkillTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
  skills: SkillRecord[],
): void {
  // Register each skill as an MCP prompt
  for (const skill of skills) {
    const promptName = skillPromptName(skill);

    if (skill.arguments.length > 0) {
      const zodShape: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> = {};
      for (const arg of skill.arguments) {
        zodShape[arg.name] = arg.required
          ? z.string().describe(arg.description || "")
          : z.string().describe(arg.description || "").optional();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.prompt(promptName, skill.description || skill.name, zodShape as any, (args: Record<string, string>) => ({
        messages: [{ role: "user" as const, content: { type: "text" as const, text: interpolateSkillContent(skill.content, args) } }],
      }));
    } else {
      server.prompt(promptName, skill.description || skill.name, () => ({
        messages: [{ role: "user" as const, content: { type: "text" as const, text: skill.content } }],
      }));
    }
  }

  // Register manage_skills tool (consolidated CRUD)
  server.tool(
    "manage_skills",
    "Manage skills (prompt templates). CRUD plus version history and rollback. Use 'history' to view the audit trail (requires write access).",
    {
      operation: z.enum(["list", "get", "create", "update", "delete", "history", "version", "rollback"])
        .describe("Skill operation to perform"),
      id: z.string().optional()
        .describe("Skill ID (required for update, delete, history, version, rollback)"),
      name: z.string().optional()
        .describe("Skill prompt name for 'get' (e.g. org:code-review), or display name for 'create'/'update'"),
      scope: z.enum(["user", "organization", "team"]).optional()
        .describe("Skill visibility scope (required for create)"),
      slug: z.string().optional()
        .describe("URL-friendly slug (auto-generated from name if omitted)"),
      description: z.string().optional()
        .describe("Short description of the skill"),
      content: z.string().optional()
        .describe("Skill prompt content (supports {{arg}} interpolation)"),
      arguments: z.array(z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
      })).optional().describe("Skill arguments for interpolation"),
      team_id: z.string().optional()
        .describe("Team ID (required when scope is 'team')"),
      enabled: z.boolean().optional()
        .describe("Enable or disable the skill (update only)"),
      version: z.number().optional()
        .describe("Version number (for 'version' to view a specific version, for 'rollback' as target)"),
    },
    withToolLogging("manage_skills", "platform", async (args, extra) => {
      // "list" returns empty array when unauthenticated; all others require auth
      if (args.operation === "list") {
        const auth = getFullMcpAuth(extra);
        if (!auth) return ok([]);

        const result = await listSkills(auth);
        if (!result.ok) return err(result.error);

        const all = [
          ...result.data.organization,
          ...result.data.team,
          ...result.data.user,
        ].map((s) => ({
          id: s.id,
          name: `${s.scope === "organization" ? "org" : s.scope}:${s.slug}`,
          description: s.description,
          argumentCount: s.arguments.length,
        }));

        return ok(all);
      }

      const auth = getFullMcpAuth(extra);
      if (!auth) return err("Unauthorized");

      switch (args.operation) {
        case "get": {
          if (!args.name) return err("Missing required field: name");

          const result = await listSkills(auth);
          if (!result.ok) return err(result.error);

          const all = [...result.data.organization, ...result.data.team, ...result.data.user];
          const skill = all.find((s) => `${s.scope === "organization" ? "org" : s.scope}:${s.slug}` === args.name);

          if (!skill) return err(`Skill "${args.name}" not found or not available`);
          return ok(skill.content);
        }

        case "create": {
          if (!args.scope || !args.name || !args.content) {
            return err("Missing required fields: scope, name, content");
          }

          const result = await createSkill(auth, {
            scope: args.scope,
            teamId: args.team_id,
            name: args.name,
            slug: args.slug,
            description: args.description,
            content: args.content,
            arguments: args.arguments,
          });

          if (!result.ok) return err(result.error);
          return ok(JSON.stringify(result.data, null, 2) + "\n\nNote: This skill will be available as an MCP prompt after server restart.");
        }

        case "update": {
          if (!args.id) return err("Missing required field: id");

          const result = await updateSkill(auth, args.id, {
            name: args.name,
            description: args.description,
            content: args.content,
            arguments: args.arguments,
            enabled: args.enabled,
          });

          if (!result.ok) return err(result.error);
          return ok(JSON.stringify(result.data, null, 2) + "\n\nNote: MCP prompt changes take effect after server restart.");
        }

        case "delete": {
          if (!args.id) return err("Missing required field: id");

          const result = await deleteSkillService(auth, args.id);

          if (!result.ok) return err(result.error);
          return ok("Skill deleted successfully.");
        }

        case "history": {
          if (!args.id) return err("Missing required field: id");

          const result = await listSkillVersions(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "version": {
          if (!args.id || args.version === undefined) {
            return err("Missing required fields: id, version");
          }

          const result = await getSkillVersion(auth, args.id, args.version);
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "rollback": {
          if (!args.id || args.version === undefined) {
            return err("Missing required fields: id, version");
          }

          const result = await rollbackSkill(auth, args.id, args.version);
          if (!result.ok) return err(result.error);
          return ok(JSON.stringify(result.data, null, 2) + "\n\nRollback applied. MCP prompt changes take effect after server restart.");
        }
      }
    })
  );

  // Override prompts/list to filter per-user
  const registeredPrompts = (server as unknown as { _registeredPrompts: Record<string, {
    description?: string;
    argsSchema?: unknown;
  }> })._registeredPrompts;

  server.server.setRequestHandler(ListPromptsRequestSchema, (_request, extra) => {
    const userId = extra.authInfo?.extra?.userId as string | undefined;
    const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
    const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;

    const visible = filterSkillsForUser(skills, { userId, organizationId, teamIds });
    const visibleNames = new Set(visible.map(skillPromptName));

    const prompts = Object.entries(registeredPrompts)
      .filter(([name]) => visibleNames.has(name))
      .map(([name, prompt]) => ({
        name,
        description: prompt.description,
        arguments: skills
          .find((s) => skillPromptName(s) === name)
          ?.arguments.map((a) => ({
            name: a.name,
            description: a.description,
            required: a.required,
          })) ?? [],
      }));

    return { prompts };
  });

  // Mark skill tool as platform tool (always visible, no connection required)
  toolMeta.set("manage_skills", { integrationId: "platform", orgId: null });
}
