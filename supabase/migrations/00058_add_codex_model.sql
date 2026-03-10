-- Add codex-mini-latest to the allowed models for user preferences
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_agent_model_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_preferred_agent_model_check
  CHECK (preferred_agent_model IN (
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-haiku-4-5',
    'codex-mini-latest'
  ));