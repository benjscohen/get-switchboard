-- 00051_threads_view.sql
-- Foundation for the Threads Kanban View feature

-- (a) Update agent_sessions status CHECK constraint to include 'idle'
ALTER TABLE agent_sessions DROP CONSTRAINT IF EXISTS agent_sessions_status_check;
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_status_check
  CHECK (status IN ('pending', 'running', 'idle', 'completed', 'failed', 'timeout'));

-- (b) Create session_commands table for cross-service DB command queue
CREATE TABLE session_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  command TEXT NOT NULL CHECK (command IN ('stop', 'respond')),
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_session_commands_pending
  ON session_commands (status, created_at)
  WHERE status = 'pending';

-- (c) Performance index on agent_sessions for org + status queries
CREATE INDEX idx_agent_sessions_org_status
  ON agent_sessions (organization_id, status, created_at DESC);
