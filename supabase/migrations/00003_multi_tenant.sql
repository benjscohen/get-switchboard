-- Multi-tenant organizations
-- Adds organization support with domain-based auto-provisioning.

-- ── organizations ──
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  is_personal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table organizations enable row level security;

-- ── organization_domains ──
create table organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  domain text unique not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index organization_domains_org_id_idx on organization_domains(organization_id);
create index organization_domains_domain_idx on organization_domains(domain);
alter table organization_domains enable row level security;

-- ── personal_email_domains ──
create table personal_email_domains (
  domain text primary key
);
alter table personal_email_domains enable row level security;
create policy "anyone_can_read" on personal_email_domains for select using (true);

-- Seed common personal email domains
insert into personal_email_domains (domain) values
  ('gmail.com'), ('googlemail.com'),
  ('outlook.com'), ('hotmail.com'), ('live.com'), ('msn.com'),
  ('yahoo.com'), ('ymail.com'),
  ('icloud.com'), ('me.com'), ('mac.com'),
  ('aol.com'), ('protonmail.com'), ('proton.me'),
  ('zoho.com'), ('mail.com'), ('gmx.com'), ('fastmail.com'),
  ('hey.com'), ('tutanota.com'), ('pm.me');

-- ── Alter profiles ──
alter table profiles
  add column organization_id uuid references organizations(id),
  add column org_role text not null default 'member'
    check (org_role in ('owner', 'admin', 'member'));

create index profiles_organization_id_idx on profiles(organization_id);

-- ── Alter api_keys ──
alter table api_keys
  add column organization_id uuid references organizations(id);

create index api_keys_organization_id_idx on api_keys(organization_id);

-- ── Alter usage_logs ──
alter table usage_logs
  add column organization_id uuid references organizations(id);

create index usage_logs_organization_id_idx on usage_logs(organization_id);

-- ── Alter user_integration_access ──
alter table user_integration_access
  add column organization_id uuid references organizations(id);

-- ── Alter custom_mcp_servers ──
alter table custom_mcp_servers
  add column organization_id uuid references organizations(id);

create index custom_mcp_servers_organization_id_idx on custom_mcp_servers(organization_id);

-- ── Updated_at triggers for new tables ──
create trigger set_updated_at before update on organizations
  for each row execute function update_updated_at();

-- ══════════════════════════════════════════
-- Backfill: create personal orgs for existing users
-- ══════════════════════════════════════════
do $$
declare
  r record;
  new_org_id uuid;
  slug_base text;
begin
  for r in
    select id, email from public.profiles where organization_id is null
  loop
    -- Generate a slug from email prefix
    slug_base := 'personal-' || replace(split_part(r.email, '@', 1), '.', '-');
    -- Ensure uniqueness by appending a random suffix
    slug_base := slug_base || '-' || substr(gen_random_uuid()::text, 1, 8);

    insert into public.organizations (name, slug, is_personal)
    values ('Personal', slug_base, true)
    returning id into new_org_id;

    update public.profiles
    set organization_id = new_org_id, org_role = 'owner'
    where id = r.id;

    -- Backfill api_keys
    update public.api_keys
    set organization_id = new_org_id
    where user_id = r.id;

    -- Backfill usage_logs
    update public.usage_logs
    set organization_id = new_org_id
    where user_id = r.id::text;

    -- Backfill user_integration_access
    update public.user_integration_access
    set organization_id = new_org_id
    where user_id = r.id;
  end loop;
end;
$$;

-- Now make organization_id NOT NULL on api_keys (all rows have been backfilled)
alter table api_keys alter column organization_id set not null;

-- ══════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════

-- organizations: members can see their own org
create policy "org_member_select" on organizations for select
  using (
    id in (select organization_id from public.profiles where id = auth.uid())
  );

-- organization_domains: members can see domains of their org
create policy "org_member_domains_select" on organization_domains for select
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

-- profiles: members can see other profiles in their org
drop policy if exists "own_profile_select" on profiles;
create policy "org_member_profiles_select" on profiles for select
  using (
    auth.uid() = id
    or organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

-- api_keys: org members can manage keys for their org
drop policy if exists "own_api_keys" on api_keys;
create policy "org_api_keys_select" on api_keys for select
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );
create policy "org_api_keys_insert" on api_keys for insert
  with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );
