import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Constants ──

export const EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS = 1536;

export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "in", "on", "of",
  "with", "by", "from", "at", "is", "it", "this", "that",
]);

export const EMBEDDING_TABLES = {
  skills: { table: "skill_embeddings", idColumn: "skill_id", rpc: "search_skill_embeddings", filterParam: "skill_ids" },
  files: { table: "file_embeddings", idColumn: "file_id", rpc: "search_file_embeddings", filterParam: "file_ids" },
  agents: { table: "agent_embeddings", idColumn: "agent_id", rpc: "search_agent_embeddings", filterParam: "agent_ids" },
} as const;

// ── Text utilities ──

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// ── Similarity ──

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ── Scoring helpers ──

export function keywordScore(
  queryKeywords: string[],
  entryKeywords: string[],
): number {
  if (queryKeywords.length === 0) return 0;
  const querySet = new Set(queryKeywords);
  const entrySet = new Set(entryKeywords);
  let intersection = 0;
  for (const token of querySet) {
    if (entrySet.has(token)) intersection++;
  }
  const recall = intersection / queryKeywords.length;
  const union = querySet.size + entrySet.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  return recall * 0.6 + jaccard * 0.2;
}

export function hybridScore(
  semantic: number,
  keyword: number,
  nameBonus: number,
  hasSemantic: boolean,
): number {
  return hasSemantic
    ? semantic * 0.6 + keyword * 0.3 + nameBonus
    : keyword + nameBonus;
}

// ── Query embedding (LRU cached) ──

const embeddingCache = new Map<string, { embedding: number[]; ts: number }>();
const CACHE_MAX = 100;

export async function getQueryEmbedding(query: string): Promise<number[]> {
  const cached = embeddingCache.get(query);
  if (cached) {
    cached.ts = Date.now();
    return cached.embedding;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: query,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const embedding: number[] = data.data?.[0]?.embedding ?? [];

    // Evict oldest if at capacity
    if (embeddingCache.size >= CACHE_MAX) {
      let oldestKey = "";
      let oldestTs = Infinity;
      for (const [k, v] of embeddingCache) {
        if (v.ts < oldestTs) {
          oldestTs = v.ts;
          oldestKey = k;
        }
      }
      if (oldestKey) embeddingCache.delete(oldestKey);
    }

    embeddingCache.set(query, { embedding, ts: Date.now() });
    return embedding;
  } catch {
    return [];
  }
}

// ── Batch embedding generation ──

const BATCH_SIZE = 50;

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || texts.length === 0) return [];

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "[embeddings] OpenAI error");
      return [];
    }

    const data = await res.json();
    const sorted = data.data.sort(
      (a: { index: number }, b: { index: number }) => a.index - b.index,
    );
    for (const item of sorted) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

// ── Generic upsert ──

// Per-table in-progress guards to prevent concurrent upserts
const _inProgress = new Map<string, Set<string>>();

export async function upsertEmbeddings(
  table: string,
  idColumn: string,
  items: Array<{ id: string; searchText: string; extraColumns?: Record<string, unknown> }>,
): Promise<void> {
  if (items.length === 0) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;

  // Per-table guard: skip items already being processed
  if (!_inProgress.has(table)) _inProgress.set(table, new Set());
  const guard = _inProgress.get(table)!;

  const toProcess = items.filter((item) => !guard.has(item.id));
  if (toProcess.length === 0) return;

  for (const item of toProcess) guard.add(item.id);

  try {
    // Fetch existing search_text to diff
    const ids = toProcess.map((item) => item.id);
    const { data: existing } = await supabaseAdmin
      .from(table)
      .select(`${idColumn}, search_text`)
      .in(idColumn, ids);

    const existingMap = new Map<string, string>();
    for (const row of ((existing ?? []) as unknown as Record<string, unknown>[])) {
      existingMap.set(row[idColumn] as string, row.search_text as string);
    }

    // Only embed items whose search_text has changed
    const changed = toProcess.filter((item) => {
      const existingText = existingMap.get(item.id);
      return !existingText || existingText !== item.searchText;
    });

    if (changed.length === 0) return;

    const texts = changed.map((item) => item.searchText);
    const embeddings = await generateEmbeddings(texts);
    if (embeddings.length !== texts.length) return;

    const rows = changed.map((item, j) => ({
      [idColumn]: item.id,
      search_text: item.searchText,
      embedding: `[${embeddings[j].join(",")}]`,
      model: EMBEDDING_MODEL,
      updated_at: new Date().toISOString(),
      ...item.extraColumns,
    }));

    const { error } = await supabaseAdmin
      .from(table)
      .upsert(rows, { onConflict: idColumn });

    if (error) {
      logger.warn({ table, errMessage: error.message }, "[embeddings] Upsert error");
    }
  } catch (err) {
    logger.warn({ err, table }, "[embeddings] upsertEmbeddings failed");
  } finally {
    for (const item of toProcess) guard.delete(item.id);
  }
}

// ── Generic RPC search ──

export async function searchByEmbedding(
  rpcName: string,
  queryEmbedding: number[],
  filterIds: string[],
  filterParam: string,
  limit: number = 20,
): Promise<Array<{ id: string; similarity: number }>> {
  if (filterIds.length === 0 || queryEmbedding.length === 0) return [];

  try {
    const { data, error } = await supabaseAdmin.rpc(rpcName, {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      [filterParam]: filterIds,
      match_limit: limit,
    });

    if (error) {
      logger.warn({ rpcName, errMessage: error.message }, "[embeddings] RPC search error");
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      similarity: row.similarity as number,
    }));
  } catch (err) {
    logger.warn({ err, rpcName }, "[embeddings] RPC search failed");
    return [];
  }
}
