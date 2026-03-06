-- Memory persistence: per-user key-value memory store for AI session continuity

CREATE TABLE memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, key)
);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY memories_select ON memories FOR SELECT USING (user_id = auth.uid());
CREATE POLICY memories_insert ON memories FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY memories_update ON memories FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY memories_delete ON memories FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_memories_user_org ON memories(user_id, organization_id);
CREATE INDEX idx_memories_key ON memories(user_id, key);
