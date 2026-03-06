-- 1. Reverse-lookup: Slack user ID -> Switchboard user
ALTER TABLE connections ADD COLUMN IF NOT EXISTS provider_user_id text;
CREATE INDEX IF NOT EXISTS connections_provider_lookup_idx
  ON connections (integration_id, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

-- 2. Agent key: store encrypted raw key for bot to use
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_agent_key boolean NOT NULL DEFAULT false;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_raw_key text;

-- 3. User's preferred model for the agent
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_agent_model text
  NOT NULL DEFAULT 'claude-sonnet-4-6'
  CHECK (preferred_agent_model IN ('claude-sonnet-4-6','claude-opus-4-6','claude-haiku-4-5'));

-- 4. Session tracking
CREATE TABLE IF NOT EXISTS agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  slack_channel_id text NOT NULL,
  slack_thread_ts text,
  claude_session_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','timeout')),
  prompt text NOT NULL,
  result text,
  error text,
  model text,
  total_turns integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_sessions_user_idx ON agent_sessions (user_id);
CREATE INDEX IF NOT EXISTS agent_sessions_status_idx ON agent_sessions (status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS agent_sessions_thread_idx ON agent_sessions (slack_channel_id, slack_thread_ts);

-- 5. Message log per session
CREATE TABLE IF NOT EXISTS agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text NOT NULL,
  slack_ts text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_messages_session_idx ON agent_messages (session_id);
