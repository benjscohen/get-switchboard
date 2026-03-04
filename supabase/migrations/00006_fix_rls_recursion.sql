-- Fix infinite recursion in RLS policies
-- All org-scoped policies used subqueries on `profiles`, which triggered
-- the profiles RLS policy, which itself referenced profiles — causing
-- Postgres error 42P17 (infinite recursion) or silent query failure.
--
-- Solution: a SECURITY DEFINER function that bypasses RLS to look up
-- the current user's organization_id, then rewrite every policy to call it.

-- 1. Create helper function (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

-- 2. Fix profiles SELECT policy
DROP POLICY IF EXISTS org_member_profiles_select ON profiles;
CREATE POLICY org_member_profiles_select ON profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR organization_id = public.get_user_organization_id()
  );

-- 3. Fix organizations SELECT policy
DROP POLICY IF EXISTS org_member_select ON organizations;
CREATE POLICY org_member_select ON organizations
  FOR SELECT
  USING (id = public.get_user_organization_id());

-- 4. Fix organization_domains SELECT policy
DROP POLICY IF EXISTS org_member_domains_select ON organization_domains;
CREATE POLICY org_member_domains_select ON organization_domains
  FOR SELECT
  USING (organization_id = public.get_user_organization_id());

-- 5. Fix api_keys SELECT policy
DROP POLICY IF EXISTS org_api_keys_select ON api_keys;
CREATE POLICY org_api_keys_select ON api_keys
  FOR SELECT
  USING (organization_id = public.get_user_organization_id());

-- 6. Fix api_keys DELETE policy
DROP POLICY IF EXISTS org_api_keys_delete ON api_keys;
CREATE POLICY org_api_keys_delete ON api_keys
  FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- 7. Fix usage_logs SELECT policy
DROP POLICY IF EXISTS org_usage_logs_select ON usage_logs;
CREATE POLICY org_usage_logs_select ON usage_logs
  FOR SELECT
  USING (organization_id = public.get_user_organization_id());

-- 8. Fix custom_mcp_servers SELECT policy
DROP POLICY IF EXISTS global_or_org_servers_select ON custom_mcp_servers;
CREATE POLICY global_or_org_servers_select ON custom_mcp_servers
  FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = public.get_user_organization_id()
  );

-- 9. Fix custom_mcp_tools SELECT policy
DROP POLICY IF EXISTS tools_follow_server_select ON custom_mcp_tools;
CREATE POLICY tools_follow_server_select ON custom_mcp_tools
  FOR SELECT
  USING (
    server_id IN (
      SELECT id FROM custom_mcp_servers
      WHERE organization_id IS NULL
        OR organization_id = public.get_user_organization_id()
    )
  );
