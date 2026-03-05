-- Agent feedback submitted via MCP tool
-- Feeds coding agents to improve the platform

create table agent_feedback (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        references organizations(id) on delete set null,
  user_id         text        not null,
  api_key_id      uuid        references api_keys(id) on delete set null,
  category        text        not null check (category in (
                    'bug', 'missing_capability', 'confusing', 'integration_request', 'other'
                  )),
  severity        text        not null default 'medium' check (severity in (
                    'low', 'medium', 'high', 'critical'
                  )),
  message         text        not null,
  tool_name       text,
  context         text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index agent_feedback_org_created_idx on agent_feedback(organization_id, created_at);
create index agent_feedback_created_idx     on agent_feedback(created_at);
create index agent_feedback_category_idx    on agent_feedback(category);

alter table agent_feedback enable row level security;

-- Inserts only via supabaseAdmin (service role bypasses RLS)
create policy "service_role_only_insert" on agent_feedback
  for insert with check (false);

-- Org members can view their org's feedback
create policy "org_feedback_select" on agent_feedback
  for select using (organization_id = public.get_user_organization_id());
