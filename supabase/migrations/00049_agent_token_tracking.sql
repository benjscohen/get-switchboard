-- Track token usage per agent session
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0;

-- Index for efficient org-scoped dashboard queries
CREATE INDEX IF NOT EXISTS agent_sessions_org_created_idx
  ON agent_sessions (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RPC: Agent usage stats for admin dashboard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_agent_usage_stats(
  since_date timestamptz,
  p_organization_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    -- Summary stats
    'totalSessions', (
      SELECT count(*) FROM public.agent_sessions
      WHERE created_at >= since_date
        AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ),
    'completedSessions', (
      SELECT count(*) FROM public.agent_sessions
      WHERE created_at >= since_date
        AND status = 'completed'
        AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ),
    'failedSessions', (
      SELECT count(*) FROM public.agent_sessions
      WHERE created_at >= since_date
        AND status IN ('failed', 'timeout')
        AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ),
    'activeSessions', (
      SELECT count(*) FROM public.agent_sessions
      WHERE status IN ('running', 'idle', 'pending')
        AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ),
    'totalMessages', (
      SELECT count(*) FROM public.agent_messages m
      JOIN public.agent_sessions s ON s.id = m.session_id
      WHERE s.created_at >= since_date
        AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
    ),
    'totalInputTokens', (
      SELECT coalesce(sum(input_tokens), 0) FROM public.agent_sessions
      WHERE created_at >= since_date
        AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ),
    'totalOutputTokens', (
      SELECT coalesce(sum(output_tokens), 0) FROM public.agent_sessions
      WHERE created_at >= since_date
        AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ),
    'uniqueUsers', (
      SELECT count(DISTINCT user_id) FROM public.agent_sessions
      WHERE created_at >= since_date
        AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ),

    -- Sessions over time (daily)
    'sessionsOverTime', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.date)
      FROM (
        SELECT
          date(created_at) AS date,
          count(*) AS total,
          count(*) FILTER (WHERE status = 'completed') AS completed,
          count(*) FILTER (WHERE status IN ('failed', 'timeout')) AS failed
        FROM public.agent_sessions
        WHERE created_at >= since_date
          AND (p_organization_id IS NULL OR organization_id = p_organization_id)
        GROUP BY date(created_at)
      ) t
    ), '[]'::json),

    -- Messages over time (daily, by role)
    'messagesOverTime', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.date)
      FROM (
        SELECT
          date(m.created_at) AS date,
          count(*) FILTER (WHERE m.role = 'user') AS user_msgs,
          count(*) FILTER (WHERE m.role = 'assistant') AS assistant_msgs,
          count(*) FILTER (WHERE m.role = 'tool') AS tool_msgs
        FROM public.agent_messages m
        JOIN public.agent_sessions s ON s.id = m.session_id
        WHERE s.created_at >= since_date
          AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
        GROUP BY date(m.created_at)
      ) t
    ), '[]'::json),

    -- Per-user breakdown
    'userBreakdown', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT
          s.user_id AS "userId",
          p.name AS "userName",
          p.email AS "userEmail",
          count(*) AS "sessionCount",
          count(*) FILTER (WHERE s.status = 'completed') AS "completedCount",
          count(*) FILTER (WHERE s.status IN ('failed', 'timeout')) AS "failedCount",
          coalesce(sum(s.input_tokens), 0) AS "inputTokens",
          coalesce(sum(s.output_tokens), 0) AS "outputTokens",
          (SELECT count(*) FROM public.agent_messages m2
           JOIN public.agent_sessions s2 ON s2.id = m2.session_id
           WHERE s2.user_id = s.user_id
             AND s2.created_at >= since_date
             AND (p_organization_id IS NULL OR s2.organization_id = p_organization_id)
          ) AS "messageCount",
          max(s.created_at) AS "lastActive"
        FROM public.agent_sessions s
        LEFT JOIN public.profiles p ON p.id = s.user_id
        WHERE s.created_at >= since_date
          AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
        GROUP BY s.user_id, p.name, p.email
        ORDER BY count(*) DESC
        LIMIT 50
      ) t
    ), '[]'::json),

    -- Sessions by model
    'sessionsByModel', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT
          coalesce(model, 'unknown') AS model,
          count(*) AS count
        FROM public.agent_sessions
        WHERE created_at >= since_date
          AND (p_organization_id IS NULL OR organization_id = p_organization_id)
        GROUP BY model
        ORDER BY count(*) DESC
      ) t
    ), '[]'::json),

    -- Currently active sessions (no date filter)
    'activeSessionsList', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT
          s.id,
          s.user_id AS "userId",
          p.name AS "userName",
          p.email AS "userEmail",
          s.status,
          s.model,
          s.prompt,
          s.total_turns AS "totalTurns",
          s.created_at AS "createdAt",
          s.updated_at AS "updatedAt"
        FROM public.agent_sessions s
        LEFT JOIN public.profiles p ON p.id = s.user_id
        WHERE s.status IN ('running', 'idle', 'pending')
          AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
        ORDER BY s.created_at DESC
        LIMIT 25
      ) t
    ), '[]'::json)

  ) INTO result;

  RETURN result;
END;
$$;

-- Only service_role can call this
REVOKE EXECUTE ON FUNCTION get_agent_usage_stats(timestamptz, uuid) FROM anon, authenticated;
