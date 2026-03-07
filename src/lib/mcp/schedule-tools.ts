import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  triggerSchedule,
  listScheduleRuns,
} from "@/lib/schedules/service";
import type { DeliveryTarget } from "@/lib/schedules/service";
import type { ToolMeta } from "./tool-filtering";
import { withToolLogging } from "./tool-logging";
import { getFullMcpAuth, ok, err } from "./types";

const TOOL_DESCRIPTION = `Manage scheduled agent runs. Schedules trigger agents on a cron schedule and deliver results to Slack or files.

Operations:
  list      — List all schedules with next run times
  get       — Get full schedule details (by id)
  create    — Create a new schedule (requires: prompt, cron, scope)
  update    — Update schedule config (by id)
  delete    — Delete a schedule (by id)
  pause     — Pause a schedule (stops future runs)
  resume    — Resume a paused schedule (resets failure count)
  trigger   — Manually run a schedule now (great for testing)
  history   — View execution history for a schedule

Scope:
  "user"         — Only you can see/use it
  "organization" — Everyone in your org (requires admin/owner role)
  "team"         — Team members only (requires team_id)

Cron format: 5-field (min hour dom month dow)
  "0 9 * * 1-5"  — Weekdays at 9:00 AM
  "*/30 * * * *"  — Every 30 minutes
  "0 0 * * 1"     — Mondays at midnight

Delivery targets (array):
  { "type": "slack_dm" }                                — DM the schedule creator
  { "type": "slack_channel", "channel_id": "C01234" }  — Post to a Slack channel
  { "type": "file", "path": "/reports/daily.md" }      — Write to a Switchboard file

Composition:
  - Set agent_id to use an agent's instructions + tool_access
  - Set skill_id + skill_arguments to run a skill template
  - prompt is always required (appended as additional context)`;

