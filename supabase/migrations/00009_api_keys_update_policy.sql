-- Add UPDATE RLS policy for api_keys
-- The soft-delete change (00008) switched DELETE to .update({ revoked_at }),
-- but no UPDATE policy existed, causing silent failures.

CREATE POLICY org_api_keys_update ON api_keys
  FOR UPDATE
  USING (organization_id = public.get_user_organization_id());
