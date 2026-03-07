-- Storage bucket for workspace archives (service-role only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-workspaces', 'session-workspaces', false,
  524288000,  -- 500 MB
  ARRAY['application/gzip', 'application/x-gzip']
) ON CONFLICT (id) DO NOTHING;

-- Track archive path on the session
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS workspace_archive_path text;
