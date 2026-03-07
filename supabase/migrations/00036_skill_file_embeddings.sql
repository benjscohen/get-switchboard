-- skill_embeddings
CREATE TABLE skill_embeddings (
  skill_id    UUID PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  search_text TEXT NOT NULL,
  embedding   vector(1536) NOT NULL,
  model       TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX skill_embeddings_embedding_idx ON skill_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION search_skill_embeddings(
  query_embedding vector(1536),
  skill_ids UUID[],
  match_limit INT DEFAULT 20
) RETURNS TABLE (id UUID, similarity FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT s.skill_id, 1 - (s.embedding <=> query_embedding)
  FROM skill_embeddings s
  WHERE s.skill_id = ANY(skill_ids)
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_limit;
$$;

-- file_embeddings
CREATE TABLE file_embeddings (
  file_id     UUID PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  name        TEXT NOT NULL,
  search_text TEXT NOT NULL,
  embedding   vector(1536) NOT NULL,
  model       TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX file_embeddings_embedding_idx ON file_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION search_file_embeddings(
  query_embedding vector(1536),
  file_ids UUID[],
  match_limit INT DEFAULT 20
) RETURNS TABLE (id UUID, similarity FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT f.file_id, 1 - (f.embedding <=> query_embedding)
  FROM file_embeddings f
  WHERE f.file_id = ANY(file_ids)
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_limit;
$$;
