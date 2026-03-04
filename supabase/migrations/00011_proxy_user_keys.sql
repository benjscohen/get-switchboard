-- Per-user API keys for native proxy integrations (per_user keyMode)
create table proxy_user_keys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  integration_id  text not null,
  api_key         text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, integration_id)
);

-- RLS: users manage their own keys
alter table proxy_user_keys enable row level security;

create policy "users_select_own" on proxy_user_keys
  for select using (user_id = auth.uid());

create policy "users_insert_own" on proxy_user_keys
  for insert with check (user_id = auth.uid());

create policy "users_update_own" on proxy_user_keys
  for update using (user_id = auth.uid());

create policy "users_delete_own" on proxy_user_keys
  for delete using (user_id = auth.uid());

-- Reuse existing update_updated_at trigger function
create trigger proxy_user_keys_updated_at
  before update on proxy_user_keys
  for each row execute function update_updated_at();
