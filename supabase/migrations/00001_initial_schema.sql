-- Switchboard: Supabase-native schema
-- Applied via Supabase MCP as migrations:
--   1. create_supabase_native_tables
--   2. drop_old_prisma_tables
--   3. fix_security_advisories
--
-- This file is kept as a reference. The actual migrations
-- are tracked in the Supabase dashboard.

-- ── profiles ──
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  image text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('invited', 'active', 'deactivated')),
  permissions_mode text not null default 'full' check (permissions_mode in ('full', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own_profile_select" on profiles for select using (auth.uid() = id);
create policy "own_profile_update" on profiles for update using (auth.uid() = id);

-- ── waitlist_entries ──
create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);
alter table waitlist_entries enable row level security;
create policy "service_role_only" on waitlist_entries for all using (false);

-- ── connections ──
create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  token_type text default 'Bearer',
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, integration_id)
);
create index connections_user_id_idx on connections(user_id);
alter table connections enable row level security;
create policy "own_connections" on connections for all using (auth.uid() = user_id);

-- ── api_keys ──
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text unique not null,
  key_prefix text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_user_id_idx on api_keys(user_id);
alter table api_keys enable row level security;
create policy "own_api_keys" on api_keys for all using (auth.uid() = user_id);

-- ── usage_logs ──
create table usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  api_key_id uuid references api_keys(id) on delete set null,
  tool_name text,
  integration_id text,
  status text not null check (status in ('success', 'error', 'unauthorized')),
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index usage_logs_user_created_idx on usage_logs(user_id, created_at);
create index usage_logs_api_key_created_idx on usage_logs(api_key_id, created_at);
create index usage_logs_created_idx on usage_logs(created_at);
create index usage_logs_tool_created_idx on usage_logs(tool_name, created_at);
alter table usage_logs enable row level security;
create policy "own_usage_logs_select" on usage_logs for select using (auth.uid()::text = user_id);

-- ── user_integration_access ──
create table user_integration_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id text not null,
  allowed_tools text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, integration_id)
);
create index user_integration_access_user_id_idx on user_integration_access(user_id);
alter table user_integration_access enable row level security;
create policy "own_access_select" on user_integration_access for select using (auth.uid() = user_id);

-- ── Triggers ──

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, image, role, status, permissions_mode)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    case when new.email = any(string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ','))
      then 'admin' else 'user' end,
    'active', 'full'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = '';

create trigger set_updated_at before update on profiles for each row execute function update_updated_at();
create trigger set_updated_at before update on connections for each row execute function update_updated_at();
create trigger set_updated_at before update on user_integration_access for each row execute function update_updated_at();

-- ── Admin functions ──

create or replace function get_admin_users()
returns table (
  id uuid, name text, email text, image text, role text, status text,
  permissions_mode text, api_key_count bigint, connection_count bigint,
  request_count bigint, last_active timestamptz
) as $$
  select p.id, p.name, p.email, p.image, p.role, p.status, p.permissions_mode,
    (select count(*) from public.api_keys k where k.user_id = p.id),
    (select count(*) from public.connections c where c.user_id = p.id),
    (select count(*) from public.usage_logs l where l.user_id = p.id::text),
    (select max(l.created_at) from public.usage_logs l where l.user_id = p.id::text)
  from public.profiles p order by p.created_at asc;
$$ language sql security definer set search_path = '';

create or replace function get_admin_stats(since_date timestamptz)
returns json as $$
  select json_build_object(
    'totalRequests', (select count(*) from public.usage_logs where created_at >= since_date),
    'successCount', (select count(*) from public.usage_logs where created_at >= since_date and status = 'success'),
    'errorCount', (select count(*) from public.usage_logs where created_at >= since_date and status in ('error', 'unauthorized')),
    'activeUsers', (select count(distinct user_id) from public.usage_logs where created_at >= since_date),
    'activeKeys', (select count(distinct api_key_id) from public.usage_logs where created_at >= since_date and api_key_id is not null),
    'timeSeries', coalesce((select json_agg(row_to_json(t) order by t.date) from (
      select date(created_at) as date, count(*) as count, count(*) filter (where status != 'success') as errors
      from public.usage_logs where created_at >= since_date group by date(created_at)) t), '[]'::json),
    'topTools', coalesce((select json_agg(row_to_json(t)) from (
      select tool_name as "toolName", count(*) as count from public.usage_logs
      where created_at >= since_date and tool_name is not null group by tool_name order by count desc limit 10) t), '[]'::json),
    'topUsers', coalesce((select json_agg(row_to_json(t)) from (
      select l.user_id as "userId", p.email, count(*) as count from public.usage_logs l
      left join public.profiles p on p.id::text = l.user_id where l.created_at >= since_date
      group by l.user_id, p.email order by count desc limit 10) t), '[]'::json)
  );
$$ language sql security definer set search_path = '';

create or replace function get_admin_usage_logs(
  since_date timestamptz, filter_status text default null, filter_tool text default null,
  filter_user_id text default null, page_offset integer default 0, page_limit integer default 50
) returns json as $$
  select json_build_object(
    'logs', coalesce((select json_agg(row_to_json(t)) from (
      select l.id, l.user_id, p.email as user_email, k.key_prefix as api_key_prefix,
        l.tool_name, l.integration_id, l.status, l.error_message, l.duration_ms, l.created_at
      from public.usage_logs l left join public.profiles p on p.id::text = l.user_id
      left join public.api_keys k on k.id = l.api_key_id
      where l.created_at >= since_date
        and (filter_status is null or l.status = filter_status)
        and (filter_tool is null or l.tool_name ilike '%' || filter_tool || '%')
        and (filter_user_id is null or l.user_id = filter_user_id)
      order by l.created_at desc offset page_offset limit page_limit) t), '[]'::json),
    'total', (select count(*) from public.usage_logs l where l.created_at >= since_date
      and (filter_status is null or l.status = filter_status)
      and (filter_tool is null or l.tool_name ilike '%' || filter_tool || '%')
      and (filter_user_id is null or l.user_id = filter_user_id))
  );
$$ language sql security definer set search_path = '';

-- ── Revoke public access to admin functions ──
-- Only service_role (supabaseAdmin) can call these
revoke execute on function get_admin_users() from anon, authenticated;
revoke execute on function get_admin_stats(timestamptz) from anon, authenticated;
revoke execute on function get_admin_usage_logs(timestamptz, text, text, text, integer, integer) from anon, authenticated;
