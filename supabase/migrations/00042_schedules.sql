-- ============================================================================
-- Schedules: Cron-triggered Agent Runs
-- ============================================================================

-- schedules table
CREATE TABLE schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,

  -- Timing
  cron_expression text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',

  -- What to execute
  prompt text NOT NULL,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  skill_id uuid REFERENCES skills(id) ON DELETE SET NULL,
  skill_arguments jsonb DEFAULT '{}',
  tool_access jsonb NOT NULL DEFAULT '[]',
  model text,

  -- Delivery
  delivery jsonb NOT NULL DEFAULT '[{"type":"slack_dm"}]',

  -- Scoped entity (exactly one set)
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

  -- State
  enabled boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_status text,
  run_count integer NOT NULL DEFAULT 0,
  consecutive_failures integer NOT NULL DEFAULT 0,

  -- Audit
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT schedules_scope_check CHECK (
    (organization_id IS NOT NULL AND team_id IS NULL AND user_id IS NULL) OR
    (organization_id IS NULL AND team_id IS NOT NULL AND user_id IS NULL) OR
    (organization_id IS NULL AND team_id IS NULL AND user_id IS NOT NULL)
  )
);

-- Partial unique slug per scope
CREATE UNIQUE INDEX idx_schedules_slug_org ON schedules (slug, organization_id) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX idx_schedules_slug_team ON schedules (slug, team_id) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX idx_schedules_slug_user ON schedules (slug, user_id) WHERE user_id IS NOT NULL;

-- Polling index for due schedules
CREATE INDEX idx_schedules_next_run ON schedules (next_run_at)
  WHERE enabled = true AND paused = false AND next_run_at IS NOT NULL;

-- RLS
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- User can see own schedules
CREATE POLICY "Users can view own schedules"
  ON schedules FOR SELECT
  USING (user_id = auth.uid());

-- User can see org schedules
CREATE POLICY "Users can view org schedules"
  ON schedules FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- User can see team schedules
CREATE POLICY "Users can view team schedules"
  ON schedules FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- schedule_runs table
CREATE TABLE schedule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout', 'skipped')),
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  result text,
  error text,
  delivery_results jsonb DEFAULT '[]',
  prompt text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_runs_schedule_id ON schedule_runs (schedule_id, created_at DESC);

-- RLS: inherit from parent schedule
ALTER TABLE schedule_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view runs of visible schedules"
  ON schedule_runs FOR SELECT
  USING (
    schedule_id IN (
      SELECT id FROM schedules WHERE
        user_id = auth.uid()
        OR organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  );

-- claim_due_schedules function (atomic claim with SKIP LOCKED)
CREATE OR REPLACE FUNCTION claim_due_schedules(max_count integer DEFAULT 10)
RETURNS SETOF schedules
LANGUAGE sql
AS $$
  UPDATE schedules
  SET next_run_at = NULL
  WHERE id IN (
    SELECT id FROM schedules
    WHERE enabled = true
      AND paused = false
      AND next_run_at IS NOT NULL
      AND next_run_at <= now()
    ORDER BY next_run_at
    LIMIT max_count
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
