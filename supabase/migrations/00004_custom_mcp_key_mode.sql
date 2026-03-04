-- Add key_mode and user_key_instructions to custom_mcp_servers
ALTER TABLE custom_mcp_servers
  ADD COLUMN key_mode text NOT NULL DEFAULT 'shared'
    CHECK (key_mode IN ('shared', 'per_user')),
  ADD COLUMN user_key_instructions text;
