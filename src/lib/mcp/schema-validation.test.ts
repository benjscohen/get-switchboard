import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Tests for Zod schema `.min(1)` validations on MCP tool schemas.
 *
 * These validate that empty strings are rejected at the schema level with
 * Stripe-quality error messages — before reaching any handler logic.
 *
 * We extract the schemas inline (matching what each register function passes
 * to `server.tool`) rather than importing, since register functions don't
 * export schemas directly.
 */

// ── Helpers ──

function expectMinError(schema: z.ZodType, value: unknown, messagePart: string) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes(messagePart))).toBe(true);
  }
}

function expectValid(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(true);
}

// ── file-tools schemas ──

describe("file-tools schema validation", () => {
  const pathSchema = z.string().min(1, "Required: 'path' must be a non-empty file path (e.g. '/notes.md')");
  const folderPathSchema = z.string().min(1, "Required: 'path' must be a non-empty folder path (e.g. '/projects/acme')");
  const fromSchema = z.string().min(1, "Required: 'from' must be the current file path (e.g. '/old-name.md')");
  const toSchema = z.string().min(1, "Required: 'to' must be the new file path (e.g. '/new-name.md')");
  const querySchema = z.string().min(1, "Required: 'query' must be a non-empty search term");
  const versionSchema = z.number().int("'version' must be a whole number").min(1, "'version' must be 1 or higher. Use file_history to list available versions.");

  describe("path fields", () => {
    it("rejects empty string with descriptive message", () => {
      expectMinError(pathSchema, "", "non-empty file path");
    });

    it("accepts valid path", () => {
      expectValid(pathSchema, "/notes.md");
    });
  });

  describe("folder path fields", () => {
    it("rejects empty string", () => {
      expectMinError(folderPathSchema, "", "non-empty folder path");
    });

    it("accepts valid folder path", () => {
      expectValid(folderPathSchema, "/projects/acme");
    });
  });

  describe("file_move from/to", () => {
    it("rejects empty 'from'", () => {
      expectMinError(fromSchema, "", "'from'");
    });

    it("rejects empty 'to'", () => {
      expectMinError(toSchema, "", "'to'");
    });

    it("accepts valid paths", () => {
      expectValid(fromSchema, "/old.md");
      expectValid(toSchema, "/new.md");
    });
  });

  describe("file_search query", () => {
    it("rejects empty query", () => {
      expectMinError(querySchema, "", "non-empty search term");
    });

    it("accepts valid query", () => {
      expectValid(querySchema, "hello");
    });
  });

  describe("version field", () => {
    it("rejects 0", () => {
      expectMinError(versionSchema, 0, "1 or higher");
    });

    it("rejects negative numbers", () => {
      expectMinError(versionSchema, -1, "1 or higher");
    });

    it("rejects non-integer", () => {
      expectMinError(versionSchema, 1.5, "whole number");
    });

    it("accepts positive integer", () => {
      expectValid(versionSchema, 1);
      expectValid(versionSchema, 42);
    });
  });
});

// ── memory-tools schemas ──

describe("memory-tools schema validation", () => {
  const keySchema = z.string().min(1, "Required: 'key' must be a non-empty memory identifier (e.g. 'coding-preferences' or 'project-acme/architecture')");
  const contentSchema = z.string().min(1, "Required: 'content' must be non-empty. Provide the memory content as markdown.");
  const forgetKeySchema = z.string().min(1, "Required: 'key' must be a non-empty memory identifier (e.g. 'coding-preferences'). Use recall_memories to find existing keys.");

  it("rejects empty key on save_memory", () => {
    expectMinError(keySchema, "", "non-empty memory identifier");
  });

  it("rejects empty content on save_memory", () => {
    expectMinError(contentSchema, "", "non-empty");
  });

  it("rejects empty key on forget_memory", () => {
    expectMinError(forgetKeySchema, "", "non-empty memory identifier");
  });

  it("accepts valid values", () => {
    expectValid(keySchema, "coding-preferences");
    expectValid(contentSchema, "# My Notes");
    expectValid(forgetKeySchema, "old-key");
  });
});

// ── skill-tools schema ──

describe("skill-tools schema validation", () => {
  const argNameSchema = z.string().min(1, "Each skill argument must have a non-empty 'name' (e.g. 'language', 'topic')");
  const argsArraySchema = z.array(z.object({
    name: argNameSchema,
    description: z.string(),
    required: z.boolean(),
  }));

  it("rejects empty argument name", () => {
    const result = argsArraySchema.safeParse([{ name: "", description: "test", required: true }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("non-empty 'name'"))).toBe(true);
    }
  });

  it("accepts valid argument", () => {
    expectValid(argsArraySchema, [{ name: "language", description: "Target language", required: true }]);
  });
});

// ── agent-tools schema ──

