import { z } from "zod";

/**
 * Convert a Zod schema (from _registeredTools) to standard JSON Schema.
 * Falls through to the original value if it's not a Zod schema.
 */
export function zodToJsonSchema(schema: unknown): unknown {
  if (schema && typeof (schema as z.ZodTypeAny).safeParseAsync === "function") {
    try {
      return z.toJSONSchema(schema as z.ZodTypeAny);
    } catch {
      return schema;
    }
  }
  return schema;
}
