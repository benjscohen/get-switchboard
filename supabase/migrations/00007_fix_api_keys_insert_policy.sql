-- Fix api_keys INSERT policy (missed in 00006_fix_rls_recursion)
-- The INSERT policy from 00003 still uses a recursive subquery on profiles,
-- causing silent RLS failures. Switch to get_user_organization_id() like the
-- SELECT and DELETE policies.

DROP POLICY IF EXISTS org_api_keys_insert ON api_keys;
CREATE POLICY org_api_keys_insert ON api_keys
  FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());
