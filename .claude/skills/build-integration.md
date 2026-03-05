# Build MCP Integration

Skill for building new MCP server integrations in the Switchboard platform.

## Trigger

Activate when the user says: "build integration", "add integration", "new MCP server", "add {provider} tools", "build a {provider} integration", or similar.

## Prerequisites — Confirm Before Starting

1. **Provider name** — e.g. "Notion", "Slack", "Linear"
2. **API docs or SDK** — official REST API docs, or a typed SDK package on npm
3. **OAuth details** — authorization URL, token URL, required scopes
4. **Which tools to build** — specific actions, or "all CRUD operations"

If any of these are missing, ask the user before proceeding. Use web search to find OAuth endpoints and scopes if the user doesn't provide them.

---

## Architecture Overview

Every builtin integration follows a strict 4-file structure:

```
src/lib/integrations/{provider}-{service}/
├── schemas.ts          # Zod input schemas for every tool
├── tools.ts            # Tool definitions with typed execute functions
├── index.tsx           # Icon, OAuth config, client factory, export
└── schemas.test.ts     # Schema validation tests
```

Plus registration in:
- `src/lib/integrations/registry.ts` — add to the `integrations` array
- `src/lib/integrations/registry.test.ts` — update the length assertion

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Directory | `{provider}-{service}` (kebab-case) | `notion-pages`, `slack-messages` |
| Integration ID | Same as directory | `"notion-pages"` |
| Tool names | `{provider}_{service}_{action}` | `notion_pages_create` |
| Export name | `camelCase` + `Integration` | `notionPagesIntegration` |
| Tool array | `SCREAMING_SNAKE` + `_TOOLS` | `NOTION_TOOLS` |
| Type alias | `XToolDef` | `NotionToolDef` |

---

## Step 1: `schemas.ts`

Define Zod schemas for every tool's input parameters.

### Pattern

```typescript
import { z } from "zod";

// ── Shared fragments ──

export const pageId = z
  .string()
  .describe("The Notion page ID (UUID from the URL)");

export const databaseId = z
  .string()
  .describe("The Notion database ID (UUID from the URL)");

// ── Category Name (count) ──

export const getPageSchema = z.object({
  pageId,
});

export const searchSchema = z.object({
  query: z.string().describe("Search query text"),
  filter: z
    .enum(["page", "database"])
    .optional()
    .describe("Limit results to pages or databases"),
  pageSize: z
    .number()
    .int()
    .optional()
    .describe("Results per page (max 100, default 10)"),
});
```

### Rules

