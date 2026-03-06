-- Integration access scopes: restrict integrations to specific users within an org.
-- No row = everyone has access (backward compatible).
-- A row in integration_access_scopes means the integration is restricted;
-- only users in integration_scope_users (plus org admins/owners) can access it.

CREATE TABLE integration_access_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_id)
);

CREATE TABLE integration_scope_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id uuid NOT NULL REFERENCES integration_access_scopes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, user_id)
);

-- Indexes
CREATE INDEX idx_integration_access_scopes_org ON integration_access_scopes(organization_id);
CREATE INDEX idx_integration_scope_users_scope ON integration_scope_users(scope_id);
CREATE INDEX idx_integration_scope_users_user ON integration_scope_users(user_id);

-- updated_at trigger (reuse existing function)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON integration_access_scopes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE integration_access_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_scope_users ENABLE ROW LEVEL SECURITY;

-- Org members can read scopes for their own org
CREATE POLICY "org_members_select" ON integration_access_scopes
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Scope users readable by org members (via scope's org)
CREATE POLICY "org_members_select" ON integration_scope_users
  FOR SELECT USING (
    scope_id IN (
      SELECT id FROM integration_access_scopes
      WHERE organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
