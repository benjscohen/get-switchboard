-- Teams & Skills for org/team/user-scoped prompt distribution via MCP
-- ====================================================================

-- Teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, slug)
);

create index idx_teams_org on teams(organization_id);

alter table teams enable row level security;

create policy "org members can view their teams"
  on teams for select
  using (organization_id = (select organization_id from profiles where id = auth.uid()));

-- Team members
create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('lead', 'member')),
  joined_at timestamptz not null default now(),
  unique(team_id, user_id)
);

create index idx_team_members_team on team_members(team_id);
create index idx_team_members_user on team_members(user_id);

alter table team_members enable row level security;

create policy "org members can view team members"
  on team_members for select
  using (
    team_id in (
      select t.id from teams t
      where t.organization_id = (select organization_id from profiles where id = auth.uid())
    )
  );

-- Skills
create table skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  content text not null,
  arguments jsonb not null default '[]',
  organization_id uuid references organizations(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  enabled boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one scope must be set
  constraint skills_scope_check check (
    (organization_id is not null and team_id is null and user_id is null) or
    (organization_id is null and team_id is not null and user_id is null) or
    (organization_id is null and team_id is null and user_id is not null)
  )
);

-- Unique slug per scope
create unique index idx_skills_org_slug on skills(organization_id, slug) where organization_id is not null;
create unique index idx_skills_team_slug on skills(team_id, slug) where team_id is not null;
create unique index idx_skills_user_slug on skills(user_id, slug) where user_id is not null;

create index idx_skills_org on skills(organization_id) where organization_id is not null;
create index idx_skills_team on skills(team_id) where team_id is not null;
create index idx_skills_user on skills(user_id) where user_id is not null;

alter table skills enable row level security;

-- User can see: their own skills, their org's skills, their teams' skills
create policy "users can view their own skills"
  on skills for select
  using (user_id = auth.uid());

create policy "users can view org skills"
  on skills for select
  using (
    organization_id is not null
    and organization_id = (select organization_id from profiles where id = auth.uid())
  );

create policy "users can view team skills"
  on skills for select
  using (
    team_id is not null
    and team_id in (select tm.team_id from team_members tm where tm.user_id = auth.uid())
  );
