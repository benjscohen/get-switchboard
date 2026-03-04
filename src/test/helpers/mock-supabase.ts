import { vi } from "vitest";

/**
 * Creates a chainable mock that mimics the Supabase query builder pattern.
 * Each method returns `this` so calls can be chained, and the final
 * result is controlled via the resolvedValue parameter.
 */
export function createChainMock(resolvedValue: unknown = { data: null, error: null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  const methods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "in", "gte", "lte", "ilike",
    "order", "limit", "range",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(resolvedValue));
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolvedValue));
  // Make chainable results thenable
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return chain;
}

/**
 * Creates a mock Supabase client with `.from()` and `.rpc()` stubs.
 */
export function createMockSupabaseClient() {
  return {
    from: vi.fn(() => createChainMock()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: null }, error: null })
      ),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  };
}
