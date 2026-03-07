-- Add custom_headers column for proxy integrations that use multi-header auth (e.g. Datadog)
alter table proxy_user_keys
  add column custom_headers jsonb;

-- Allow api_key to be null when custom_headers is provided
alter table proxy_user_keys
  alter column api_key drop not null;

-- Ensure at least one auth method is present
alter table proxy_user_keys
  add constraint proxy_user_keys_has_auth
  check (api_key is not null or custom_headers is not null);
