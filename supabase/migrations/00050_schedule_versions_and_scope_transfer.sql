-- ============================================================================
-- Schedule versioning + scope transfer support for all MCP entities
-- ============================================================================

-- 1. Schedule Versions — complete snapshot + audit trail per version
-- ============================================================================

CREATE TABLE schedule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  version integer NOT NULL,

  -- Snapshot of schedule state at this version
  name text NOT NULL,
  description text,
  cron_expression text NOT NULL,
  timezone text NOT NULL,
  prompt text NOT NULL,
  agent_id uuid,
  skill_id uuid,
  skill_arguments jsonb DEFAULT '{}',
  tool_access jsonb NOT NULL DEFAULT '[]',
  model text,
  delivery jsonb NOT NULL DEFAULT '[{"type":"slack_dm"}]',
  enabled boolean NOT NULL,

  -- Scope snapshot (tracks scope at time of version)
  scope_type text NOT NULL CHECK (scope_type IN ('organization', 'team', 'user')),
  scope_id uuid NOT NULL,

  -- Audit fields
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'rolled_back', 'scope_changed')),
  changed_by uuid NOT NULL REFERENCES profiles(id),
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(schedule_id, version)
);

CREATE INDEX idx_schedule_versions_schedule ON schedule_versions(schedule_id, version DESC);

ALTER TABLE schedule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view versions of own schedules"
  ON schedule_versions FOR SELECT
  USING (schedule_id IN (SELECT id FROM schedules WHERE user_id = auth.uid()));

CREATE POLICY "view versions of org schedules"
  ON schedule_versions FOR SELECT
  USING (schedule_id IN (
    SELECT id FROM schedules
    WHERE organization_id IS NOT NULL
      AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "view versions of team schedules"
  ON schedule_versions FOR SELECT
  USING (schedule_id IN (
    SELECT id FROM schedules
    WHERE team_id IS NOT NULL
      AND team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())
  ));


-- 2. Add current_version to schedules
-- ============================================================================

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;


-- 3. Backfill version 1 for all existing schedules
-- ============================================================================

INSERT INTO schedule_versions (
  schedule_id, version, name, description, cron_expression, timezone, prompt,
  agent_id, skill_id, skill_arguments, tool_access, model, delivery, enabled,
  scope_type, scope_id, change_type, changed_by
)
SELECT
  s.id, 1, s.name, s.description, s.cron_expression, s.timezone, s.prompt,
  s.agent_id, s.skill_id, s.skill_arguments, s.tool_access, s.model, s.delivery, s.enabled,
  CASE
    WHEN s.organization_id IS NOT NULL THEN 'organization'
    WHEN s.team_id IS NOT NULL THEN 'team'
    ELSE 'user'
  END,
  COALESCE(s.organization_id, s.team_id, s.user_id),
  'created', s.created_by
FROM schedules s;


-- 4. Add scope_type/scope_id snapshot columns to existing version tables
-- ============================================================================

-- Skill versions: track scope at time of change
ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS scope_type text;
ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS scope_id uuid;

-- Backfill skill version scope info from parent skill
UPDATE skill_versions sv SET
  scope_type = CASE
    WHEN s.organization_id IS NOT NULL THEN 'organization'
    WHEN s.team_id IS NOT NULL THEN 'team'
    ELSE 'user'
  END,
  scope_id = COALESCE(s.organization_id, s.team_id, s.user_id)
FROM skills s WHERE sv.skill_id = s.id AND sv.scope_type IS NULL;

-- Agent versions: track scope at time of change
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS scope_type text;
ALTER TABLE agent_versions ADD COLUMN IF NOT EXISTS scope_id uuid;

-- Backfill agent version scope info from parent agent
UPDATE agent_versions av SET
  scope_type = CASE
    WHEN a.organization_id IS NOT NULL THEN 'organization'
    WHEN a.team_id IS NOT NULL THEN 'team'
    ELSE 'user'
  END,
  scope_id = COALESCE(a.organization_id, a.team_id, a.user_id)
FROM agents a WHERE av.agent_id = a.id AND av.scope_type IS NULL;

-- Add 'scope_changed' to change_type check for skill_versions and agent_versions
ALTER TABLE skill_versions DROP CONSTRAINT IF EXISTS skill_versions_change_type_check;
ALTER TABLE skill_versions ADD CONSTRAINT skill_versions_change_type_check
  CHECK (change_type IN ('created', 'updated', 'rolled_back', 'scope_changed'));

ALTER TABLE agent_versions DROP CONSTRAINT IF EXISTS agent_versions_change_type_check;
ALTER TABLE agent_versions ADD CONSTRAINT agent_versions_change_type_check
  CHECK (change_type IN ('created', 'updated', 'rolled_back', 'scope_changed'));


-- 5. Add scope_changed audit event types (data only, no DDL needed — audit_events.event_type is text)
-- ============================================================================
-- New event types that will be used by the app layer:
--   skill.scope_changed
--   agent.scope_changed
--   schedule.scope_changed
