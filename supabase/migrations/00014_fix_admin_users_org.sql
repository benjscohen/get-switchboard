-- Fix get_admin_users() to restore org columns lost in migration 00008
-- 00003 added organization_id, org_role, org_name + LEFT JOIN organizations
-- 00008 recreated the function but used the old 00001 definition, losing org columns

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
    (select count(*) from public.api_keys k where k.user_id = p.id and k.revoked_at is null),
    (select count(*) from public.connections c where c.user_id = p.id),
    (select count(*) from public.usage_logs l where l.user_id = p.id::text),
    (select max(l.created_at) from public.usage_logs l where l.user_id = p.id::text)
  from public.profiles p
  left join public.organizations o on o.id = p.organization_id
  order by p.created_at asc;
$$ language sql security definer set search_path = '';

revoke execute on function get_admin_users() from anon, authenticated;
