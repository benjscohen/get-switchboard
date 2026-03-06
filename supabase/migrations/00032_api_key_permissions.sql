-- Add per-key integration/tool permissions (JSONB)
-- NULL = unrestricted (backward compatible with all existing keys)
-- {} = no integrations allowed
-- { "google-calendar": null } = all tools for that integration
-- { "google-calendar": null, "google-gmail": ["list", "get"] } = mixed
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;
