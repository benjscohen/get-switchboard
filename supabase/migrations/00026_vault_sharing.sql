-- Vault sharing: allow users to share secrets with individuals, teams, or the org.
-- Each row grants read-only access to a single target (exactly one of user/team/org).

create table vault_shares (
  id uuid primary key default gen_random_uuid(),
  secret_id uuid not null references vault_secrets(id) on delete cascade,
  -- Exactly one target must be set (mirrors skills scoping pattern)
  user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Enforce exactly one target
  constraint one_share_target check (
    (user_id is not null)::int +
    (team_id is not null)::int +
    (organization_id is not null)::int = 1
  ),
  -- Prevent duplicate shares
  unique nulls not distinct (secret_id, user_id),
  unique nulls not distinct (secret_id, team_id),
  unique nulls not distinct (secret_id, organization_id)
);

create index vault_shares_secret_id_idx on vault_shares(secret_id);
create index vault_shares_user_id_idx on vault_shares(user_id);
create index vault_shares_team_id_idx on vault_shares(team_id);
create index vault_shares_org_id_idx on vault_shares(organization_id);

alter table vault_shares enable row level security;

-- Owner of the secret can manage its shares
create policy "owner_manage_shares" on vault_shares
  for all using (
    exists (
      select 1 from vault_secrets
      where vault_secrets.id = vault_shares.secret_id
        and vault_secrets.user_id = auth.uid()
    )
  );

-- Recipients can see shares that target them
create policy "recipient_view_shares" on vault_shares
  for select using (
    -- Direct user share
    user_id = auth.uid()
    -- Team share (user is a member)
    or exists (
      select 1 from team_members
      where team_members.team_id = vault_shares.team_id
        and team_members.user_id = auth.uid()
    )
    -- Org share (user is in the org)
    or exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.organization_id = vault_shares.organization_id
    )
  );

-- Add SELECT policy on vault_secrets for shared access (existing owner policy handles all ops)
create policy "shared_read_vault_secrets" on vault_secrets
  for select using (
    exists (
      select 1 from vault_shares
      where vault_shares.secret_id = vault_secrets.id
        and (
          -- Direct user share
          vault_shares.user_id = auth.uid()
          -- Team share
          or exists (
            select 1 from team_members
            where team_members.team_id = vault_shares.team_id
              and team_members.user_id = auth.uid()
          )
          -- Org share
          or exists (
            select 1 from profiles
            where profiles.id = auth.uid()
              and profiles.organization_id = vault_shares.organization_id
          )
        )
    )
  );

-- Add SELECT policy on vault_secret_fields for shared access
create policy "shared_read_vault_fields" on vault_secret_fields
  for select using (
    exists (
      select 1 from vault_secrets
      join vault_shares on vault_shares.secret_id = vault_secrets.id
      where vault_secrets.id = vault_secret_fields.secret_id
        and (
          vault_shares.user_id = auth.uid()
          or exists (
            select 1 from team_members
            where team_members.team_id = vault_shares.team_id
              and team_members.user_id = auth.uid()
          )
          or exists (
            select 1 from profiles
            where profiles.id = auth.uid()
              and profiles.organization_id = vault_shares.organization_id
          )
        )
    )
  );