export function registerScheduleTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
): void {
  server.tool(
    "manage_schedules",
    TOOL_DESCRIPTION,
    {
      operation: z.enum([
        "list", "get", "create", "update", "delete",
        "pause", "resume", "trigger", "history",
      ]).describe("Operation to perform."),
      id: z.string().optional()
        .describe("Schedule UUID. Required for: get, update, delete, pause, resume, trigger, history."),
      name: z.string().optional()
        .describe("Display name for the schedule."),
      slug: z.string().optional()
        .describe("URL-friendly identifier. Auto-generated from name if omitted."),
      description: z.string().optional()
        .describe("Short description of what this schedule does."),
      scope: z.enum(["user", "organization", "team"]).optional()
        .describe("Visibility scope. Required for 'create'."),
      cron: z.string().optional()
        .describe("5-field cron expression (min hour dom month dow). Required for 'create'."),
      timezone: z.string().optional()
        .describe("IANA timezone (e.g. 'America/New_York'). Defaults to UTC."),
      prompt: z.string().optional()
        .describe("Instruction text for the agent. Required for 'create'."),
      agent_id: z.string().optional()
        .describe("Agent UUID — use agent's instructions + tool_access."),
      skill_id: z.string().optional()
        .describe("Skill UUID — run a skill template."),
      skill_arguments: z.record(z.string(), z.unknown()).optional()
        .describe("Arguments for skill template interpolation."),
      tool_access: z.array(z.string()).optional()
        .describe("Integration/tool access list. Overrides agent's tool_access if set."),
      model: z.string().optional()
        .describe("Model override (e.g. 'claude-sonnet-4-6')."),
      delivery: z.array(z.object({
        type: z.enum(["slack_dm", "slack_channel", "file"]),
        channel_id: z.string().min(1, "'channel_id' must be non-empty when provided (e.g. 'C01234ABC'). Find channel IDs using Slack.").optional(),
        channel_name: z.string().min(1, "'channel_name' must be non-empty when provided").optional(),
        path: z.string().min(1, "'path' must be non-empty when provided (e.g. '/reports/daily.md')").optional(),
      })).optional()
        .describe("Delivery targets. Defaults to [{ type: \"slack_dm\" }]."),
      team_id: z.string().optional()
        .describe("Team UUID. Required when scope is 'team'."),
      enabled: z.boolean().optional()
        .describe("Enable/disable the schedule. Only used with 'update'."),
      limit: z.number().optional()
        .describe("Number of history entries to return (default 20). Only used with 'history'."),
    },
    withToolLogging("manage_schedules", "platform", async (args, extra) => {
      if (args.operation === "list") {
        const auth = getFullMcpAuth(extra);
        if (!auth) return ok({ schedules: [], count: 0, tip: "Authenticate with an API key to see your schedules." });

        const result = await listSchedules(auth);
        if (!result.ok) return err(result.error);

        const all = [
          ...result.data.organization,
          ...result.data.team,
          ...result.data.user,
        ].map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          cron: s.cronExpression,
          cronDescription: s.cronDescription,
          timezone: s.timezone,
          scope: s.scope,
          enabled: s.enabled,
          paused: s.paused,
          nextRunAt: s.nextRunAt,
          lastRunAt: s.lastRunAt,
          lastRunStatus: s.lastRunStatus,
          runCount: s.runCount,
        }));

        if (all.length === 0) {
          return ok({
            schedules: [],
            count: 0,
            tip: "No schedules yet. Use 'create' to set up a scheduled agent run.",
          });
        }

        return ok({ schedules: all, count: all.length });
      }

      const auth = getFullMcpAuth(extra);
      if (!auth) return err("Unauthorized. Check that your API key is valid and included in the request.");

      switch (args.operation) {
        case "get": {
          if (!args.id) return err("Missing required field: id (schedule UUID).\n\nUse operation 'list' to find schedule IDs.");
          const result = await getScheduleById(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok(result.data);
        }

        case "create": {
          const missing: string[] = [];
          if (!args.scope) missing.push("scope — 'user', 'organization', or 'team'");
          if (!args.name) missing.push("name — display name (e.g. 'Daily Standup')");
          if (!args.prompt) missing.push("prompt — instruction text for the agent");
          if (!args.cron) missing.push("cron — 5-field cron expression (e.g. '0 9 * * 1-5')");

          if (missing.length > 0) {
            return err(
              "Missing required fields:\n" +
              missing.map((m) => `  - ${m}`).join("\n")
            );
          }

          const result = await createSchedule(auth, {
            scope: args.scope!,
            teamId: args.team_id,
            name: args.name!,
            slug: args.slug,
            description: args.description,
            cron: args.cron!,
            timezone: args.timezone,
            prompt: args.prompt!,
            agentId: args.agent_id,
            skillId: args.skill_id,
            skillArguments: args.skill_arguments,
            toolAccess: args.tool_access,
            model: args.model,
            delivery: args.delivery as DeliveryTarget[] | undefined,
            enabled: args.enabled,
          });

          if (!result.ok) return err(result.error);

          return ok({
            ...result.data,
            tip: `Schedule created! Next run: ${result.data.nextRunAt}. Use 'trigger' to test it now, or 'history' to view past runs.`,
          });
        }

        case "update": {
          if (!args.id) return err("Missing required field: id (schedule UUID).\n\nUse operation 'list' to find schedule IDs.");

          const result = await updateSchedule(auth, args.id, {
            name: args.name,
            description: args.description,
            cron: args.cron,
            timezone: args.timezone,
            prompt: args.prompt,
            agentId: args.agent_id,
            skillId: args.skill_id,
            skillArguments: args.skill_arguments,
            toolAccess: args.tool_access,
            model: args.model,
            delivery: args.delivery as DeliveryTarget[] | undefined,
            enabled: args.enabled,
          });

          if (!result.ok) return err(result.error);
          return ok({ ...result.data, tip: "Schedule updated." });
        }

        case "delete": {
          if (!args.id) return err("Missing required field: id (schedule UUID).\n\nUse operation 'list' to find schedule IDs.");
          const result = await deleteSchedule(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok({ deleted: true, tip: "Schedule deleted." });
        }

        case "pause": {
          if (!args.id) return err("Missing required field: id (schedule UUID).");
          const result = await pauseSchedule(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok({ ...result.data, tip: "Schedule paused. Use 'resume' to re-enable." });
        }

        case "resume": {
          if (!args.id) return err("Missing required field: id (schedule UUID).");
          const result = await resumeSchedule(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok({ ...result.data, tip: `Schedule resumed. Next run: ${result.data.nextRunAt}` });
        }

        case "trigger": {
          if (!args.id) return err("Missing required field: id (schedule UUID).");
          const result = await triggerSchedule(auth, args.id);
          if (!result.ok) return err(result.error);
          return ok({ ...result.data, tip: "Manual run queued. Use 'history' to check the result." });
        }

        case "history": {
          if (!args.id) return err("Missing required field: id (schedule UUID).\n\nUse operation 'list' to find schedule IDs.");
          const result = await listScheduleRuns(auth, args.id, { limit: args.limit });
          if (!result.ok) return err(result.error);

          if (result.data.length === 0) {
            return ok({ runs: [], count: 0, tip: "No runs yet. Use 'trigger' to run it now." });
          }

          return ok({ runs: result.data, count: result.data.length });
        }
      }
    })
  );

  toolMeta.set("manage_schedules", { integrationId: "platform", orgId: null });
}
