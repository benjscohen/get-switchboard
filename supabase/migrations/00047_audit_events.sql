create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  actor_id text not null,
  actor_type text not null default 'user'
    check (actor_type in ('user', 'system', 'api_key')),
  event_type text not null,
  resource_type text not null,
  resource_id text,
  description text,
  metadata jsonb default '{}',
  previous_attributes jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_audit_events_org_created on audit_events(organization_id, created_at desc);
create index idx_audit_events_event_type on audit_events(event_type, created_at desc);
create index idx_audit_events_actor on audit_events(actor_id, created_at desc);
create index idx_audit_events_created on audit_events(created_at desc);

-- RLS: org members can SELECT their org's events
alter table audit_events enable row level security;
create policy org_audit_events_select on audit_events
  for select using (
    organization_id in (
      select organization_id from profiles where id = auth.uid()
    )
  );
-- No INSERT/UPDATE/DELETE policies — writes are via supabaseAdmin only

-- RPC: org-scoped audit events with actor name join
create or replace function get_audit_events(
  p_organization_id uuid,
  p_event_type text default null,
  p_resource_type text default null,
  p_actor_id text default null,
  p_since timestamptz default null,
  p_until timestamptz default null,
  p_page_offset int default 0,
  p_page_limit int default 50
)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'events', coalesce((
      select json_agg(row_to_json(t))
      from (
        select
          ae.id,
          ae.actor_id,
          ae.actor_type,
          ae.event_type,
          ae.resource_type,
          ae.resource_id,
          ae.description,
          ae.metadata,
          ae.previous_attributes,
          ae.created_at,
          p.name as actor_name
        from audit_events ae
        left join profiles p on p.id::text = ae.actor_id
        where ae.organization_id = p_organization_id
          and (p_event_type is null or ae.event_type = p_event_type)
          and (p_resource_type is null or ae.resource_type = p_resource_type)
          and (p_actor_id is null or ae.actor_id = p_actor_id)
          and (p_since is null or ae.created_at >= p_since)
          and (p_until is null or ae.created_at <= p_until)
        order by ae.created_at desc
        limit p_page_limit
        offset p_page_offset
      ) t
    ), '[]'::json),
    'total', (
      select count(*)
      from audit_events ae
      where ae.organization_id = p_organization_id
        and (p_event_type is null or ae.event_type = p_event_type)
        and (p_resource_type is null or ae.resource_type = p_resource_type)
        and (p_actor_id is null or ae.actor_id = p_actor_id)
        and (p_since is null or ae.created_at >= p_since)
        and (p_until is null or ae.created_at <= p_until)
    )
  ) into result;
  return result;
end;
$$;

-- RPC: super-admin audit events (cross-org)
create or replace function get_admin_audit_events(
  p_organization_id uuid default null,
  p_event_type text default null,
  p_resource_type text default null,
  p_actor_id text default null,
  p_since timestamptz default null,
  p_until timestamptz default null,
  p_page_offset int default 0,
  p_page_limit int default 50
)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'events', coalesce((
      select json_agg(row_to_json(t))
      from (
        select
          ae.id,
          ae.organization_id,
          ae.actor_id,
          ae.actor_type,
          ae.event_type,
          ae.resource_type,
          ae.resource_id,
          ae.description,
          ae.metadata,
          ae.previous_attributes,
          ae.created_at,
          p.name as actor_name,
          o.name as organization_name
        from audit_events ae
        left join profiles p on p.id::text = ae.actor_id
        left join organizations o on o.id = ae.organization_id
        where (p_organization_id is null or ae.organization_id = p_organization_id)
          and (p_event_type is null or ae.event_type = p_event_type)
          and (p_resource_type is null or ae.resource_type = p_resource_type)
          and (p_actor_id is null or ae.actor_id = p_actor_id)
          and (p_since is null or ae.created_at >= p_since)
          and (p_until is null or ae.created_at <= p_until)
        order by ae.created_at desc
        limit p_page_limit
        offset p_page_offset
      ) t
    ), '[]'::json),
    'total', (
      select count(*)
      from audit_events ae
      where (p_organization_id is null or ae.organization_id = p_organization_id)
        and (p_event_type is null or ae.event_type = p_event_type)
        and (p_resource_type is null or ae.resource_type = p_resource_type)
        and (p_actor_id is null or ae.actor_id = p_actor_id)
        and (p_since is null or ae.created_at >= p_since)
        and (p_until is null or ae.created_at <= p_until)
    )
  ) into result;
  return result;
end;
$$;
