import * as db from "./db.js";
import { runAgentHeadless } from "./headless.js";
import { deliverResults, type DeliveryTarget } from "./delivery.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Schedule run orchestrator
// ---------------------------------------------------------------------------

interface ScheduleRow {
  id: string;
  name: string;
  prompt: string;
  agent_id: string | null;
  skill_id: string | null;
  skill_arguments: Record<string, unknown> | null;
  tool_access: string[] | null;
  model: string | null;
  cron_expression: string;
  timezone: string;
  delivery: DeliveryTarget[];
  created_by: string;
  run_count: number;
  consecutive_failures: number;
}

interface ScheduleRunRow {
  id: string;
  schedule_id: string;
  prompt: string;
  model: string | null;
}

/** Auto-pause a schedule after this many consecutive failed runs */
const MAX_CONSECUTIVE_FAILURES = 5;

export async function executeScheduledRun(
  schedule: ScheduleRow,
  run: ScheduleRunRow,
): Promise<void> {
  const startedAt = new Date().toISOString();

  // Mark run as running
  await db.updateScheduleRun(run.id, {
    status: "running",
    started_at: startedAt,
  });

  try {
    // 1. Look up the schedule creator's credentials
    const lookup = await db.lookupUserById(schedule.created_by);
    if (!lookup) {
      throw new Error(`Schedule creator ${schedule.created_by} not found or has no agent key`);
    }

    // 2. Build effective prompt
    let effectivePrompt = schedule.prompt;

    if (schedule.skill_id) {
      const skill = await db.getSkillById(schedule.skill_id);
      if (skill) {
        let skillContent = skill.content;
        // Interpolate skill arguments
        if (schedule.skill_arguments) {
          for (const [key, value] of Object.entries(schedule.skill_arguments)) {
            skillContent = skillContent.split(`{{${key}}}`).join(String(value));
          }
        }
        effectivePrompt = schedule.prompt
          ? `${skillContent}\n\nAdditional instructions: ${schedule.prompt}`
          : skillContent;
      }
    }

    // 3. Build agent config
    let systemPromptOverride: string | undefined;
    if (schedule.agent_id) {
      const agent = await db.getAgentById(schedule.agent_id);
      if (agent) {
        systemPromptOverride = agent.instructions;
      }
    }

    // 4. Determine model
    const model = schedule.model || lookup.model;

    // 5. Run the agent
    logger.info({ scheduleId: schedule.id, name: schedule.name, runId: run.id }, "[schedule] Running");

    const result = await runAgentHeadless({
      prompt: effectivePrompt,
      model,
      agentKey: lookup.agentKey,
      userId: lookup.userId,
      systemPromptOverride,
      timeoutMs: 10 * 60 * 1000,
      userIdentity: { name: lookup.name, email: lookup.email },
      chromeMcpEnabled: lookup.chromeMcpEnabled,
    });

    // 6. Create agent_sessions row for linking
    let sessionId: string | null = null;
    try {
      sessionId = await db.createScheduleAgentSession({
        userId: lookup.userId,
        organizationId: lookup.organizationId,
        prompt: effectivePrompt,
        model,
        status: result.status,
        result: result.text || null,
        error: result.error || null,
        claudeSessionId: result.claudeSessionId,
        totalTurns: result.turns,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, "[schedule] Failed to create agent session");
    }

    // 7. Deliver results
    let deliveryResults: unknown[] = [];
    if (result.status === "completed" && result.text) {
      deliveryResults = await deliverResults(schedule.delivery, result.text, {
        agentKey: lookup.agentKey,
        creatorUserId: schedule.created_by,
      });
    }

    // 8. Update run
    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    await db.updateScheduleRun(run.id, {
      status: result.status,
      completed_at: completedAt,
      duration_ms: durationMs,
      result: result.text || null,
      error: result.error || null,
      delivery_results: deliveryResults,
      session_id: sessionId,
    });

    // 9. Update schedule state
    const isFailed = result.status === "failed" || result.status === "timeout";
    const newConsecutiveFailures = isFailed ? schedule.consecutive_failures + 1 : 0;
    const shouldAutoPause = newConsecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

    const cronParams = { expression: schedule.cron_expression, timezone: schedule.timezone };
    await db.updateScheduleAfterRun(schedule.id, {
      last_run_at: completedAt,
      last_run_status: result.status,
      run_count: schedule.run_count + 1,
      consecutive_failures: newConsecutiveFailures,
      paused: shouldAutoPause || undefined,
    }, cronParams);

    if (shouldAutoPause) {
      logger.warn({ scheduleId: schedule.id, maxFailures: MAX_CONSECUTIVE_FAILURES }, "[schedule] Auto-paused after consecutive failures");
    }

    logger.info({ scheduleId: schedule.id, status: result.status, turns: result.turns, cost: result.cost.toFixed(4) }, "[schedule] Completed");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ scheduleId: schedule.id, err: errorMsg }, "[schedule] Execution failed");

    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    await db.updateScheduleRun(run.id, {
      status: "failed",
      completed_at: completedAt,
      duration_ms: durationMs,
      error: errorMsg,
    });

    const newConsecutiveFailures = schedule.consecutive_failures + 1;
    const shouldAutoPause = newConsecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

    const cronParams = { expression: schedule.cron_expression, timezone: schedule.timezone };
    await db.updateScheduleAfterRun(schedule.id, {
      last_run_at: completedAt,
      last_run_status: "failed",
      run_count: schedule.run_count + 1,
      consecutive_failures: newConsecutiveFailures,
      paused: shouldAutoPause || undefined,
    }, cronParams);

    if (shouldAutoPause) {
      logger.warn({ scheduleId: schedule.id, maxFailures: MAX_CONSECUTIVE_FAILURES }, "[schedule] Auto-paused after consecutive failures");
    }
  }
}
