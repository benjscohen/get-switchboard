-- Secret entries (metadata only — values live in vault_secret_fields)
create table vault_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'other'
    check (category in ('api_key', 'credential', 'payment', 'note', 'other')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index vault_secrets_user_id_idx on vault_secrets(user_id);
create index vault_secrets_user_category_idx on vault_secrets(user_id, category);

alter table vault_secrets enable row level security;
create policy "own_vault_secrets" on vault_secrets
  for all using (auth.uid() = user_id);

-- Individual encrypted fields within a secret
create table vault_secret_fields (
  id uuid primary key default gen_random_uuid(),
  secret_id uuid not null references vault_secrets(id) on delete cascade,
  field_name text not null,
  encrypted_value text not null,
  sensitive boolean not null default true,
  sort_order integer not null default 0,
  unique (secret_id, field_name)
);

create index vault_secret_fields_secret_id_idx on vault_secret_fields(secret_id);

alter table vault_secret_fields enable row level security;
create policy "own_vault_fields" on vault_secret_fields
  for all using (
    exists (
      select 1 from vault_secrets
      where vault_secrets.id = vault_secret_fields.secret_id
        and vault_secrets.user_id = auth.uid()
    )
  );
