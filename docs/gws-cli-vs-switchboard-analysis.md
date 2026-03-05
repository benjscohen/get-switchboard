# Google Workspace CLI vs Switchboard: Strategic Analysis

*March 2026*

---

## 1. What Is the Google Workspace CLI?

The [Google Workspace CLI](https://github.com/googleworkspace/cli) (`gws`) is an open-source command-line tool for interacting with Google Workspace APIs. Its defining feature is **dynamic discovery** — rather than shipping a static list of commands, it reads Google's Discovery Service at runtime and builds its entire command surface on the fly.

### How it works

1. **Two-phase parsing**: The CLI identifies the target service (e.g., `drive`), fetches its Discovery Document from Google, and dynamically generates all subcommands and parameters.
2. **Structured output**: All responses are JSON, designed for machine consumption by AI agents.
3. **Agent skills**: 107 pre-built skills organized into service-level skills (47), persona-based skills (10), and recipe/workflow skills (50).
4. **MCP server mode**: Running `gws mcp` starts a Model Context Protocol server, making it usable from Claude Desktop, Cursor, VS Code, and other MCP clients.
5. **Service filtering**: `gws mcp -s drive,gmail,calendar` limits which services are exposed.

### Authentication

`gws` supports six auth flows, but the primary one (`gws auth setup`) creates a Google Cloud project and stores encrypted credentials (AES-256-GCM) in the **OS keyring**. This is a local-first model — credentials live on the user's machine.

### Current status

- Pre-v1.0, with explicit warnings about breaking changes
- Each Google service adds 10-80 MCP tools; the docs warn that most clients only support 50-100 tools total
- Unverified OAuth apps are capped at ~25 scopes, but the recommended preset exceeds this

---

## 2. Side-by-Side: Google Tool Coverage

### gws Google coverage

| Service | Skills | Approach |
|---------|--------|----------|
| Gmail | 5 | Dynamic discovery + workflow skills |
| Drive | 3 | Dynamic discovery + upload workflow |
| Sheets | 4 | Dynamic discovery + read/append skills |
| Calendar | 3 | Dynamic discovery + agenda/insert skills |
| Docs | 2 | Dynamic discovery + write skill |
| Chat | 2 | Dynamic discovery + send skill |
| Meet | 2 | Dynamic discovery + recipe |
| Forms | 1 | Dynamic discovery |
| Slides | 1 | Dynamic discovery |
| Tasks | 1 | Dynamic discovery |
| Keep | 1 | Dynamic discovery |
| Classroom | 1 | Dynamic discovery |
| Admin & Security | 8 | Dynamic discovery (admin, reports, vault, etc.) |
| Apps Script | 3 | Dynamic discovery + deploy recipe |
| **Total** | **~47 service skills** | + 60 persona/recipe skills = 107 total |

### Switchboard Google coverage

| Service | Tools | Approach |
|---------|-------|----------|
| Calendar | ~33 | Hand-crafted, purpose-built for LLM consumption |
| Gmail | ~17 | Hand-crafted with reply/forward/attachment support |
| Docs | ~17 | Hand-crafted with tab/section/table management |
| Drive | ~14 | Hand-crafted with permissions/comments/revisions |
| Sheets | ~16 | Hand-crafted with charts/named ranges/validation |
| Slides | ~13 | Hand-crafted with element/text/table management |
| **Total** | **~110 tools** | Purpose-built, LLM-optimized descriptions |

### Switchboard non-Google coverage

| Integration | Tools | Type |
|-------------|-------|------|
| Asana | ~17 | Native (hand-crafted) |
| Intercom | ~13 | Native (hand-crafted) |
| Shortcut | ~40+ | Proxy (external MCP) |
| Slack | ~12 | Proxy (external MCP) |
| Firecrawl | ~10 | Proxy (external MCP) |
| Granola | ~3 | Proxy (external MCP) |
| Admin | ~10 | Internal |
| Skills/Feedback | ~3 | Internal |

**Total across all integrations: ~150+ tools**

### Key differences

| Dimension | gws | Switchboard |
|-----------|-----|-------------|
| **API coverage** | Full Google API surface via discovery | Curated subset of most-used operations |
| **Tool quality** | Auto-generated from API specs | Hand-crafted descriptions optimized for LLMs |
| **Consolidation** | One tool per API method | `manage_*` pattern groups related operations |
| **Non-Google** | None | Asana, Intercom, Slack, Shortcut, Firecrawl, Granola |
| **Auth model** | Local OS keyring per user | Centralized OAuth, org-scoped API keys |
| **Multi-tenant** | No | Yes (org management, domain-based routing) |
| **Maturity** | Pre-v1.0, expect breaking changes | Production, stable |

---

## 3. CLI vs MCP: Should Switchboard Switch?

### The false dichotomy

The most important insight from this analysis: **`gws` is not an alternative to MCP — it IS an MCP server.** Running `gws mcp` starts a standard MCP server. The excitement around `gws` is about its dynamic discovery approach and Google-specific coverage, not about CLIs replacing MCPs.

### Why MCP is right for Switchboard

| Factor | CLI approach | Switchboard's MCP approach |
|--------|-------------|---------------------------|
| New integration onboarding | User installs binary, configures auth locally | One API key, tools appear automatically |
| Auth management | Each user manages their own credentials | Centralized OAuth via dashboard, encrypted token storage |
| Multi-tenant / org-scoped | Would require building from scratch | Already built (org keys, permissions, rate limits) |
| Per-user tool filtering | Would require building from scratch | Already built (`filterToolsForUser`) |
| Usage tracking | Would require building from scratch | Already built (`logUsage`) |
| Works with AI clients | Yes (via shell exec or MCP wrapper) | Yes (native MCP protocol) |
| Permission management | File system / env var based | Database-backed, admin dashboard |

### Why NOT to adopt `gws` internals

- **Auth model mismatch**: `gws` stores credentials in the OS keyring. Switchboard stores encrypted OAuth tokens per-user in Supabase. Bridging these would mean shelling out to `gws` with injected tokens — fragile and hard to secure.
- **Loss of control**: Can't customize tool descriptions for LLM comprehension, can't add Switchboard-specific error handling, can't do per-user permission filtering at the tool level.
- **Deployment complexity**: Would need `gws` binary in the deployment, version pinning, and compatibility testing with each release.
- **Dependency risk**: Pre-v1.0 with breaking changes expected. Tying Switchboard's Google integration to an unstable dependency is risky.
- **Our tools are better for LLMs**: Hand-crafted tool descriptions with consolidated `manage_*` patterns produce better LLM tool selection than auto-generated API wrappers.

### What IS worth learning from `gws`

1. **Service filtering** — the `-s drive,gmail` pattern is elegant. Switchboard already does this with `filterToolsForUser`, but making it more explicit and user-configurable is worth considering.
2. **Dynamic discovery as a concept** — not from Google's Discovery Service specifically, but the general principle of building tool surfaces dynamically rather than statically.

---

## 4. Alternative Approaches to the Customer Experience Problem

The real question isn't "CLI vs MCP" — it's **"how do we make 150+ tools work well for customers?"** Both `gws` and Switchboard face the same fundamental scaling problem. Here are the strategies worth evaluating.

### 4a. `discover_tools` meta-tool

**Concept**: Instead of exposing all 150+ tools at once, expose a single `discover_tools` tool that lets the LLM search for relevant tools by description or capability.

**How it works**:
1. The MCP server exposes a small set of "gateway" tools (e.g., `discover_tools`, `list_integrations`)
2. When the LLM needs to do something, it calls `discover_tools` with a natural language query like "send an email" or "create a calendar event"
3. The meta-tool returns a filtered list of relevant tools with their schemas
4. The LLM then calls the appropriate tool directly

**Pros**:
- Dramatically reduces the initial tool surface the LLM has to reason about
- Works within the existing MCP protocol
- Scales to any number of integrations without degrading tool selection accuracy
- Mirrors how `gws` recommends service filtering, but makes it dynamic per-request

**Cons**:
- Adds a round-trip for every new tool category the LLM needs
- Requires good semantic search/matching to be useful
- Not all MCP clients may handle dynamically-discovered tools well

**Assessment**: High-value, medium complexity. This is probably the single most impactful improvement for customer experience at scale.

### 4b. Tool consolidation (`manage_*` pattern)

**Concept**: Combine related CRUD operations into a single tool with an `action` parameter.

**Example**: Instead of 5 separate tools:
- `google_calendar_create_event`
- `google_calendar_get_event`
- `google_calendar_update_event`
- `google_calendar_delete_event`
- `google_calendar_list_events`

Expose one tool:
- `google_calendar_events` with `action: "create" | "get" | "update" | "delete" | "list"`

**Current state in Switchboard**: Already partially adopted. Intercom uses `manage_*` tools (e.g., `intercom_manage_contacts`). Google integrations still use the expanded pattern.

**Pros**:
- Can reduce tool count by 3-5x without losing any capability
- LLMs handle action-parameter dispatch well
- Reduces the "which tool do I use?" problem

**Cons**:
- Larger, more complex tool schemas
- May make tool descriptions harder for LLMs to parse
- Trade-off between discoverability (many specific tools) and manageability (fewer general tools)

**Assessment**: Medium-value, low complexity. Continue expanding the `manage_*` pattern where it makes sense, particularly for Google services. Don't force it for tools that have genuinely different parameter shapes per action.

### 4c. Dynamic tool loading (connection-based filtering)

**Concept**: Only expose tools for integrations the user has actually connected.

**Current state**: Switchboard already does this via `filterToolsForUser` — if a user hasn't connected Google Calendar, those tools don't appear in their tool list.

**Improvement opportunities**:
- Make this more granular (e.g., if a user only uses Calendar and Gmail, don't expose Drive/Docs/Sheets/Slides)
- Let users explicitly enable/disable integration categories from the dashboard
- Cache filtered tool lists for faster MCP `list_tools` responses

**Assessment**: Already implemented. Incremental improvements possible but not transformative.

### 4d. Service-level filtering (user-configurable)

**Concept**: Let users choose which integration categories to expose, similar to `gws mcp -s drive,gmail`.

**Implementation**: Add a dashboard setting or API key configuration that specifies which integrations an API key should expose. For example:

```
API Key: sk_live_abc123
Enabled integrations: google_calendar, google_gmail, slack, asana
```

**Pros**:
- Users who only need 3 integrations get a clean, focused tool surface
- Different API keys for different use cases (e.g., "email key" vs "project management key")
- Simple to implement on top of existing `filterToolsForUser`

**Cons**:
- Requires users to think about which integrations they need upfront
- May lead to "why can't I access Drive?" support requests

**Assessment**: Medium-value, low complexity. Good power-user feature. Could be implemented as API key scopes.

### 4e. Hierarchical tool namespacing

**Concept**: Structure tools into a hierarchy that MCP clients can display as collapsible groups.

**Current state**: Switchboard uses a flat namespace with prefix conventions (`google_calendar_*`, `google_gmail_*`). This helps LLMs but doesn't give clients grouping information.

**Improvement**: If the MCP protocol evolves to support tool categories/tags, Switchboard could expose:
```
google/
  calendar/ (33 tools)
  gmail/ (17 tools)
  ...
asana/ (17 tools)
slack/ (12 tools)
```

**Assessment**: Low-value today (protocol doesn't support it well), but worth watching as MCP evolves.

### 4f. Intelligent tool routing

**Concept**: A single "router" tool that accepts natural language and internally dispatches to the right tool.

**Example**: User says "schedule a meeting with John next Tuesday at 2pm." The router tool parses intent, identifies `google_calendar_create_event`, fills parameters, and executes — all in one call.

**Pros**:
- Minimal tool surface (could be one tool per integration, or even one tool total)
- Great for simple, common operations

**Cons**:
- Adds a layer of AI-on-AI interpretation (the MCP server's router LLM interprets what the client LLM meant)
- Loses the structured tool contract that makes MCP reliable
- Error handling becomes opaque
- Expensive (requires server-side LLM inference per request)

**Assessment**: Low-value for Switchboard. The structured tool approach is more reliable and transparent. This pattern works better for consumer chatbots than for developer-facing MCP servers.

### Summary: Recommended approach priority

| Strategy | Impact | Effort | Priority |
|----------|--------|--------|----------|
| `discover_tools` meta-tool | High | Medium | 1 |
| Service-level filtering (API key scopes) | Medium | Low | 2 |
| Continue `manage_*` consolidation | Medium | Low | 3 |
| User-configurable integration toggles | Medium | Low | 4 |
| Hierarchical namespacing | Low | Low | 5 (watch) |
| Intelligent routing | Low | High | Skip |

---

## 5. What This Means for Switchboard's Product Direction

### The core value proposition is secure

Switchboard's value — **one API key, one MCP endpoint, all your integrations with org-level management** — is not threatened by `gws`. The Google Workspace CLI is:
- Google-only (no Asana, Slack, Intercom, etc.)
- Local-auth-only (no centralized org management)
- Pre-v1.0 and unstable
- Actually an MCP server itself, not an alternative paradigm

### The real challenge is scaling the tool surface

As Switchboard adds more integrations, the "too many tools" problem will intensify. With 150+ tools today and every new integration adding 10-30 more, this is the #1 customer experience risk. The good news: this is a solvable problem within the MCP paradigm, and Switchboard is already partially solving it with `filterToolsForUser` and `manage_*` consolidation.

### Recommended product investments

1. **Build `discover_tools`**: A meta-tool that lets LLMs search the full tool catalog by natural language query. This is the highest-leverage improvement for customer experience at scale. It turns "browse 150 tools" into "ask for what you need."

2. **Add API key scopes**: Let users configure which integrations each API key exposes. Power users with 8 integrations connected shouldn't have to expose all 150 tools to every MCP client. Different keys for different workflows.

3. **Continue `manage_*` consolidation for Google**: The Google integration currently uses the expanded pattern (~110 tools). Consolidating into `manage_*` style tools could reduce this to ~30-40 tools without losing capability.

4. **Don't chase `gws`**: There is no need to wrap it, compete with it, or adopt its patterns. If customers want raw Google API coverage, they can run `gws mcp` alongside Switchboard. The products are complementary, not competitive.

### The long-term opportunity

The "too many tools" problem is industry-wide. Every MCP server provider will face it as integrations scale. If Switchboard solves this well — with `discover_tools`, smart filtering, and thoughtful consolidation — that solution itself becomes a differentiator. Being the MCP server that "just works" even at 500+ tools is a competitive moat.

---

*Analysis based on research of the [Google Workspace CLI repository](https://github.com/googleworkspace/cli) (107 skills, pre-v1.0) and Switchboard's current integration architecture (~150+ tools across 12 integrations).*
