import { z } from "zod";

/**
 * Converts a raw JSON Schema tool definition into a Zod object schema suitable
 * for MCP SDK tool registration.
 *
 * The MCP SDK (1.27+) expects Zod schemas — raw JSON Schema objects fail
 * validation (`safeParseAsync`) and get misclassified by overload resolution.
 * This is the entry point for proxy tool schemas (always objects).
 */
export function jsonSchemaToZodToolSchema(
  schema: Record<string, unknown>
): z.ZodObject<z.ZodRawShape> {
  const result = jsonSchemaToZod(schema);
  // Tool input schemas are always objects; if conversion somehow yields
  // a non-object, wrap in a passthrough object
  if (result instanceof z.ZodObject) {
    return result as z.ZodObject<z.ZodRawShape>;
  }
  return z.object({}).passthrough();
}

/**
 * Converts a raw JSON Schema object into a Zod schema.
 * Handles the common JSON Schema types that MCP tool definitions use.
 */
function jsonSchemaToZod(
  schema: Record<string, unknown>
): z.ZodTypeAny {
  if (!schema || typeof schema !== "object") {
    return z.unknown();
  }

  const type = schema.type as string | string[] | undefined;

  // Handle anyOf / oneOf
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const variants = (schema.anyOf ?? schema.oneOf) as Record<string, unknown>[];
    if (variants.length === 0) return z.unknown();
    if (variants.length === 1) return jsonSchemaToZod(variants[0]);
    const [first, second, ...rest] = variants.map(jsonSchemaToZod);
    return z.union([first, second, ...rest] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  // Handle enum
  if (Array.isArray(schema.enum)) {
    const values = schema.enum as [string, ...string[]];
    if (values.length === 0) return z.never();
    return z.enum(values);
  }

  // Handle const
  if ("const" in schema) {
    return z.literal(schema.const as string | number | boolean);
  }

  // Handle type arrays (e.g. ["string", "null"])
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    const hasNull = type.includes("null");
    let base: z.ZodTypeAny;
    if (nonNull.length === 1) {
      base = jsonSchemaToZod({ ...schema, type: nonNull[0] });
    } else {
      base = z.unknown();
    }
    return hasNull ? base.nullable() : base;
  }

  switch (type) {
    case "string":
      return z.string();

    case "number":
    case "integer":
      return z.number();

    case "boolean":
      return z.boolean();

    case "null":
      return z.null();

    case "array": {
      const items = schema.items as Record<string, unknown> | undefined;
      return items ? z.array(jsonSchemaToZod(items)) : z.array(z.unknown());
    }

    case "object":
    case undefined: {
      // Default to object for schemas with "properties" but no explicit type
      const properties = schema.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      const required = new Set(
        Array.isArray(schema.required) ? (schema.required as string[]) : []
      );

      if (!properties || Object.keys(properties).length === 0) {
        // No properties defined — accept any object
        return z.object({}).passthrough();
      }

      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, propSchema] of Object.entries(properties)) {
        const prop = jsonSchemaToZod(propSchema);
        shape[key] = required.has(key) ? prop : prop.optional();
      }

      const additionalProperties = schema.additionalProperties;
      const obj = z.object(shape);
      // Allow additional properties by default (MCP tools often have extra fields)
      return additionalProperties === false ? obj.strict() : obj.passthrough();
    }

    default:
      return z.unknown();
  }
}
