ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
