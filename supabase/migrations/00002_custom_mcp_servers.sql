-- Custom MCP server support
-- Adds tables for admin-managed external MCP servers, their discovered tools,
-- and per-user API keys.

-- ── custom_mcp_servers ──
create table custom_mcp_servers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  description     text not null default '',
  server_url      text not null unique,
  auth_type       text not null default 'bearer',
  shared_api_key  text,
  status          text not null default 'active',
  last_error      text,
  last_discovered_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── custom_mcp_tools ──
create table custom_mcp_tools (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references custom_mcp_servers(id) on delete cascade,
  tool_name   text not null,
  description text not null default '',
  input_schema jsonb not null default '{}',
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (server_id, tool_name)
);

-- ── custom_mcp_user_keys ──
create table custom_mcp_user_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  server_id   uuid not null references custom_mcp_servers(id) on delete cascade,
  api_key     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, server_id)
);

-- Indices
create index custom_mcp_tools_server_id_idx on custom_mcp_tools(server_id);
create index custom_mcp_user_keys_user_id_idx on custom_mcp_user_keys(user_id);
create index custom_mcp_user_keys_server_id_idx on custom_mcp_user_keys(server_id);

-- RLS
alter table custom_mcp_servers enable row level security;
alter table custom_mcp_tools enable row level security;
alter table custom_mcp_user_keys enable row level security;

-- Admin-only tables (service role bypasses RLS; no user-level access)
create policy "service_role_only" on custom_mcp_servers for all using (false);
create policy "service_role_only" on custom_mcp_tools for all using (false);

-- User keys: users can manage their own
create policy "own_custom_mcp_user_keys" on custom_mcp_user_keys
  for all using (auth.uid() = user_id);

-- Updated_at triggers
create trigger set_updated_at before update on custom_mcp_servers for each row execute function update_updated_at();
create trigger set_updated_at before update on custom_mcp_tools for each row execute function update_updated_at();
create trigger set_updated_at before update on custom_mcp_user_keys for each row execute function update_updated_at();
