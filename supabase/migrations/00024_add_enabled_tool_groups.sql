-- Add enabled_tool_groups column to connections table
-- When null = all groups enabled (default)
-- When set = JSON array of enabled group keys, e.g. ["objects", "pipelines"]
ALTER TABLE connections ADD COLUMN enabled_tool_groups jsonb DEFAULT NULL;

COMMENT ON COLUMN connections.enabled_tool_groups IS 'JSON array of enabled tool group keys. NULL means all groups enabled.';
