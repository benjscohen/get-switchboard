-- Add revoked_at column for soft-delete of API keys
alter table api_keys add column revoked_at timestamptz;

-- Update get_admin_users to exclude revoked keys from count
drop function if exists get_admin_users();
create or replace function get_admin_users()
returns table (
  id uuid, name text, email text, image text, role text, status text,
  permissions_mode text, api_key_count bigint, connection_count bigint,
  request_count bigint, last_active timestamptz
) as $$
  select p.id, p.name, p.email, p.image, p.role, p.status, p.permissions_mode,
    (select count(*) from public.api_keys k where k.user_id = p.id and k.revoked_at is null),
    (select count(*) from public.connections c where c.user_id = p.id),
    (select count(*) from public.usage_logs l where l.user_id = p.id::text),
    (select max(l.created_at) from public.usage_logs l where l.user_id = p.id::text)
  from public.profiles p order by p.created_at asc;
$$ language sql security definer set search_path = '';