describe("agent-tools schema validation", () => {
  const toolAccessSchema = z.array(
    z.string().min(1, "Each tool_access entry must be non-empty. Use an integration ID (e.g. 'slack') or a specific tool (e.g. 'slack:slack_post_message').")
  );

  it("rejects empty string in tool_access array", () => {
    const result = toolAccessSchema.safeParse([""]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("tool_access");
    }
  });

  it("accepts valid tool_access entries", () => {
    expectValid(toolAccessSchema, ["slack", "google-calendar:google_calendar_list_events"]);
  });
});

// ── schedule-tools schemas ──

describe("schedule-tools schema validation", () => {
  const deliverySchema = z.array(z.object({
    type: z.enum(["slack_dm", "slack_channel", "file"]),
    channel_id: z.string().min(1, "'channel_id' must be non-empty when provided (e.g. 'C01234ABC'). Find channel IDs using Slack.").optional(),
    channel_name: z.string().min(1, "'channel_name' must be non-empty when provided").optional(),
    path: z.string().min(1, "'path' must be non-empty when provided (e.g. '/reports/daily.md')").optional(),
  }));

  it("rejects empty channel_id", () => {
    const result = deliverySchema.safeParse([{ type: "slack_channel", channel_id: "" }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("channel_id");
    }
  });

  it("rejects empty channel_name", () => {
    const result = deliverySchema.safeParse([{ type: "slack_channel", channel_name: "" }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("channel_name");
    }
  });

  it("rejects empty path on file delivery", () => {
    const result = deliverySchema.safeParse([{ type: "file", path: "" }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("path");
    }
  });

  it("accepts valid delivery targets", () => {
    expectValid(deliverySchema, [{ type: "slack_dm" }]);
    expectValid(deliverySchema, [{ type: "slack_channel", channel_id: "C01234ABC" }]);
    expectValid(deliverySchema, [{ type: "file", path: "/reports/daily.md" }]);
  });

  it("accepts omitted optional fields", () => {
    expectValid(deliverySchema, [{ type: "slack_channel" }]);
  });
});

// ── integration-tools schema ──

describe("integration-tools schema validation", () => {
  const messageSchema = z.string().min(1, "Required: 'message' must describe the issue or request. Be specific about what happened and what you expected.");

  it("rejects empty feedback message", () => {
    expectMinError(messageSchema, "", "'message'");
  });

  it("accepts valid message", () => {
    expectValid(messageSchema, "The Slack integration returns a 403 when posting to #general");
  });
});

// ── admin-tools schemas ──

describe("admin-tools schema validation", () => {
  const teamIdSchema = z.string().min(1, "Required: 'team_id' must be a valid UUID. Use admin_teams with action 'list' to find team IDs.");
  const userIdSchema = z.string().min(1, "Required: 'user_id' must be a valid UUID. Use admin_users with action 'list' to find user IDs.");
  const integrationIdSchema = z.string().min(1, "Each integration entry must have a non-empty 'integrationId' (e.g. 'slack', 'google-calendar')");
  const toolNameSchema = z.string().min(1, "Each tool entry must have a non-empty 'toolName'. Use action 'discover' to find available tool names.");

  it("rejects empty team_id", () => {
    expectMinError(teamIdSchema, "", "team_id");
  });

  it("rejects empty user_id", () => {
    expectMinError(userIdSchema, "", "user_id");
  });

  it("rejects empty integrationId", () => {
    expectMinError(integrationIdSchema, "", "integrationId");
  });

  it("rejects empty toolName", () => {
    expectMinError(toolNameSchema, "", "toolName");
  });

  it("accepts valid values", () => {
    expectValid(teamIdSchema, "550e8400-e29b-41d4-a716-446655440000");
    expectValid(userIdSchema, "550e8400-e29b-41d4-a716-446655440000");
    expectValid(integrationIdSchema, "slack");
    expectValid(toolNameSchema, "my_tool");
  });
});

// ── vault-tools schemas (upgraded messages) ──

describe("vault-tools schema validation", () => {
  const nameSchema = z.string().min(1, "Required: 'name' must be a non-empty secret name (e.g. 'AWS Production')");
  const fieldNameSchema = z.string().min(1, "Each field must have a non-empty 'name' (e.g. 'api_key', 'username', 'password')");
  const fieldsSchema = z.array(z.object({
    name: fieldNameSchema,
    value: z.string(),
    sensitive: z.boolean().optional(),
  })).min(1, "Required: 'fields' must contain at least one field with a name and value");

  it("rejects empty secret name", () => {
    expectMinError(nameSchema, "", "'name'");
  });

  it("rejects empty field name", () => {
    const result = fieldsSchema.safeParse([{ name: "", value: "secret123" }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("non-empty 'name'"))).toBe(true);
    }
  });

  it("rejects empty fields array", () => {
    const result = fieldsSchema.safeParse([]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("at least one field");
    }
  });

  it("accepts valid secret with fields", () => {
    expectValid(nameSchema, "AWS Production");
    expectValid(fieldsSchema, [{ name: "api_key", value: "sk-123", sensitive: true }]);
  });
});
