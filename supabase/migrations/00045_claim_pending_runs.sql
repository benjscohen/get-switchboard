-- ============================================================================
-- claim_pending_runs: pick up manually-triggered runs stuck in "pending"
-- ============================================================================

-- Partial index for efficient polling of pending runs
CREATE INDEX idx_schedule_runs_pending ON schedule_runs (created_at)
  WHERE status = 'pending' AND started_at IS NULL;

-- Atomically claim pending runs (same SKIP LOCKED pattern as claim_due_schedules)
CREATE OR REPLACE FUNCTION claim_pending_runs(max_count integer DEFAULT 10)
RETURNS TABLE (
  run_id uuid,
  schedule_id uuid,
  run_prompt text,
  run_model text,
  schedule_name text,
  agent_id uuid,
  skill_id uuid,
  skill_arguments jsonb,
  tool_access jsonb,
  schedule_model text,
  cron_expression text,
  timezone text,
  delivery jsonb,
  created_by uuid,
  run_count integer,
  consecutive_failures integer
)
LANGUAGE sql
AS $$
  WITH claimed AS (
    UPDATE schedule_runs
    SET status = 'running', started_at = now()
    WHERE id IN (
      SELECT id FROM schedule_runs
      WHERE status = 'pending' AND started_at IS NULL
      ORDER BY created_at
      LIMIT max_count
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  )
  SELECT
    c.id            AS run_id,
    c.schedule_id   AS schedule_id,
    c.prompt        AS run_prompt,
    c.model         AS run_model,
    s.name          AS schedule_name,
    s.agent_id      AS agent_id,
    s.skill_id      AS skill_id,
    s.skill_arguments AS skill_arguments,
    s.tool_access   AS tool_access,
    s.model         AS schedule_model,
    s.cron_expression AS cron_expression,
    s.timezone      AS timezone,
    s.delivery      AS delivery,
    s.created_by    AS created_by,
    s.run_count     AS run_count,
    s.consecutive_failures AS consecutive_failures
  FROM claimed c
  JOIN schedules s ON s.id = c.schedule_id;
$$;