create policy "org_api_keys_delete" on api_keys for delete
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

-- usage_logs: org members can see their org's logs
drop policy if exists "own_usage_logs_select" on usage_logs;
create policy "org_usage_logs_select" on usage_logs for select
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

-- custom_mcp_servers: users can see global + their org's servers
drop policy if exists "service_role_only" on custom_mcp_servers;
create policy "global_or_org_servers_select" on custom_mcp_servers for select
  using (
    organization_id is null
    or organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

-- custom_mcp_tools: follows server visibility
drop policy if exists "service_role_only" on custom_mcp_tools;
create policy "tools_follow_server_select" on custom_mcp_tools for select
  using (
    server_id in (
      select id from public.custom_mcp_servers
      where organization_id is null
        or organization_id in (select organization_id from public.profiles where id = auth.uid())
    )
  );

-- ══════════════════════════════════════════
-- Updated handle_new_user() trigger
-- ══════════════════════════════════════════
create or replace function handle_new_user()
returns trigger as $$
declare
  email_domain text;
  is_personal_domain boolean;
  matched_org_id uuid;
  new_org_id uuid;
  slug_base text;
  user_role text;
begin
  -- Extract domain from email
  email_domain := lower(split_part(new.email, '@', 2));

  -- Determine admin role
  user_role := case
    when new.email = any(string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ','))
    then 'admin' else 'user'
  end;

  -- Check if this is a personal email domain
  select exists(select 1 from public.personal_email_domains where domain = email_domain)
  into is_personal_domain;

  -- If not a personal domain, look for an org with this domain
  if not is_personal_domain then
    select organization_id into matched_org_id
    from public.organization_domains
    where domain = email_domain
    limit 1;
  end if;

  if matched_org_id is not null then
    -- Join existing org as member
    insert into public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      matched_org_id, 'member'
    );
  else
    -- Create personal org
    slug_base := 'personal-' || replace(split_part(new.email, '@', 1), '.', '-')
                 || '-' || substr(gen_random_uuid()::text, 1, 8);

    insert into public.organizations (name, slug, is_personal)
    values ('Personal', slug_base, true)
    returning id into new_org_id;

    insert into public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      new_org_id, 'owner'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';

-- ══════════════════════════════════════════
-- get_org_members function
-- ══════════════════════════════════════════
create or replace function get_org_members(p_org_id uuid)
returns table (
  id uuid, name text, email text, image text, org_role text,
  api_key_count bigint, connection_count bigint, usage_count bigint
) as $$
  select
    p.id, p.name, p.email, p.image, p.org_role,
    (select count(*) from public.api_keys k where k.user_id = p.id),
    (select count(*) from public.connections c where c.user_id = p.id),
    (select count(*) from public.usage_logs l where l.user_id = p.id::text)
  from public.profiles p
  where p.organization_id = p_org_id
  order by
    case p.org_role when 'owner' then 0 when 'admin' then 1 else 2 end,
    p.created_at asc;
$$ language sql security definer set search_path = '';

-- Revoke public access (service_role only)
revoke execute on function get_org_members(uuid) from anon, authenticated;

-- ══════════════════════════════════════════
-- Update get_admin_users to include org info
-- ══════════════════════════════════════════
drop function if exists get_admin_users();
create or replace function get_admin_users()
returns table (
  id uuid, name text, email text, image text, role text, status text,
  permissions_mode text, organization_id uuid, org_role text, org_name text,
  api_key_count bigint, connection_count bigint,
  request_count bigint, last_active timestamptz
) as $$
  select p.id, p.name, p.email, p.image, p.role, p.status, p.permissions_mode,
    p.organization_id, p.org_role,
    o.name as org_name,
    (select count(*) from public.api_keys k where k.user_id = p.id),
    (select count(*) from public.connections c where c.user_id = p.id),
    (select count(*) from public.usage_logs l where l.user_id = p.id::text),
    (select max(l.created_at) from public.usage_logs l where l.user_id = p.id::text)
  from public.profiles p
  left join public.organizations o on o.id = p.organization_id
  order by p.created_at asc;
$$ language sql security definer set search_path = '';

revoke execute on function get_admin_users() from anon, authenticated;
