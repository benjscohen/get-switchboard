-- Fix: PostgreSQL UNIQUE doesn't enforce uniqueness when a column is NULL.
-- Add a partial unique index for the NULL organization_id case.
CREATE UNIQUE INDEX idx_memories_user_null_org_key
  ON memories(user_id, key)
  WHERE organization_id IS NULL;
