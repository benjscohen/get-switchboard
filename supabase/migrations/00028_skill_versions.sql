-- Skill versioning & audit trail
-- Each version row is a complete snapshot + audit entry (who, when, what changed)

-- 1. Add current_version tracker to skills
ALTER TABLE skills ADD COLUMN current_version integer NOT NULL DEFAULT 1;

-- 2. Create skill_versions table
CREATE TABLE skill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version integer NOT NULL,

  -- Snapshot of skill state at this version
  name text NOT NULL,
  description text,
  content text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL,

  -- Audit fields
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'rolled_back')),
  changed_by uuid NOT NULL REFERENCES profiles(id),
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(skill_id, version)
);

CREATE INDEX idx_skill_versions_skill ON skill_versions(skill_id, version DESC);

-- 3. RLS — mirror skills visibility through parent skill
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view versions of own skills"
  ON skill_versions FOR SELECT
  USING (skill_id IN (SELECT id FROM skills WHERE user_id = auth.uid()));

CREATE POLICY "view versions of org skills"
  ON skill_versions FOR SELECT
  USING (skill_id IN (
    SELECT id FROM skills
    WHERE organization_id IS NOT NULL
      AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "view versions of team skills"
  ON skill_versions FOR SELECT
  USING (skill_id IN (
    SELECT id FROM skills
    WHERE team_id IS NOT NULL
      AND team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())
  ));

-- 4. Backfill version 1 for all existing skills
INSERT INTO skill_versions (skill_id, version, name, description, content, arguments, enabled, change_type, changed_by)
SELECT id, 1, name, description, content, arguments, enabled, 'created', created_by
FROM skills;
