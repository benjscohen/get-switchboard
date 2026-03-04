-- Generic table for org-level API keys for native proxy integrations
create table integration_org_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  integration_id  text not null,
  api_key         text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, integration_id)
);

-- RLS
alter table integration_org_keys enable row level security;

-- Org admins can read their own org's keys
create policy "org_admins_select" on integration_org_keys
  for select using (
    organization_id in (
      select organization_id from profiles
      where id = auth.uid() and org_role in ('owner', 'admin')
    )
  );

-- Org admins can insert keys for their org
create policy "org_admins_insert" on integration_org_keys
  for insert with check (
    organization_id in (
      select organization_id from profiles
      where id = auth.uid() and org_role in ('owner', 'admin')
    )
  );

-- Org admins can update their own org's keys
create policy "org_admins_update" on integration_org_keys
  for update using (
    organization_id in (
      select organization_id from profiles
      where id = auth.uid() and org_role in ('owner', 'admin')
    )
  );

-- Org admins can delete their own org's keys
create policy "org_admins_delete" on integration_org_keys
  for delete using (
    organization_id in (
      select organization_id from profiles
      where id = auth.uid() and org_role in ('owner', 'admin')
    )
  );
