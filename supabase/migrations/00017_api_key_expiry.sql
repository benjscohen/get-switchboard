-- Add expires_at column to api_keys with 90-day default
ALTER TABLE api_keys
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');

-- Backfill existing keys: set expires_at to created_at + 90 days
UPDATE api_keys SET expires_at = created_at + interval '90 days';
