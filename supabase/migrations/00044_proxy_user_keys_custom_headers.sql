-- Add custom_headers column for proxy integrations that use multi-header auth (e.g. Datadog)

-- proxy_user_keys (per-user keys)
alter table proxy_user_keys
  add column custom_headers jsonb;

alter table proxy_user_keys
  alter column api_key drop not null;

alter table proxy_user_keys
  add constraint proxy_user_keys_has_auth
  check (api_key is not null or custom_headers is not null);

-- integration_org_keys (org-level keys)
alter table integration_org_keys
  add column custom_headers jsonb;

alter table integration_org_keys
  alter column api_key drop not null;

alter table integration_org_keys
  add constraint integration_org_keys_has_auth
  check (api_key is not null or custom_headers is not null);
