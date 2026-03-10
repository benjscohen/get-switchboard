ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS close_requested boolean NOT NULL DEFAULT false;
