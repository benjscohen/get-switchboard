-- Agents — org/team/user-scoped autonomous agent definitions + versioning
-- ========================================================================

-- Agents
create table agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  instructions text not null,
  tool_access jsonb not null default '[]',
  model text,
  organization_id uuid references organizations(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  enabled boolean not null default true,
  current_version integer not null default 1,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one scope must be set
  constraint agents_scope_check check (
    (organization_id is not null and team_id is null and user_id is null) or
    (organization_id is null and team_id is not null and user_id is null) or
    (organization_id is null and team_id is null and user_id is not null)
  )
);

-- Unique slug per scope
create unique index idx_agents_org_slug on agents(organization_id, slug) where organization_id is not null;
create unique index idx_agents_team_slug on agents(team_id, slug) where team_id is not null;
create unique index idx_agents_user_slug on agents(user_id, slug) where user_id is not null;

create index idx_agents_org on agents(organization_id) where organization_id is not null;
create index idx_agents_team on agents(team_id) where team_id is not null;
create index idx_agents_user on agents(user_id) where user_id is not null;

alter table agents enable row level security;

-- User can see: their own agents, their org's agents, their teams' agents
create policy "users can view their own agents"
  on agents for select
  using (user_id = auth.uid());

create policy "users can view org agents"
  on agents for select
  using (
    organization_id is not null
    and organization_id = (select organization_id from profiles where id = auth.uid())
  );

create policy "users can view team agents"
  on agents for select
  using (
    team_id is not null
    and team_id in (select tm.team_id from team_members tm where tm.user_id = auth.uid())
  );

-- Agent versions — complete snapshot + audit trail per version
-- ============================================================

CREATE TABLE agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version integer NOT NULL,

  -- Snapshot of agent state at this version
  name text NOT NULL,
  description text,
  instructions text NOT NULL,
  tool_access jsonb NOT NULL DEFAULT '[]',
  model text,
  enabled boolean NOT NULL,

  -- Audit fields
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'rolled_back')),
  changed_by uuid NOT NULL REFERENCES profiles(id),
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(agent_id, version)
);

CREATE INDEX idx_agent_versions_agent ON agent_versions(agent_id, version DESC);

-- RLS — mirror agents visibility through parent agent
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view versions of own agents"
  ON agent_versions FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

CREATE POLICY "view versions of org agents"
  ON agent_versions FOR SELECT
  USING (agent_id IN (
    SELECT id FROM agents
    WHERE organization_id IS NOT NULL
      AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "view versions of team agents"
  ON agent_versions FOR SELECT
  USING (agent_id IN (
    SELECT id FROM agents
    WHERE team_id IS NOT NULL
      AND team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid())
  ));
