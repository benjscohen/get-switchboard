import { z } from "zod";

/**
 * Zod schema for parameters that accept JSON data as either a native
 * object/array (from MCP clients) or a JSON-encoded string (from manual input).
 */
export function jsonParam(description: string) {
  return z
    .union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .describe(description);
}

/** Optional variant of jsonParam */
export function jsonParamOptional(description: string) {
  return jsonParam(description).optional();
}

/**
 * Parse a value that may be a JSON string, native object/array, or nullish.
 * - string → JSON.parse()
 * - object/array → pass through
 * - nullish → undefined
 */
export function flexParse<T = unknown>(value: unknown): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    if (value === "") return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error("Invalid JSON string");
    }
  }
  if (typeof value === "object") return value as T;
  return undefined;
}
