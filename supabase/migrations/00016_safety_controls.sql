-- Add read_only to permissions_mode
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_permissions_mode_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_permissions_mode_check
  CHECK (permissions_mode IN ('full', 'custom', 'read_only'));

-- Add risk_level column to usage_logs (for audit trail - Phase 5)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS risk_level text;

-- Add scope column to api_keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'full';
ALTER TABLE api_keys ADD CONSTRAINT api_keys_scope_check
  CHECK (scope IN ('full', 'read_write', 'read_only'));

-- Update get_admin_stats to include destructiveCount
CREATE OR REPLACE FUNCTION get_admin_stats(since_date timestamptz)
RETURNS json AS $$
  select json_build_object(
    'totalRequests', (select count(*) from public.usage_logs where created_at >= since_date),
    'successCount', (select count(*) from public.usage_logs where created_at >= since_date and status = 'success'),
    'errorCount', (select count(*) from public.usage_logs where created_at >= since_date and status in ('error', 'unauthorized')),
    'destructiveCount', (select count(*) from public.usage_logs where created_at >= since_date and risk_level = 'destructive'),
    'activeUsers', (select count(distinct user_id) from public.usage_logs where created_at >= since_date),
    'activeKeys', (select count(distinct api_key_id) from public.usage_logs where created_at >= since_date and api_key_id is not null),
    'timeSeries', coalesce((select json_agg(row_to_json(t) order by t.date) from (
      select date(created_at) as date, count(*) as count, count(*) filter (where status != 'success') as errors
      from public.usage_logs where created_at >= since_date group by date(created_at)) t), '[]'::json),
    'topTools', coalesce((select json_agg(row_to_json(t)) from (
      select tool_name as "toolName", count(*) as count from public.usage_logs
      where created_at >= since_date and tool_name is not null group by tool_name order by count desc limit 10) t), '[]'::json),
    'topUsers', coalesce((select json_agg(row_to_json(t)) from (
      select l.user_id as "userId", p.email, count(*) as count from public.usage_logs l
      left join public.profiles p on p.id::text = l.user_id where l.created_at >= since_date
      group by l.user_id, p.email order by count desc limit 10) t), '[]'::json)
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

-- Must DROP then CREATE get_admin_usage_logs because signature changes (new parameter)
DROP FUNCTION IF EXISTS get_admin_usage_logs(timestamptz, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION get_admin_usage_logs(
  since_date timestamptz, filter_status text default null, filter_tool text default null,
  filter_user_id text default null, page_offset integer default 0, page_limit integer default 50,
  filter_risk_level text default null
) RETURNS json AS $$
  select json_build_object(
    'logs', coalesce((select json_agg(row_to_json(t)) from (
      select l.id, l.user_id, p.email as user_email, k.key_prefix as api_key_prefix,
        l.tool_name, l.integration_id, l.status, l.error_message, l.duration_ms, l.risk_level, l.created_at
      from public.usage_logs l left join public.profiles p on p.id::text = l.user_id
      left join public.api_keys k on k.id = l.api_key_id
      where l.created_at >= since_date
        and (filter_status is null or l.status = filter_status)
        and (filter_tool is null or l.tool_name ilike '%' || filter_tool || '%')
        and (filter_user_id is null or l.user_id = filter_user_id)
        and (filter_risk_level is null or l.risk_level = filter_risk_level)
      order by l.created_at desc offset page_offset limit page_limit) t), '[]'::json),
    'total', (select count(*) from public.usage_logs l where l.created_at >= since_date
      and (filter_status is null or l.status = filter_status)
      and (filter_tool is null or l.tool_name ilike '%' || filter_tool || '%')
      and (filter_user_id is null or l.user_id = filter_user_id)
      and (filter_risk_level is null or l.risk_level = filter_risk_level))
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

-- Revoke public access
REVOKE EXECUTE ON FUNCTION get_admin_stats(timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_admin_usage_logs(timestamptz, text, text, text, integer, integer, text) FROM anon, authenticated;
