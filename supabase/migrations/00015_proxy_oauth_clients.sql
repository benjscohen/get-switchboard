-- Stores DCR (Dynamic Client Registration) credentials for proxy OAuth integrations.
-- Only accessed via service-role client, no RLS needed.
CREATE TABLE proxy_oauth_clients (
  integration_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret TEXT,  -- nullable, some providers use public clients
  created_at TIMESTAMPTZ DEFAULT now()
);
