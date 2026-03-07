import * as db from "./db.js";
import { executeScheduledRun } from "./scheduled-execution.js";

// ---------------------------------------------------------------------------
// Schedule polling loop
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000; // 30 seconds
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  console.log("[scheduler] Starting schedule poll loop (every 30s)");

  // Recover stale runs on startup
  recoverStaleScheduleRuns().catch((err) =>
    console.error("[scheduler] Recovery failed:", err),
  );

  // Start polling
  intervalHandle = setInterval(() => {
    pollDueSchedules().catch((err) =>
      console.error("[scheduler] Poll error:", err),
    );
  }, POLL_INTERVAL_MS);

  // Run immediately on startup too
  pollDueSchedules().catch((err) =>
    console.error("[scheduler] Initial poll error:", err),
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
  const schedules = await db.claimDueSchedules();
  if (schedules.length === 0) return;

  console.log(`[scheduler] Claimed ${schedules.length} due schedule(s)`);

  for (const schedule of schedules) {
    // Create a run row and fire execution asynchronously
    try {
      const runId = await db.createScheduleRun({
        schedule_id: schedule.id,
        scheduled_at: new Date().toISOString(),
        prompt: schedule.prompt,
        model: schedule.model,
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
        console.error(`[scheduler] Unhandled error in schedule ${schedule.id}:`, err);
        try {
          await db.updateScheduleRun(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            error: err instanceof Error ? err.message : "Unhandled scheduler error",
          });
          await db.recomputeNextRunAt(schedule.id, schedule.cron_expression, schedule.timezone);
        } catch (innerErr) {
          console.error(`[scheduler] Failed to mark run ${runId} as failed:`, innerErr);
        }
      });
    } catch (err) {
      console.error(`[scheduler] Failed to create run for schedule ${schedule.id}:`, err);
      // Recompute next_run_at even if run creation failed
      await db.recomputeNextRunAt(schedule.id, schedule.cron_expression, schedule.timezone);
    }
  }
}

// ---------------------------------------------------------------------------
// Recovery: mark stale 'running' runs as failed
// ---------------------------------------------------------------------------

async function recoverStaleScheduleRuns(): Promise<void> {
  const count = await db.recoverStaleScheduleRuns();
  if (count > 0) {
    console.log(`[scheduler] Recovered ${count} stale schedule run(s)`);
  }
}
