-- Virtual File System: replaces flat memories with nested files + folders
-- Single table design: files and folders coexist (is_folder distinguishes them)
-- Materialized path for fast directory listing without recursive CTEs

-- 1. Create files table
CREATE TABLE files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  path            TEXT NOT NULL,
  name            TEXT NOT NULL,
  parent_path     TEXT NOT NULL DEFAULT '/',
  is_folder       BOOLEAN NOT NULL DEFAULT false,
  content         TEXT,
  mime_type       TEXT DEFAULT 'text/plain',
  metadata        JSONB DEFAULT '{}',
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique path per user+org (with NULL org handling)
CREATE UNIQUE INDEX idx_files_user_org_path
  ON files(user_id, organization_id, path)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX idx_files_user_null_org_path
  ON files(user_id, path)
  WHERE organization_id IS NULL;

-- Directory listing index
CREATE INDEX idx_files_parent ON files(user_id, organization_id, parent_path);

-- Full-text search on content
CREATE INDEX idx_files_content_fts ON files USING GIN (to_tsvector('english', coalesce(content, '')));

-- Name search
CREATE INDEX idx_files_name ON files(user_id, name);

-- RLS
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY files_select ON files FOR SELECT USING (user_id = auth.uid());
CREATE POLICY files_insert ON files FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY files_update ON files FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY files_delete ON files FOR DELETE USING (user_id = auth.uid());

-- 2. Create file_versions table
CREATE TABLE file_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id        UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  path           TEXT NOT NULL,
  name           TEXT NOT NULL,
  content        TEXT,
  metadata       JSONB DEFAULT '{}',
  change_type    TEXT NOT NULL CHECK (change_type IN ('created','updated','moved','rolled_back')),
  changed_by     UUID NOT NULL REFERENCES profiles(id),
  change_summary TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(file_id, version)
);

CREATE INDEX idx_file_versions_file ON file_versions(file_id, version DESC);

ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view versions of own files"
  ON file_versions FOR SELECT
  USING (file_id IN (SELECT id FROM files WHERE user_id = auth.uid()));

-- 3. Migrate data from memories to files
-- Preserve UUIDs so existing references still work
INSERT INTO files (id, user_id, organization_id, path, name, parent_path, is_folder, content, metadata, current_version, created_at, updated_at)
SELECT
  id,
  user_id,
  organization_id,
  '/' || key,
  key,
  '/',
  false,
  content,
  COALESCE(metadata, '{}'),
  current_version,
  created_at,
  updated_at
FROM memories;

-- Migrate version history
INSERT INTO file_versions (id, file_id, version, path, name, content, metadata, change_type, changed_by, change_summary, created_at)
SELECT
  mv.id,
  mv.memory_id,
  mv.version,
  '/' || mv.key,
  mv.key,
  mv.content,
  COALESCE(mv.metadata, '{}'),
  mv.change_type,
  mv.changed_by,
  mv.change_summary,
  mv.created_at
FROM memory_versions mv;
