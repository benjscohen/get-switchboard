-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Tool embeddings table for semantic search (1536 dims = text-embedding-3-large with dimensions param)
CREATE TABLE tool_embeddings (
  tool_name text PRIMARY KEY,
  description text NOT NULL,
  integration_id text NOT NULL,
  integration_name text NOT NULL,
  search_text text NOT NULL,
  embedding vector(1536) NOT NULL,
  model text NOT NULL DEFAULT 'text-embedding-3-large',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW index for cosine similarity search
CREATE INDEX tool_embeddings_embedding_idx ON tool_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX tool_embeddings_integration_idx ON tool_embeddings (integration_id);

-- RPC function for semantic search with tool name filtering
CREATE OR REPLACE FUNCTION search_tool_embeddings(
  query_embedding vector(1536),
  tool_names text[],
  match_limit int DEFAULT 20
)
RETURNS TABLE (
  tool_name text,
  description text,
  integration_id text,
  integration_name text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.tool_name,
    t.description,
    t.integration_id,
    t.integration_name,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM tool_embeddings t
  WHERE t.tool_name = ANY(tool_names)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_limit;
$$;