1. **Shared fragments at top** — extract any field used by 2+ schemas into a `const` with `.describe()`
2. **Group by category** with `// ── Category Name (count) ──` divider comments
3. **Every field gets `.describe()`** — include format examples for non-obvious values (e.g. `"UUID from the URL"`, `'A1 notation (e.g. "Sheet1!A1:C10")'`)
4. **Use `z.enum()`** for constrained string values — never use bare `.string()` when the set is known
5. **Use `.optional()`** for optional fields — never make a field required if the API doesn't require it
6. **Zod v4 gotcha**: `z.record()` needs 2 args: `z.record(z.string(), z.unknown())`
7. **Shared composition objects** for groups of related fields (see Gmail's `compositionFields` pattern):
   ```typescript
   export const compositionFields = {
     to: z.string().describe("Recipient email(s), comma-separated"),
     subject: z.string().describe("Subject line"),
     body: z.string().describe("Body content"),
   };

   export const sendSchema = z.object({
     ...compositionFields,
     replyTo: z.string().optional().describe("Reply-To address"),
   });
   ```

---

## Step 2: `tools.ts`

Define tool implementations with typed clients.

### Pattern

```typescript
import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";

// Narrow the client type for this integration
type NotionToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: NotionClient  // The typed client from createClient()
  ) => Promise<unknown>;
};

// ── Helpers ──

/** Parse comma-separated string into array */
function parseList(csv: string): string[] {
  return csv.split(",").map((s) => s.trim());
}

export const NOTION_TOOLS: NotionToolDef[] = [
  // ── Category (count) ──
  {
    name: "notion_pages_get",
    description: "Get a Notion page by ID with its properties and content",
    schema: s.getPageSchema,
    execute: async (a, client) => {
      const page = await client.pages.retrieve({
        page_id: a.pageId as string,
      });
      return {
        id: page.id,
        // ... clean, structured return — NOT raw API dump
      };
    },
  },
];
```

### Rules

1. **Type the tool def** — create a `XToolDef` type that narrows `client: unknown` to your typed client
2. **Helper functions at top** — parsing, formatting, conversions
3. **Category comments** match schemas: `// ── Category (count) ──`
4. **Cast args** — `a.fieldName as string`, `a.fieldName as number`, etc.
5. **Clean return objects** — never dump raw API responses. Pick the fields that matter.
6. **`switch/case` for multi-action tools** with `default: throw new Error(\`Unknown operation: ${op}\`)`. The discriminator field MUST be named `operation` (not `action`). This is consistent across all integrations (Sheets, Docs, Gmail).
7. **No error handling in tools** — the MCP handler catches all errors and returns safe messages. Tools should throw on failure.
8. **No token refresh in tools** — `getValidTokens()` handles this before `execute()` is called.

---

## Step 3: `index.tsx`

Wire up the icon, OAuth config, client factory, and export.

### Pattern

```tsx
import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { NOTION_TOOLS } from "./tools";

function NotionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      {/* Provider's brand icon paths */}
    </svg>
  );
}

// Map typed tools → generic IntegrationToolDef[]
const tools: IntegrationToolDef[] = NOTION_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as NotionClient),
}));

export const notionPagesIntegration: IntegrationConfig = {
  id: "notion-pages",
  name: "Notion",
  description: "Create, read, update, and search Notion pages and databases",
  icon: NotionIcon,
  oauth: {
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientIdEnvVar: "NOTION_CLIENT_ID",       // env var NAME, not value
    clientSecretEnvVar: "NOTION_CLIENT_SECRET",
    scopes: [],  // Notion uses integration capabilities, not scopes
    extraAuthParams: {},
  },
  createClient(tokens) {
    // Return the typed client that tools.ts expects
    return new Client({ auth: tokens.accessToken });
  },
  tools,
  toolCount: tools.length,
};
```

### Rules

1. **SVG icon**: 18x18 viewBox, `className="shrink-0"` on the `<svg>` element
2. **Tool mapping**: `.map()` over the typed tools array, cast `client as TypedClient` in the execute wrapper
3. **OAuth config**: use env var *names* (not values) for `clientIdEnvVar` / `clientSecretEnvVar`
4. **`extraAuthParams`**: include `{ access_type: "offline", prompt: "consent" }` for Google integrations to get refresh tokens. Other providers may need different params.
5. **`createClient`**: receives per-user `{ accessToken, refreshToken? }` — build the typed API client from these tokens
6. **Export**: `camelCase` name + `Integration` suffix, typed as `IntegrationConfig`

### Google Integration Specifics

All Google integrations share these OAuth details:
```typescript
oauth: {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  clientIdEnvVar: "AUTH_GOOGLE_ID",
  clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
  scopes: ["https://www.googleapis.com/auth/..."],
  extraAuthParams: { access_type: "offline", prompt: "consent" },
},
createClient(tokens) {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );
  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  return google.serviceName({ version: "v1", auth: oauth2 });
},
```

---

## Step 4: `schemas.test.ts`

Test every schema for valid and invalid inputs.

### Pattern

```typescript
import {
  pageId,
  getPageSchema,
  searchSchema,
  // ... all schemas
} from "./schemas";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("pageId requires a string", () => {
    expect(() => pageId.parse(undefined)).toThrow();
    expect(pageId.parse("abc-123")).toBe("abc-123");
  });
});

// ── Category Name ──

describe("category schemas", () => {
  describe("getPageSchema", () => {
    it("requires pageId", () => {
      expect(() => getPageSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = getPageSchema.parse({ pageId: "abc-123" });
      expect(result.pageId).toBe("abc-123");
    });
  });

  describe("searchSchema", () => {
    it("requires query", () => {
      expect(() => searchSchema.parse({})).toThrow();
    });

    // Test enum values with it.each()
    it.each(["page", "database"] as const)(
      "accepts filter '%s'",
      (filter) => {
        const result = searchSchema.parse({ query: "test", filter });
        expect(result.filter).toBe(filter);
      }
    );

    it("rejects invalid filter", () => {
      expect(() =>
        searchSchema.parse({ query: "test", filter: "invalid" })
      ).toThrow();
    });
  });
});

// ── Cross-cutting: all schemas reject {} ──

describe("all schemas reject empty object", () => {
  it.each([
    ["getPageSchema", getPageSchema],
    ["searchSchema", searchSchema],
    // ... every schema with required fields
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
```

### Rules

1. **Test every schema**: valid input, invalid input (missing required fields)
2. **Test every `z.enum()`**: use `it.each()` for valid values, one test for an invalid value
3. **Cross-cutting `rejects {}` test** at the bottom — proves every schema with required fields rejects an empty object
4. **No mocks needed** — schemas are pure Zod validation
5. **Run with**: `npx vitest run src/lib/integrations/{name}/`

---

## Step 5: Register in Tool Search

Add the new integration to the search maps in `src/lib/mcp/tool-search.ts` so `discover_tools` can find it via synonyms and category filters.

### `CATEGORY_MAP`

Maps `integrationId` → category. Add your integration here:

```typescript
export const CATEGORY_MAP: Record<string, string> = {
  // ... existing entries
  "notion-pages": "documents",  // ← use an existing category if it fits
};
```

If no existing category fits, create a new one (e.g. `"design"`, `"analytics"`).

### `CATEGORY_SYNONYMS`

Maps category → alternative search terms. If you used an existing category, synonyms are already inherited. If you created a **new category**, add an entry:

```typescript
export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  // ... existing entries
  design: ["UI", "mockups", "wireframes", "prototyping"],  // ← new category
};
```

Think about what a user might type when looking for this integration — short words like "chat", "todo", "CRM" are the most important since they rely on synonyms to match.

---

## Step 6: Register the Integration

### `src/lib/integrations/registry.ts`

```typescript
import { notionPagesIntegration } from "./notion-pages";

const integrations: IntegrationConfig[] = [
  googleCalendarIntegration,
  googleDocsIntegration,
  googleGmailIntegration,
  googleSheetsIntegration,
  notionPagesIntegration,  // ← add here
];
```

### `src/lib/integrations/registry.test.ts`

Update the length assertion:
```typescript
it("has length 5", () => {  // was 4
  expect(allIntegrations).toHaveLength(5);
});

it("is an array containing notion-pages", () => {
  expect(allIntegrations.some((i) => i.id === "notion-pages")).toBe(true);
});
```

---

## Step 7: Environment Variables

Document the required env vars for the new integration:

- **Google integrations**: share `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (already configured)
- **Other OAuth providers**: need `{PROVIDER}_CLIENT_ID` and `{PROVIDER}_CLIENT_SECRET`

Tell the user which env vars to add to `.env.local` and Vercel.

---

## Auth Strategy: Always Prefer Per-User OAuth

This is a **core architectural principle**. Every builtin integration MUST use per-user OAuth.

### Why Per-User OAuth

- **RLS policies** scope data access per user via `connections.user_id`
- **`user_integration_access`** controls which tools each user can use
- **Token refresh** happens per-user (no shared token bottleneck)
- **Usage logs** track the actual user who made each tool call
- **Revoking access** for one user doesn't affect others
- **The `connections` table** enforces `UNIQUE(user_id, integration_id)` — one token set per user per integration

### When to Use OAuth

**Always**, if the provider supports it. Even if a provider offers both API keys and OAuth, choose OAuth.

### The `extraAuthParams` Pattern

For long-lived access, always request offline/refresh tokens:
```typescript
extraAuthParams: { access_type: "offline", prompt: "consent" }
```
Other providers may use different params (e.g., Notion doesn't need this). Check the provider's OAuth docs.

### When Shared Keys Are Acceptable

Only for providers with **no OAuth flow** (e.g., internal APIs, webhook-only services). These use the **custom MCP proxy** pattern (`custom_mcp_servers` / `custom_mcp_tools` tables), NOT the builtin integration pattern described in this skill.

### Anti-Patterns — DO NOT

- Use a single service account token shared across all users
- Store API keys in env vars and share them for all requests
- Skip OAuth when the provider supports it
- Use `supabaseAdmin` to read another user's connections
- Build a client from env vars instead of per-user tokens

---

## Non-Google / Non-SDK Provider Pattern

For providers without a typed SDK (direct REST API calls with per-user OAuth):

### Client Type

Define a lightweight client type in `tools.ts`:

```typescript
type ApiClient = {
  baseUrl: string;
  headers: Record<string, string>;
};

type ProviderToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: ApiClient
  ) => Promise<unknown>;
};
```

### Client Factory in `index.tsx`

```typescript
createClient(tokens) {
  return {
    baseUrl: "https://api.provider.com/v1",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
    },
  };
},
```

### Tool Execute

```typescript
execute: async (a, client) => {
  const res = await fetch(`${client.baseUrl}/pages/${a.pageId}`, {
    headers: client.headers,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return { id: data.id, title: data.title };  // Clean return
},
```

Same 4-file structure, same registration, same tests. The only difference is `createClient` returns a simple object instead of an SDK instance.

---

## Design Philosophy (Stripe Principles)

Apply these principles throughout:

1. **Predictable** — tool names follow `{provider}_{service}_{action}`, schemas use consistent field names
2. **Consistent** — every integration has the same file structure, same export shape, same test patterns
3. **Self-documenting** — every Zod field has `.describe()` with format hints and examples
4. **DRY** — shared fragments at the top of schemas, helper functions at the top of tools
5. **Composable** — multi-action tools use `switch/case` on an `operation` enum, not separate tools per action
6. **Consolidated** — CRUD-like platform tools use a single tool with an `operation` enum discriminator (e.g. `manage_skills` with `operation: "list" | "get" | "create" | "update" | "delete"`) instead of registering 5 separate tools. This keeps the tool list compact and matches the multi-action pattern used by integrations. Use optional fields for operation-specific parameters.
7. **Defensive** — clean return objects (no raw API dumps), safe error messages (no leaked internals)
8. **Progressive disclosure** — required fields first, optional fields last, sensible defaults
9. **LLM-optimized** — prefer formats LLMs generate naturally (hex colors, named positions) over raw API formats (RGB objects, raw indices)

---

## Completion Checklist

Before declaring the integration complete, verify every item:

### Schemas
- [ ] Every tool has a schema in `schemas.ts`
- [ ] Every field has `.describe()` with format hints
- [ ] Shared fragments extracted for fields used in 2+ schemas
- [ ] `z.enum()` used for all constrained string values
- [ ] Category divider comments with counts: `// ── Category (count) ──`

### Tools
- [ ] `XToolDef` type alias narrows `client` to typed client
- [ ] Tool names follow `{provider}_{service}_{action}`
- [ ] Helper functions extracted for repeated logic
- [ ] Clean return objects — no raw API response dumps
- [ ] `switch/case` multi-action tools have `default: throw new Error(...)`
- [ ] No error handling in tools (MCP handler handles this)
- [ ] No token refresh in tools (handled automatically)

### Index
- [ ] 18x18 SVG icon with `className="shrink-0"`
- [ ] Tools mapped from typed array to `IntegrationToolDef[]`
- [ ] OAuth config uses env var names (not values)
- [ ] OAuth config has correct scopes for per-user access
- [ ] `extraAuthParams` requests offline/refresh tokens where needed
- [ ] `createClient` uses per-user tokens (not shared env vars)
- [ ] Export follows `camelCaseIntegration` naming

### Tool Search
- [ ] Added to `CATEGORY_MAP` in `src/lib/mcp/tool-search.ts`
- [ ] If new category: added entry to `CATEGORY_SYNONYMS` with short search terms users would type
- [ ] If existing category: verified synonyms cover the new integration's common search terms

### Tests & Registration
- [ ] `schemas.test.ts` tests every schema (valid + invalid)
- [ ] `it.each()` for every enum
- [ ] Cross-cutting `rejects {}` test for all schemas with required fields
- [ ] Added to `registry.ts` integrations array
- [ ] Updated `registry.test.ts` length assertion + containment check
- [ ] All tests pass: `npx vitest run src/lib/integrations/{name}/`
- [ ] Full suite passes: `npx vitest run` (no regressions)

### Quality
- [ ] No fake tools: every tool does what its description claims
- [ ] Multi-action tools have ≤ 8 operations each
- [ ] All multi-action tools use `operation` (not `action`)

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Missing `.describe()` on a field | LLMs can't use the tool without descriptions — add one for every field |
| Zod v4 `z.record()` with 1 arg | Use `z.record(z.string(), z.unknown())` — 2 args required |
| Not casting args in execute | `a.fieldName` is `unknown` — cast: `a.fieldName as string` |
| Dumping raw API responses | Pick specific fields, return clean structured objects |
| Leaking error details | Tools throw; the MCP handler returns safe messages to clients |
| Handling token refresh in tools | Don't — `getValidTokens()` runs before your execute function |
| Tool count mismatch | `toolCount: tools.length` — always derived, never hardcoded |
| Using shared API keys when OAuth exists | Always use per-user OAuth if the provider supports it |
| Not requesting offline access | Add `extraAuthParams: { access_type: "offline", prompt: "consent" }` for Google |
| Building client from env vars | `createClient` receives per-user tokens — use those, not `process.env.API_KEY` |
| RGB color objects in schemas | Use hex strings (`"#FF0000"`) — LLMs produce these naturally |
| Using `action` for multi-op discriminator | Use `operation` consistently (ecosystem standard) |
| Too many operations in one tool (>8) | Split into logical groupings (e.g. structural + formatting) |
| Generic "An internal error occurred" | Surface API error messages — they help LLMs diagnose and retry |
| Faking unsupported API operations | Omit the tool entirely — fake results are worse than no results |

---

## Reference: Core Type Definitions

From `src/lib/integrations/types.ts`:

```typescript
export type IntegrationToolDef = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (
    args: Record<string, unknown>,
    client: unknown
  ) => Promise<unknown>;
};

export type OAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
};

export type IntegrationConfig = {
  id: string;
  name: string;
  description: string;
  icon: () => ReactNode;
  oauth: OAuthConfig;
  createClient: (tokens: { accessToken: string; refreshToken?: string }) => unknown;
  tools: IntegrationToolDef[];
  toolCount: number;
};
```

## Reference: How the MCP Endpoint Uses Integrations

The MCP handler at `src/app/api/mcp/[transport]/route.ts` processes tool calls in this order:

1. **Auth** — `withMcpAuth` validates the bearer token (API key), looks up the user, loads their profile, connections, and integration access rules
2. **Rate limit** — 120 req/min per organization (`mcp:org:${organizationId}`)
3. **Tool registration** — iterates `allIntegrations`, registers each tool with `server.tool()`
4. **Permission check** — `isToolAllowed()` checks `user_integration_access` rows
5. **Connection lookup** — finds the user's `connections` row for this integration
6. **Token refresh** — `getValidTokens()` refreshes expired tokens automatically
7. **Execute** — calls `integration.createClient(tokens)` then `tool.execute(args, client)`
8. **Log** — `logUsage()` records the call (fire-and-forget)

Your integration plugs into step 3 (registration) and step 7 (execution). Everything else is handled by the framework.

## Reference: OAuth Connect/Callback Flow

1. User clicks "Connect" → `GET /api/integrations/connect?integration={id}`
2. Server looks up `integrationRegistry.get(id)`, builds OAuth URL from `oauth` config
3. User authorizes → provider redirects to `GET /api/integrations/callback?code=...&state=...`
4. Server exchanges code for tokens, encrypts them, upserts into `connections` table
5. User's MCP calls now have access to their per-user tokens

## Reference: Existing Integrations

Use these as reference when building new ones:

| Integration | Best for learning |
|-------------|------------------|
| `google-sheets/` | Helpers, categories, shared fragments, comprehensive schemas |
| `google-gmail/` | Shared composition fields (`compositionFields`), many tool variations |
| `google-calendar/` | Comprehensive coverage, default values, clean returns |
| `google-docs/` | Gold standard after quality review — hex colors, `operation`, convenience params, format_table split |

---

## Next Step: Test the Integration

After building, run the **test-integration** skill (`/test-integration`) for end-to-end MCP validation, competitive benchmarking, and LLM-friendliness review.
