-- Store Claude session transcript + file path so resume works across deploys
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS session_transcript text;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS session_file_path text;
