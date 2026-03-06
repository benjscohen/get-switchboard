-- Memory versioning & audit trail
-- Each version row is a complete snapshot + audit entry (who, when, what changed)

-- 1. Add current_version tracker to memories
ALTER TABLE memories ADD COLUMN current_version integer NOT NULL DEFAULT 1;

-- 2. Create memory_versions table
CREATE TABLE memory_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  version integer NOT NULL,

  -- Snapshot of memory state at this version
  key text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',

  -- Audit fields
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'rolled_back')),
  changed_by uuid NOT NULL REFERENCES profiles(id),
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(memory_id, version)
);

CREATE INDEX idx_memory_versions_memory ON memory_versions(memory_id, version DESC);

-- 3. RLS — memories are per-user, so just check ownership through parent memory
ALTER TABLE memory_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view versions of own memories"
  ON memory_versions FOR SELECT
  USING (memory_id IN (SELECT id FROM memories WHERE user_id = auth.uid()));

-- 4. Backfill version 1 for all existing memories
INSERT INTO memory_versions (memory_id, version, key, content, metadata, change_type, changed_by)
SELECT id, 1, key, content, COALESCE(metadata, '{}'), 'created', user_id
FROM memories;
