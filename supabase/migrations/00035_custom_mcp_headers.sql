-- Add custom_headers auth type support for custom MCP servers
-- Allows arbitrary HTTP headers (e.g., DD-API-KEY, DD-APPLICATION-KEY) instead of just Bearer tokens

-- custom_mcp_servers: stores header definitions
--   shared:   [{ "key": "DD-API-KEY", "value": "v1:encrypted..." }, ...]
--   per_user: [{ "key": "DD-API-KEY" }, { "key": "DD-APPLICATION-KEY" }]
ALTER TABLE custom_mcp_servers ADD COLUMN IF NOT EXISTS custom_headers jsonb;

-- custom_mcp_user_keys: stores per-user header values
--   { "DD-API-KEY": "v1:encrypted...", "DD-APPLICATION-KEY": "v1:encrypted..." }
ALTER TABLE custom_mcp_user_keys ADD COLUMN IF NOT EXISTS custom_headers jsonb;

-- Make api_key nullable (custom_headers auth doesn't need it)
ALTER TABLE custom_mcp_user_keys ALTER COLUMN api_key DROP NOT NULL;
