-- Add status tracking columns
ALTER TABLE agent_feedback
  ADD COLUMN status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix')),
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by text;

CREATE INDEX agent_feedback_status_idx ON agent_feedback(status);

-- Remove the select policy that lets org members read feedback
DROP POLICY IF EXISTS "org_feedback_select" ON agent_feedback;
