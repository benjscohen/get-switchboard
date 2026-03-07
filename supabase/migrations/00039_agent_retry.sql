-- Add retry tracking and slack message ts to agent_sessions
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS retry_of uuid REFERENCES agent_sessions(id);
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS slack_message_ts text;

CREATE INDEX IF NOT EXISTS agent_sessions_retry_idx ON agent_sessions (retry_of) WHERE retry_of IS NOT NULL;
