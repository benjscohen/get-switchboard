import * as db from "./db.js";
import { executeScheduledRun } from "./scheduled-execution.js";
import { logger } from "./logger.js";
import { isRedisEnabled, tryAcquireSchedulerLock, releaseSchedulerLock } from "./redis.js";

// ---------------------------------------------------------------------------
// Schedule polling loop
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000; // 30 seconds
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  logger.info("[scheduler] Starting schedule poll loop (every 30s)");

  // Recover stale runs on startup
  recoverStaleScheduleRuns().catch((err) =>
    logger.error({ err }, "[scheduler] Recovery failed"),
  );

  // Start polling
  intervalHandle = setInterval(() => {
    pollDueSchedules().catch((err) =>
      logger.error({ err }, "[scheduler] Poll error"),
    );
    pollPendingRuns().catch((err) =>
      logger.error({ err }, "[scheduler] Pending-run poll error"),
    );
  }, POLL_INTERVAL_MS);

  // Run immediately on startup too (picks up runs queued while worker was down)
  pollDueSchedules().catch((err) =>
    logger.error({ err }, "[scheduler] Initial poll error"),
  );
  pollPendingRuns().catch((err) =>
    logger.error({ err }, "[scheduler] Initial pending-run poll error"),
  );
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// ---------------------------------------------------------------------------
// Poll for due schedules and execute them
// ---------------------------------------------------------------------------

async function pollDueSchedules(): Promise<void> {
  // In multi-instance mode, only the lock holder polls
  if (isRedisEnabled()) {
    const acquired = await tryAcquireSchedulerLock();
    if (!acquired) return;
  }

  try {
    const schedules = await db.claimDueSchedules();
    if (schedules.length === 0) return;

    logger.info({ count: schedules.length }, "[scheduler] Claimed due schedule(s)");

    for (const schedule of schedules) {
    // Create a run row as 'running' (not 'pending') so pollPendingRuns won't claim it
    try {
      const now = new Date().toISOString();
      const runId = await db.createScheduleRun({
        schedule_id: schedule.id,
        scheduled_at: now,
        prompt: schedule.prompt,
        model: schedule.model,
        status: "running",
        started_at: now,
      });

      const run = {
        id: runId,
        schedule_id: schedule.id,
        prompt: schedule.prompt,
        model: schedule.model,
      };

      // Cast delivery types — DB returns {type: string} but we know they're valid
      const typedSchedule = schedule as Parameters<typeof executeScheduledRun>[0];

      // Fire and forget — executeScheduledRun handles its own errors,
      // but catch any truly unexpected failures as a safety net
      executeScheduledRun(typedSchedule, run).catch(async (err) => {
        logger.error({ err, scheduleId: schedule.id }, "[scheduler] Unhandled error in schedule");
        try {
          await db.updateScheduleRun(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            error: err instanceof Error ? err.message : "Unhandled scheduler error",
          });
          await db.recomputeNextRunAt(schedule.id, schedule.cron_expression, schedule.timezone);
        } catch (innerErr) {
          logger.error({ err: innerErr, runId }, "[scheduler] Failed to mark run as failed");
        }
      });
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, "[scheduler] Failed to create run for schedule");
      // Recompute next_run_at even if run creation failed
      await db.recomputeNextRunAt(schedule.id, schedule.cron_expression, schedule.timezone);
    }
  }
  } finally {
    if (isRedisEnabled()) {
      await releaseSchedulerLock();
    }
  }
}

// ---------------------------------------------------------------------------
// Poll for manually-triggered pending runs
// ---------------------------------------------------------------------------

async function pollPendingRuns(): Promise<void> {
  if (isRedisEnabled()) {
    const acquired = await tryAcquireSchedulerLock();
    if (!acquired) return;
  }

  try {
    const claimed = await db.claimPendingRuns();
    if (claimed.length === 0) return;

    logger.info({ count: claimed.length }, "[scheduler] Claimed pending run(s)");

    for (const row of claimed) {
    const schedule = {
      id: row.schedule_id,
      name: row.schedule_name,
      prompt: row.run_prompt,
      agent_id: row.agent_id,
      skill_id: row.skill_id,
      skill_arguments: row.skill_arguments,
      tool_access: row.tool_access,
      model: row.schedule_model,
      cron_expression: row.cron_expression,
      timezone: row.timezone,
      delivery: row.delivery,
      created_by: row.created_by,
      run_count: row.run_count,
      consecutive_failures: row.consecutive_failures,
    };

    const run = {
      id: row.run_id,
      schedule_id: row.schedule_id,
      prompt: row.run_prompt,
      model: row.run_model,
    };

    // Cast delivery types — DB returns {type: string} but we know they're valid
    const typedSchedule = schedule as Parameters<typeof executeScheduledRun>[0];

    // Fire and forget — executeScheduledRun handles its own errors
    executeScheduledRun(typedSchedule, run).catch(async (err) => {
      logger.error({ err, runId: row.run_id }, "[scheduler] Unhandled error in pending run");
      try {
        await db.updateScheduleRun(row.run_id, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error: err instanceof Error ? err.message : "Unhandled scheduler error",
        });
      } catch (innerErr) {
        logger.error({ err: innerErr, runId: row.run_id }, "[scheduler] Failed to mark pending run as failed");
      }
    });
  }
  } finally {
    if (isRedisEnabled()) {
      await releaseSchedulerLock();
    }
  }
}

// ---------------------------------------------------------------------------
// Recovery: mark stale 'running' runs as failed
// ---------------------------------------------------------------------------

async function recoverStaleScheduleRuns(): Promise<void> {
  const count = await db.recoverStaleScheduleRuns();
  if (count > 0) {
    logger.info({ count }, "[scheduler] Recovered stale schedule run(s)");
  }
}
