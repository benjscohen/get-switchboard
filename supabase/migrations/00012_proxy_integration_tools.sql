-- Cached tool definitions for native proxy integrations (discovered from remote MCP servers)
create table proxy_integration_tools (
  id              uuid primary key default gen_random_uuid(),
  integration_id  text not null,       -- e.g. "firecrawl", "shortcut"
  tool_name       text not null,
  description     text not null default '',
  input_schema    jsonb not null default '{}',
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (integration_id, tool_name)
);

alter table proxy_integration_tools enable row level security;

-- Read-only for authenticated users (tools are public metadata)
create policy "authenticated_read" on proxy_integration_tools
  for select using (auth.uid() is not null);

create trigger proxy_integration_tools_updated_at
  before update on proxy_integration_tools
  for each row execute function update_updated_at();

-- Discovery status tracking per integration
create table proxy_integration_status (
  integration_id      text primary key,
  last_discovered_at  timestamptz,
  last_error          text,
  tool_count          integer not null default 0,
  updated_at          timestamptz not null default now()
);

alter table proxy_integration_status enable row level security;

create policy "authenticated_read" on proxy_integration_status
  for select using (auth.uid() is not null);

create trigger proxy_integration_status_updated_at
  before update on proxy_integration_status
  for each row execute function update_updated_at();
