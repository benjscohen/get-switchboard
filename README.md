# Switchboard

**One URL. Every tool.** The corporate app store for AI tools via MCP.

Switchboard gives teams a single MCP endpoint that connects any AI agent to the tools they need — Google Workspace, GitHub, Slack, Asana, HubSpot CRM, and more. It also provides a persistent workspace for agents: a versioned file system, long-term memory, encrypted secrets vault, reusable skills and agent configs, and cron-scheduled execution. Admins manage integrations, users connect their accounts, and AI agents call tools through a secure, stateless gateway.

---

## Design Philosophy: The Stripe of MCP

Every decision in Switchboard is measured against one question: **would Stripe ship it this way?**

Stripe turned payment infrastructure — one of the most complex, regulated, high-stakes domains in software — into something a solo developer can integrate in an afternoon. That's the bar. Switchboard should do the same for AI tool access.

**What this means in practice:**

- **5-minute time to first tool call.** A developer should go from "I've never heard of Switchboard" to a working MCP endpoint calling Google Calendar in under 5 minutes. Sign up, connect Google, copy the endpoint URL, paste it into Claude/Cursor, done.
- **Progressive complexity, not progressive confusion.** The simple path is obvious. Advanced features (custom MCP servers, org-wide policies, per-user permissions, skills, agents, vault, schedules) are there when you need them, invisible when you don't.
- **Beautiful defaults.** Sensible rate limits out of the box. Encryption on by default. Secure by default. The "I didn't configure anything" path should be production-ready, not a security hole.
- **Copy-paste-run.** Endpoint URLs should be clickable. API keys should be one click to generate. Every interaction should respect the developer's time.

---

## Repo Structure

Two packages: a Next.js 16 web app (MCP endpoint + dashboard) and a standalone agent worker (Slack bot + scheduled execution).

```
switchboard/
├── src/                                  # Next.js web app
│   ├── app/
│   │   ├── (marketing)/                  # Landing page (Navbar + Footer)
│   │   │   └── page.tsx                  # Hero, Problem, HowItWorks, Integrations, Pricing, CTA
│   │   ├── (app)/                        # Dashboard (auth-guarded)
│   │   │   ├── mcp/page.tsx              # Connection setup, MCP endpoint config
│   │   │   ├── agents/page.tsx           # Agent configuration UI
│   │   │   ├── files/page.tsx            # Virtual filesystem browser
│   │   │   ├── schedules/page.tsx        # Scheduled execution management
│   │   │   ├── skills/page.tsx           # Skill management UI
│   │   │   ├── vault/page.tsx            # Encrypted secrets vault UI
│   │   │   ├── settings/                 # Org settings
│   │   │   │   ├── organization/         # Org name, domains, members
│   │   │   │   ├── teams/               # Team management
│   │   │   │   ├── users/               # User management + per-user detail
│   │   │   │   ├── integrations/        # Integration settings
│   │   │   │   ├── mcp-servers/         # Custom MCP server management
│   │   │   │   ├── access/              # Integration access scopes
│   │   │   │   ├── dashboard/           # Dashboard preferences
│   │   │   │   └── usage/               # Usage analytics
│   │   │   ├── admin/                    # Super-admin panel (users, MCP servers, usage)
│   │   │   └── layout.tsx                # Dashboard layout with auth guard
│   │   ├── login/page.tsx                # Google OAuth login
│   │   ├── auth/callback/route.ts        # OAuth code exchange
│   │   └── api/
│   │       ├── mcp/[transport]/          # MCP endpoint (Streamable HTTP)
│   │       ├── keys/                     # API key CRUD
│   │       ├── agents/                   # Agent CRUD + versions + rollback
│   │       ├── agent-templates/          # Predefined agent starters
│   │       ├── schedules/                # Schedule CRUD + run history
│   │       ├── files/                    # Virtual filesystem CRUD + versions + search
│   │       ├── fs/                       # Filesystem sync for agent worker
│   │       ├── integrations/             # OAuth connect/disconnect/callback
│   │       │   └── gmail-settings/       # Gmail sender settings
│   │       ├── org/                      # Org info, members, domains, integration scopes
│   │       ├── teams/                    # Team CRUD + member management
│   │       ├── skills/                   # Skill CRUD + versions + rollback
│   │       ├── skill-templates/          # Predefined skill starters
│   │       ├── vault/                    # Encrypted secrets vault CRUD + sharing
│   │       ├── user-keys/               # Per-user proxy integration keys
│   │       ├── profile/                  # User profile management
│   │       ├── agent/settings/           # Agent worker settings endpoint
│   │       ├── admin/                    # Admin: users, MCP servers, stats, usage
│   │       └── waitlist/                 # Waitlist signups
│   ├── components/
│   │   ├── sections/                     # Marketing: Hero, Problem, HowItWorks, etc.
│   │   ├── layout/                       # Navbar, Footer
│   │   ├── dashboard/                    # ConnectCard, IntegrationList, DiscoveryModeToggle, etc.
│   │   ├── skills/                       # SkillEditor, SkillList
│   │   ├── vault/                        # VaultList, VaultForm
│   │   ├── admin/                        # StatCard, UsageTable, PermissionsEditor, etc.
│   │   └── ui/                           # Button, Card, Badge, Input, Select, Tabs, etc.
│   ├── lib/
│   │   ├── supabase/                     # server.ts, client.ts, admin.ts
│   │   ├── integrations/                 # Registry, tools, schemas per integration
│   │   │   ├── google-calendar/          # 33 tools (builtin OAuth)
│   │   │   ├── google-docs/              # 17 tools
│   │   │   ├── google-gmail/             # 17 tools
│   │   │   ├── google-sheets/            # 16 tools
│   │   │   ├── google-drive/             # 14 tools
│   │   │   ├── google-slides/            # 13 tools
│   │   │   ├── google-ads/               # 25 tools
│   │   │   ├── asana/                    # 17 tools
│   │   │   ├── hubspot-crm/              # 23 tools
│   │   │   ├── intercom/                 # 13 tools
│   │   │   ├── linkedin-ads/             # 28 tools
│   │   │   ├── railway/                  # 12 tools (builtin OAuth)
│   │   │   ├── github/                   # 43 tools (proxy)
│   │   │   ├── slack/                    # Proxy integration config
│   │   │   ├── exa/                      # 11 tools (proxy)
│   │   │   ├── firecrawl/               # Proxy integration config
│   │   │   ├── granola/                  # Proxy integration config
│   │   │   ├── shortcut/                # Proxy integration config
│   │   │   ├── context7/                # 2 tools (proxy)
│   │   │   ├── supabase/                # 27 tools (proxy)
│   │   │   ├── chrome-mcp/              # 28 tools (local integration)
│   │   │   ├── shared/                   # Shared utilities (json-params, etc.)
│   │   │   ├── registry.ts              # Builtin integration registry
│   │   │   ├── proxy-registry.ts        # Proxy integration registry
│   │   │   ├── proxy-tools.ts           # Proxy tool discovery + execution
│   │   │   ├── catalog.ts               # Builtin + proxy + custom MCP catalog
│   │   │   ├── marketing-catalog.ts     # Landing-page integration grid
│   │   │   ├── token-refresh.ts         # OAuth token refresh logic
│   │   │   └── types.ts                 # IntegrationConfig, ProxyIntegrationConfig, etc.
│   │   ├── mcp/                          # MCP tool implementations
│   │   │   ├── integration-tools.ts     # All integration tool registration
│   │   │   ├── discover-tools.ts        # discover_tools MCP tool (semantic search)
│   │   │   ├── call-tool.ts             # call_tool meta-tool (discovery mode execution)
│   │   │   ├── tool-search.ts           # Hybrid keyword + pgvector search engine
│   │   │   ├── tool-filtering.ts        # Per-user tool visibility (connections, permissions, scopes)
│   │   │   ├── tool-risk.ts             # Risk classification (read/write/destructive)
│   │   │   ├── tool-logging.ts          # Usage logging wrapper for MCP tool handlers
│   │   │   ├── admin-tools.ts           # Org admin + super admin MCP tools (10 tools)
│   │   │   ├── vault-tools.ts           # Secrets vault MCP tools (8 tools)
│   │   │   ├── file-tools.ts            # Virtual filesystem MCP tools (11 tools)
│   │   │   ├── memory-tools.ts          # Persistent memory MCP tools (3 tools)
│   │   │   ├── skill-tools.ts           # Skill management MCP tool + MCP prompts
│   │   │   ├── agent-tools.ts           # Agent management MCP tool + MCP prompts
│   │   │   ├── agent-filtering.ts       # Per-user agent visibility
│   │   │   ├── schedule-tools.ts        # Schedule management MCP tool
│   │   │   ├── skill-filtering.ts       # Per-user skill visibility + interpolation
│   │   │   ├── schema-utils.ts          # Zod-to-JSON-Schema conversion
│   │   │   ├── json-schema-to-zod.ts    # JSON Schema to Zod conversion (custom MCP)
│   │   │   ├── proxy-client.ts          # Custom MCP server proxy (discover + call)
│   │   │   ├── proxy-namespace.ts       # Tool namespacing for proxy integrations
│   │   │   └── types.ts                 # MCP auth context types
│   │   ├── agents/                       # Agent service + template logic
│   │   │   └── service.ts
│   │   ├── files/                        # Virtual filesystem service
│   │   │   └── service.ts
│   │   ├── schedules/                    # Schedule service
│   │   │   └── service.ts
│   │   ├── skills/                       # Skill service + template logic
│   │   │   ├── service.ts
│   │   │   └── templates.ts
│   │   ├── vault/                        # Vault service
│   │   │   └── service.ts
│   │   ├── embeddings.ts                 # Shared embedding generation (OpenAI text-embedding-3-large)
│   │   ├── api-auth.ts                   # requireAuth(), requireAdmin(), requireOrgAdmin()
│   │   ├── crypto.ts                     # API key generation (sk_live_...) + SHA-256 hashing
│   │   ├── encryption.ts                 # AES-256-GCM token encryption
│   │   ├── rate-limit.ts                 # In-memory rate limiting
│   │   ├── permissions.ts                # Per-user tool permissions (full/custom modes)
│   │   ├── integration-scopes.ts         # Per-org integration access scopes
│   │   ├── usage-log.ts                  # Usage logging (fire-and-forget)
│   │   ├── oauth-state.ts                # OAuth state management
│   │   ├── oauth-pkce.ts                 # PKCE flow for OAuth integrations
│   │   ├── constants.ts                  # Site config, integrations, pricing
│   │   └── utils.ts                      # Shared utilities
│   └── test/
│       └── setup.ts                      # Vitest setup
├── agent-worker/                         # Standalone Slack bot + scheduled execution
│   ├── src/
│   │   ├── index.ts                      # Slack Bolt app (Socket Mode)
│   │   ├── agent.ts                      # Claude Code SDK session management
│   │   ├── headless.ts                   # Single-prompt headless execution
│   │   ├── scheduled-execution.ts        # Schedule run orchestrator
│   │   ├── scheduler.ts                  # Cron scheduler (polls DB for due schedules)
│   │   ├── delivery.ts                   # Result delivery (Slack DM, channel, file)
│   │   ├── message-stream.ts             # Async message generator for multi-turn
│   │   ├── session-registry.ts           # In-memory active session tracking
│   │   ├── prompt.ts                     # System prompt builder + CLAUDE.md extraction
│   │   ├── files.ts                      # Switchboard file sync (pull user files to disk)
│   │   ├── file-uploads.ts              # FILE_UPLOAD directive extraction + Slack upload
│   │   ├── workspace-storage.ts          # Workspace archival + restoration between sessions
│   │   ├── slack.ts                      # Slack API helpers (post, update, upload)
│   │   ├── slack-blocks.ts              # Slack Block Kit message builders
│   │   ├── reaper.ts                     # Stale session cleanup
│   │   ├── db.ts                         # Supabase queries for agent worker
│   │   └── types.ts                      # Shared types
│   ├── Dockerfile                        # Full dev environment (Node, Python, git, Terraform, etc.)
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── generate-all-embeddings.ts        # Batch embed all tools + files + skills
│   ├── generate-tool-embeddings.ts       # Batch embed tool descriptions
│   └── encrypt-existing-tokens.ts        # One-time token encryption migration
├── supabase/
│   └── migrations/                       # 45 migration files
├── .github/workflows/
│   └── test.yml                          # CI: runs vitest on PRs
├── middleware.ts                          # Supabase SSR (cookie refresh + route protection)
├── next.config.ts                        # Standalone output + security headers
├── vitest.config.ts                      # Test config (coverage on lib + api)
├── package.json                          # npm, not pnpm
└── tsconfig.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4 |
| **Animation** | Motion (Framer Motion) |
| **Database** | Supabase (Postgres + RLS + pgvector) via `@supabase/supabase-js` + `@supabase/ssr` |
| **Auth** | Supabase Auth with Google OAuth |
| **MCP** | `mcp-handler` v1.0.7 + `@modelcontextprotocol/sdk` v1.27 |
| **Agent SDK** | `@anthropic-ai/claude-code` (Claude Code SDK for agent worker) |
| **Slack** | `@slack/bolt` v4 (Socket Mode — no public URL needed) |
| **Google APIs** | Individual `@googleapis/*` packages (calendar, docs, gmail, sheets, drive, slides, etc.) |
| **Validation** | Zod 4 |
| **Encryption** | AES-256-GCM (application-level token encryption) |
| **Search** | pgvector (semantic tool/file/agent search via OpenAI `text-embedding-3-large`) |
| **Scheduling** | cron-parser + DB-based scheduler with delivery targets |
| **Testing** | Vitest 4, Testing Library |
| **CI** | GitHub Actions (test on PR) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  AI Agent (Claude, Cursor, etc.)                                 │
│  Sends: POST /api/mcp  +  Authorization: Bearer <api-key>       │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Next.js API Route: /api/mcp/[transport]                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ withMcpAuth (mcp-handler)                                  │  │
│  │  → Hash bearer token (SHA-256), look up api_keys table     │  │
│  │  → Check API key scope + expiry (90-day default)           │  │
│  │  → Load profile, permissions, connections, org context     │  │
│  │  → Rate limit (120 req/min per org)                        │  │
│  │  → Per-user risk-based rate limits (120r/30w/5d per min)   │  │
│  │  → Decrypt stored OAuth tokens (AES-256-GCM)               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ MCP Server (per-request, stateless)                        │  │
│  │                                                            │  │
│  │  Builtin integration tools (228):                          │  │
│  │    google_calendar_*  (33)   google_docs_*    (17)         │  │
│  │    google_gmail_*     (17)   google_sheets_*  (16)         │  │
│  │    google_drive_*     (14)   google_slides_*  (13)         │  │
│  │    google_ads_*       (25)   asana_*          (17)         │  │
│  │    hubspot_crm_*      (23)   intercom_*       (13)        │  │
│  │    linkedin_ads_*     (28)   railway_*        (12)         │  │
│  │                                                            │  │
│  │  Proxy integration tools:                                  │  │
│  │    github_*, slack_*, exa_*, firecrawl_*, granola_*,       │  │
│  │    shortcut_*, context7_*, supabase_*                      │  │
│  │    (discovered from remote MCP servers)                    │  │
│  │                                                            │  │
│  │  Custom MCP proxy tools:                                   │  │
│  │    {server_slug}__{tool_name}  (org-scoped)                │  │
│  │                                                            │  │
│  │  Platform tools (28):                                      │  │
│  │    Files (11): file_read/write/delete/move/list/search,    │  │
│  │      folder_create/delete, file_history/version_read/      │  │
│  │      rollback                                              │  │
│  │    Memory (3): save_memory, recall_memories, forget_memory │  │
│  │    Vault (8): vault_list/get/set/delete/search_secrets,    │  │
│  │      vault_share/unshare_secret, vault_list_shares         │  │
│  │    Discovery (2): discover_tools, call_tool                │  │
│  │    Management (4): manage_skills, manage_agents,           │  │
│  │      manage_schedules, submit_feedback                     │  │
│  │                                                            │  │
│  │  Admin tools (10):                                         │  │
│  │    Org admin (6): admin_teams, admin_team_members,         │  │
│  │      admin_org, admin_org_members, admin_org_domains,      │  │
│  │      admin_org_integrations                                │  │
│  │    Super admin (4): admin_users, admin_user_permissions,   │  │
│  │      admin_usage, admin_mcp_servers                        │  │
│  │                                                            │  │
│  │  MCP Prompts:                                              │  │
│  │    Skills → {scope}:{slug} (e.g., org:code-review)         │  │
│  │    Agents → agent:{scope}:{slug} (e.g., agent:org:researcher) │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────┴────┐          ┌───┴───┐           ┌────┴────┐
    ▼         ▼          ▼       ▼           ▼         ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│ Supabase     │  │ External     │  │ Agent Worker              │
│ (Postgres +  │  │ APIs         │  │ (Separate process)        │
│  pgvector)   │  │              │  │                           │
│              │  │ - Google     │  │ Slack Bot (Socket Mode)   │
│ - profiles   │  │ - Asana      │  │  → DM-based chat agent   │
│ - api_keys   │  │ - HubSpot   │  │  → Multi-turn sessions    │
│ - connections│  │ - Intercom   │  │  → File attachment support│
│ - orgs       │  │ - LinkedIn   │  │  → Plan mode approval     │
│ - teams      │  │ - Railway    │  │                           │
│ - skills     │  │ - GitHub     │  │ Scheduled Execution       │
│ - agents     │  │ - Slack      │  │  → Cron-based triggers    │
│ - schedules  │  │ - Exa        │  │  → Headless agent runs    │
│ - files      │  │ - Firecrawl  │  │  → Delivery to Slack/file │
│ - vault      │  │ - Granola    │  │                           │
│ - memories   │  │ - Shortcut   │  │ Powered by Claude Code SDK│
│ - embeddings │  │ - Context7   │  └──────────────────────────┘
└──────────────┘  │ - Supabase   │
                  └──────────────┘
```

### How a Request Flows

1. AI agent sends `POST /api/mcp` with `Authorization: Bearer <api-key>`
2. `withMcpAuth` hashes the key with SHA-256, looks up `api_keys` table
3. Validates API key scope (`full`, `read_write`, `read_only`) and expiry
4. Loads user profile (status, permissions, discovery mode), org context, and integration access rules
5. Rate limiter checks per-org quota (120 req/min) and per-user risk-based limits
6. Decrypts the user's stored OAuth tokens (AES-256-GCM)
7. MCP server routes the tool call to the appropriate handler (integration, platform, vault, admin, etc.)
8. Handler calls the external API or internal service
9. Response returned via MCP protocol (Streamable HTTP transport)

---

## Agent Worker

The `agent-worker/` package is a standalone Node.js process that powers two features: the Slack chat agent and scheduled execution. It uses the Claude Code SDK (`@anthropic-ai/claude-code`) to run full agentic sessions.

### Slack Bot

- **Socket Mode** — connects via WebSocket, no public URL needed
- **DM-based** — users chat with the bot in Slack DMs; each thread is a separate agent session
- **Multi-turn** — follow-up messages in a thread are injected into the running session (gated so they don't interrupt the current turn)
- **File attachments** — images, PDFs, and text files sent in Slack are downloaded and provided to the agent as context
- **FILE_UPLOAD directives** — agent can produce files that get uploaded back to the Slack thread
- **Plan mode** — agent can propose a plan; user approves/rejects via Slack interactive buttons
- **Workspace persistence** — workspaces are archived between sessions and restored on resume
- **Session management** — concurrent session limit (10), stale session reaper, retry on failure
- **Switchboard file sync** — pulls the user's Switchboard files (CLAUDE.md, memories) into the agent's working directory
- **User identity injection** — agent system prompt includes the user's name, email, and Slack ID

### Scheduled Execution

- **Cron-based triggers** — scheduler polls the DB for due schedules and creates runs
- **Headless mode** — single-prompt execution (no multi-turn, no Slack interaction)
- **Delivery targets** — results delivered to Slack DM, Slack channel, or Switchboard file
- **Agent + skill composition** — schedules can reference an agent config (for instructions/tool_access) and/or a skill template (for prompt interpolation)
- **Failure handling** — consecutive failure tracking; auto-pause after 5 consecutive failures
- **Timezone support** — IANA timezone per schedule

### Dev Environment (Dockerfile)

The agent worker Dockerfile builds a full dev environment for the Claude Code agent:
- Node.js 20, Python 3 (with FastAPI, pandas, numpy), git, Terraform
- PostgreSQL client, SQLite, ripgrep, build tools (gcc/g++/make)
- Sandboxed `worker` user with sudo access
- Each agent session runs inside this container

---

## Discovery Mode & Tool Search

With 228 builtin tools + proxy integrations + platform tools + custom MCP tools, token cost and tool-selection accuracy are real concerns — each tool definition is ~400-500 tokens, and LLMs lose accuracy past ~30 tools in a flat list.

**Switchboard solves this with a two-layer discovery architecture:**

### Discovery Mode (Server-Side)

When a user enables **discovery mode** (toggle in the dashboard), the MCP endpoint exposes only a compact set of tools instead of 200+:

| Tool | Purpose |
|---|---|
| `discover_tools` | Semantic search for tools — browse integrations or search by keyword/description |
| `call_tool` | Execute any discovered tool by name + arguments (permission-checked) |
| `manage_skills` | CRUD for skills/prompt templates |
| `manage_agents` | CRUD for agent configurations |
| `manage_schedules` | CRUD for scheduled agent runs |
| `submit_feedback` | Submit feedback about the platform |
| `file_*` | 11 virtual filesystem tools |
| `save_memory` / `recall_memories` / `forget_memory` | Persistent memory |
| `vault_*` | 8 encrypted secrets tools |

The AI agent uses `discover_tools` to find integration tools, then `call_tool` to execute. This keeps the tool list compact while giving access to everything.

### Hybrid Search Engine

`discover_tools` uses a hybrid search strategy:

1. **pgvector semantic search** — Tool descriptions are embedded via OpenAI `text-embedding-3-large` (1536 dimensions) and stored in the `tool_embeddings` table. Query embeddings are LRU-cached. New/changed tools are auto-embedded on first request.
2. **Keyword search** — Jaccard similarity + recall scoring over extracted keywords, with bonuses for exact tool name matches.
3. **Search enrichments** — High-value tools (e.g., `google_calendar_create_event`) have hand-written `useWhen` and `aliases` metadata for better matching on natural-language queries like "schedule a meeting".
4. **Category synonyms** — Category-level synonym maps (e.g., `calendar` → `schedule, meetings, appointments`) boost recall for short queries.
5. **Hybrid scoring** — 60% semantic + 30% keyword + 10% name bonus, with graduated thresholds for short vs. long queries. Falls back to keyword-only when no OpenAI key is configured.

### Browse Mode

Calling `discover_tools` without a query returns an integration summary — grouped by category with tool counts and risk levels — so the agent can orient before searching.

### Client-Side Discovery

Claude Code already implements `ToolSearch` with deferred loading. The Claude API supports `defer_loading: true` per tool. As the MCP ecosystem matures, more clients will follow. Switchboard's discovery mode is complementary — it works with any MCP client, not just those with built-in deferred loading.

---

## Tool Risk Classification

Every tool is classified into one of three risk levels:

| Risk Level | Description | Examples |
|---|---|---|
| `read` | Read-only operations | list_events, get_message, search |
| `write` | Creates or modifies data | create_event, update_task, send_message |
| `destructive` | Deletes data or has high-impact side effects | delete_event, trash_message, manage_permissions |

Risk levels power three features:

1. **API key scopes** — `read_only` keys can only call `read` tools; `read_write` allows read + write; `full` allows everything including destructive.
2. **Per-user risk-based rate limits** — 120 read/min, 30 write/min, 5 destructive/min (per user, in addition to the 120 req/min per-org limit).
3. **Risk annotations** — Tools expose their risk level via MCP annotations for client-side safety UIs.

Known builtin tools use a static classification map. Unknown/custom tools are classified by a pattern-based heuristic (e.g., tool names containing "delete" or "trash" → destructive, "list" or "get" → read, default → write).

---

## Builtin Integrations — 228 Tools

### Google Calendar (33 tools)

| Category | Tools |
|---|---|
| **Events** (14) | list, get, create, update, patch, delete, move, quick_add, import, list_recurring_instances, rsvp, search, watch, batch |
| **Calendars** (6) | list, get, create, update, delete, clear |
| **Calendar List** (4) | get_entry, update_entry, add, remove |
| **Sharing** (4) | list_sharing_rules, share, update_sharing, unshare |
| **Availability** (1) | find_free_busy |
| **Settings** (2) | get_settings, get_setting |
| **Colors** (1) | get_colors |
| **Notifications** (1) | stop_watching |

### Google Docs (17 tools)

create_document, get_document, read_content, search, insert_text, replace_text, delete_content, format_text, format_paragraph, manage_tables, format_table, manage_sections, manage_headers_footers, manage_images, manage_named_ranges, manage_tabs, update_document_style

### Google Gmail (17 tools)

list_messages, get_message, get_attachment, send_message, reply_to_message, forward_message, modify_message, trash_message, batch_modify_messages, list_threads, get_thread, manage_drafts, manage_labels, manage_vacation, manage_filters, get_profile, list_history

### Google Sheets (16 tools)

get_info, create, search, read, write, append, clear, sort_filter, manage_tabs, copy_tab, modify_structure, format, conditional_format, validate, manage_charts, manage_named_ranges

### Google Drive (14 tools)

about, search, get_file, create_file, update_file, copy_file, trash, download, export, manage_permissions, manage_comments, manage_replies, list_revisions, manage_shared_drives

### Google Slides (13 tools)

get_presentation, get_slide_content, get_slide_thumbnail, create_presentation, manage_slides, add_element, delete_element, format_element, manage_text, format_text, manage_table, update_page, batch_update

### Google Ads (25 tools)

list_accounts, get_account, list_campaigns, get_campaign, create_campaign, update_campaign, list_ad_groups, get_ad_group, create_ad_group, update_ad_group, list_ads, get_ad, create_ad, update_ad, list_keywords, add_keywords, update_keyword, remove_keyword, get_campaign_metrics, get_ad_group_metrics, get_keyword_metrics, get_search_terms, list_audiences, get_billing_info, get_change_history

### Asana (17 tools)

get_context, search_tasks, create_task, get_task, update_task, manage_subtasks, manage_stories, manage_attachments, manage_custom_fields, manage_goals, manage_portfolios, manage_projects, manage_sections, manage_tags, manage_task_dependencies, manage_task_relations, manage_templates

### HubSpot CRM (23 tools)

manage_objects, search_objects, batch_objects, manage_associations, merge_objects, manage_properties, manage_property_groups, manage_schemas, get_object_schema, manage_pipelines, manage_pipeline_stages, manage_owners, manage_users, manage_lists, manage_imports, manage_exports, manage_deal_splits, manage_calling_transcripts, manage_marketing_events, manage_feedback_submissions, manage_forecasts, manage_campaigns, manage_sequences

### Intercom (13 tools)

manage_contacts, search_contacts, manage_conversations, manage_companies, manage_contact_companies, manage_tickets, manage_tags, apply_tags, manage_notes, manage_events, manage_data_attributes, manage_segments, get_counts

### LinkedIn Ads (28 tools)

get_member_profile, list_ad_accounts, get_ad_account, list_campaigns, get_campaign, create_campaign, update_campaign, list_campaign_groups, get_campaign_group, create_campaign_group, update_campaign_group, list_creatives, get_creative, create_creative, update_creative, get_campaign_analytics, get_creative_analytics, get_account_analytics, list_conversions, get_conversion, create_conversion, list_audiences, get_audience, create_audience, list_forms, get_form, get_form_responses, get_budget_recommendations

### Railway (12 tools)

check_status, list_projects, create_project, list_services, deploy, deploy_template, create_environment, list_variables, set_variables, generate_domain, list_deployments, get_logs

### Proxy Integrations

In addition to builtin integrations, Switchboard supports **proxy integrations** — tools discovered from remote MCP servers and served through the Switchboard endpoint:

| Integration | Tools | Description |
|---|---|---|
| **GitHub** | 43 | Issues, PRs, code search, repository management |
| **Slack** | varies | Messaging, channels, search |
| **Exa** | 11 | AI-powered web search, content extraction, deep research |
| **Firecrawl** | varies | Web scraping, crawling, and search |
| **Granola** | varies | Meeting transcript retrieval |
| **Shortcut** | varies | Project management (stories, epics, iterations) |
| **Context7** | 2 | Library documentation lookup |
| **Supabase** | 27 | Database management, edge functions, branching |

Proxy integrations use OAuth, org-level API keys, or per-user API keys. Tools are automatically discovered from the remote server and namespaced (e.g., `github_create_issue`, `exa_web_search_exa`, `slack_send_message`).

### Custom MCP Server Proxying

Beyond builtin and proxy integrations, admins can add custom MCP servers that get proxied through Switchboard:
- **Org-scoped access control** — global servers (null org_id) available to all, org-specific servers restricted to members
- **Shared or per-user API keys** — shared key set by admin, or each user provides their own
- **Custom headers** — per-user custom headers for servers that need them
- **Automatic tool discovery** — tools discovered from the remote server and namespaced as `{server_slug}__{tool_name}`
- **Unified auth and rate limiting** — all requests go through the same API key auth and rate limiting

---

## Platform Tools

### Virtual Filesystem (11 tools)

A versioned, hierarchical file system stored in Supabase with full audit trail:

| Tool | Purpose |
|---|---|
| `file_read` | Read a file's content, metadata, and version info |
| `file_write` | Create or update a file (auto-creates parent folders) |
| `file_delete` | Delete a file |
| `file_move` | Move or rename a file or folder |
| `file_list` | List files and folders at a path |
| `file_search` | Search files by name or content (with embedding support) |
| `folder_create` | Create a folder and any missing parents |
| `folder_delete` | Delete a folder (optionally recursive) |
| `file_history` | View all versions of a file with audit trail |
| `file_version_read` | Read a specific historical version |
| `file_rollback` | Restore a file to a previous version |

Files are org-scoped (shared within an org) or user-scoped (personal). Content changes are versioned automatically. File and skill content are embedded for semantic search.

### Persistent Memory (3 tools)

A convention-based memory system built on the virtual filesystem:

| Tool | Purpose |
|---|---|
| `save_memory` | Save a memory under a key (e.g., `MEMORY`, `daily/2026-03-07`) |
| `recall_memories` | Without query: loads MEMORY.md + recent daily logs. With query: semantic search across all memories |
| `forget_memory` | Delete a saved memory |

**Conventions:**
- `/memories/MEMORY.md` — core memory file (preferences, decisions, project context)
- `/memories/daily/YYYY-MM-DD.md` — daily logs (append-only activity journal)
- Agents are instructed to read memory at conversation start and write summaries at the end

### Secrets Vault (8 tools)

AES-256-GCM encrypted per-user secret storage with sharing:

| Tool | Purpose |
|---|---|
| `vault_list_secrets` | List all secrets (names, categories, tags — no values) |
| `vault_get_secret` | Get a secret with all decrypted field values |
| `vault_set_secret` | Create or update a secret (upsert by name) |
| `vault_delete_secret` | Delete a secret |
| `vault_search_secrets` | Search by name, category, or tags |
| `vault_share_secret` | Share with a user (by email), team, or entire org |
| `vault_unshare_secret` | Revoke a share |
| `vault_list_shares` | List all shares for a secret |

---

## Skills System

Skills are reusable prompt/instruction bundles distributed to AI agents as MCP prompts.

- **Scoped** — skills can be `organization`, `team`, or `user` scoped
- **Versioned** — full version history with rollback support
- **Arguments** — skills support `{{arg}}` interpolation for parameterized prompts
- **MCP prompts** — each skill is registered as an MCP prompt (e.g., `org:code-review`)
- **Semantic search** — skills are embedded for search via `manage_skills` search operation
- **Templates** — predefined skill starters for common workflows (seeded via migration)
- **MCP tool** — `manage_skills` supports: list, get, create, update, delete, history, version, rollback, search

---

## Agents System

Agents are reusable AI agent configurations distributed as MCP prompts.

- **Scoped** — `organization`, `team`, or `user` scoped with role-based permissions
- **Versioned** — full version history with rollback support
- **Tool access** — configurable integration/tool access per agent (e.g., `["slack", "google-calendar:google_calendar_create_event"]`)
- **Model preference** — optional preferred model override
- **MCP prompts** — each agent is registered as an MCP prompt (e.g., `agent:org:research-assistant`)
- **Templates** — predefined agent templates for quick setup
- **Semantic search** — agents are embedded for discovery
- **MCP tool** — `manage_agents` supports: list, get, create, create_from_template, list_templates, update, delete, search, history, version, rollback, list_integrations

---

## Schedules System

Cron-based automated agent execution with configurable delivery.

- **Cron expressions** — standard 5-field cron (min hour dom month dow) with timezone support
- **Delivery targets** — results delivered to Slack DM, Slack channel, or Switchboard file
- **Composition** — a schedule can reference an agent (for instructions + tool_access) and/or a skill (for prompt template interpolation)
- **Scoped** — `organization`, `team`, or `user` scoped
- **Run history** — full execution history with status, duration, error tracking
- **Pause/resume** — temporarily disable without deletion
- **Auto-pause** — schedules auto-pause after 5 consecutive failures
- **Manual trigger** — run any schedule on-demand for testing
- **MCP tool** — `manage_schedules` supports: list, get, create, update, delete, pause, resume, trigger, history

---

## Multi-Tenant Architecture

Switchboard uses domain-based organization routing:

- Every user belongs to exactly one organization
- On signup, the `handle_new_user()` trigger extracts the email domain, checks against `personal_email_domains` (gmail.com, etc.), and either matches to an existing org via `organization_domains` or creates a personal org
- Org roles: `owner`, `admin`, `member`
- API keys are org-scoped — they inherit the creating user's connections
- Connections (OAuth tokens) are per-user
- Teams provide sub-org grouping for skill, agent, and permission management
- **Integration access scopes** — org admins can restrict specific integrations to a subset of users

---

## Database Schema

Supabase Postgres with Row Level Security on all tables. 45 migration files.

### Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `organizations` | Multi-tenant orgs | id, name, slug, is_personal |
| `organization_domains` | Maps email domains to orgs | organization_id, domain, is_primary |
| `personal_email_domains` | Lookup (gmail.com, etc.) | domain (PK) |
| `profiles` | Users | id, email, name, role, status, permissions_mode, discovery_mode, organization_id, org_role |
| `connections` | Encrypted OAuth tokens (per-user) | user_id, integration_id, access_token, refresh_token, expires_at, enabled_tool_groups |
| `api_keys` | MCP auth (org-scoped) | user_id, organization_id, key_hash, key_prefix, name, scope, expires_at, permissions |
| `usage_logs` | Tool usage tracking | user_id (text), tool_name, integration_id, status, duration_ms, risk_level, organization_id |
| `user_integration_access` | Per-user tool permissions | user_id, integration_id, allowed_tools[] |
| `custom_mcp_servers` | Custom MCP server configs | name, slug, server_url, auth_type, shared_api_key, key_mode, organization_id, custom_headers |
| `custom_mcp_tools` | Tools from custom servers | server_id, tool_name, description, input_schema, enabled |
| `custom_mcp_user_keys` | Per-user keys for custom servers | user_id, server_id, api_key, custom_headers |
| `waitlist_entries` | Waitlist signups | email |

### Teams, Skills & Agents Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `teams` | Org-scoped team management | id, organization_id, name, slug, description |
| `team_members` | Team membership | team_id, user_id, role |
| `skills` | Prompt/skill distribution via MCP | id, organization_id, name, slug, content, scope, team_id, arguments, enabled |
| `skill_versions` | Skill version history | skill_id, version, name, content, arguments, changed_by |
| `skill_templates` | Predefined skill starters | id, name, description, content, category |
| `agents` | Reusable agent configurations | id, organization_id, name, slug, description, instructions, scope, team_id, tool_access, model, enabled |
| `agent_versions` | Agent version history | agent_id, version, name, instructions, tool_access, changed_by |
| `agent_templates` | Predefined agent starters | id, name, slug, description, instructions, default_scope, tool_access |

### Filesystem & Memory Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `files` | Virtual filesystem entries | id, organization_id, user_id, path, name, content, mime_type, is_folder, metadata |
| `file_versions` | File version history | file_id, version, content, metadata, changed_by |

### Schedules Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `schedules` | Cron-based agent execution | id, organization_id, name, slug, cron_expression, timezone, prompt, agent_id, skill_id, delivery, scope, enabled |
| `schedule_runs` | Execution history | schedule_id, status, prompt, model, result_text, started_at, completed_at, error |

### Proxy Integration Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `proxy_oauth_clients` | DCR credentials for proxy integrations | integration_id, organization_id, client_id, client_secret |
| `proxy_integration_tools` | Discovered tools from proxy integrations | integration_id, tool_name, description, input_schema |
| `integration_org_keys` | Org-level API keys for integrations | organization_id, integration_id, api_key, enabled |
| `proxy_user_keys` | Per-user API keys for proxy integrations | user_id, integration_id, api_key |

### Vault & Feedback Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `vault_secrets` | Encrypted per-user secret storage | id, user_id, organization_id, name, description, category, tags |
| `vault_secret_fields` | Individual encrypted fields within a secret | secret_id, field_name, encrypted_value, sensitive |
| `vault_shares` | Secret sharing (user, team, or org) | secret_id, shared_with_user_id, shared_with_team_id, shared_with_org |
| `agent_feedback` | Agent-submitted feedback | id, user_id, organization_id, content, metadata, status |

### Search & Access Control Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `tool_embeddings` | pgvector semantic search for tools | tool_name, integration_id, embedding (vector 1536), search_text |
| `integration_access_scopes` | Restrict integrations to specific users | organization_id, integration_id |
| `integration_scope_users` | Users allowed for scoped integrations | scope_id, user_id |

### Agent Worker Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `agent_slack_bot_users` | Slack user → Switchboard user mapping | slack_user_id, user_id, api_key, slack_channel_id |
| `agent_sessions` | Agent session tracking | id, user_id, slack_channel_id, slack_thread_ts, status, session_id, transcript |
| `agent_session_workspaces` | Archived workspace storage | session_id, archive_data |

### Key Relationships

- `profiles.organization_id` → `organizations.id` (every user belongs to one org)
- `profiles.role` = platform-level (`admin`/`user`); `profiles.org_role` = org-level (`owner`/`admin`/`member`)
- `api_keys.organization_id` → `organizations.id` (NOT NULL, org-scoped)
- `api_keys.user_id` = creator (audit trail; their connections are used for tool calls)
- `connections` are per-user (OAuth tokens are personal)
- `connections.enabled_tool_groups` — JSON array of enabled tool group keys (null = all enabled)
- `custom_mcp_servers.organization_id` nullable (null = global)
- `teams.organization_id` → `organizations.id`
- `skills.organization_id` → `organizations.id`; `skills.team_id` → `teams.id` (optional)
- `agents.organization_id` → `organizations.id`; `agents.team_id` → `teams.id` (optional)
- `schedules.agent_id` → `agents.id` (optional); `schedules.skill_id` → `skills.id` (optional)
- `files.organization_id` → `organizations.id` (org-scoped); `files.user_id` for user-scoped files
- `integration_access_scopes` → restricts an integration to specific users within an org; org admins/owners bypass

---

## Auth Flows

### 1. Dashboard — Supabase Auth + Google OAuth

Users sign in via Google OAuth through Supabase Auth. The OAuth callback at `/auth/callback` exchanges the code for a session. Middleware at `middleware.ts` refreshes cookies and protects `/mcp` and `/admin` routes.

### 2. Integration OAuth — Per-User Token Exchange

```
User clicks "Connect" on an integration in the dashboard
  → Redirect to provider OAuth consent screen (e.g., Google, Asana, HubSpot, Intercom, Railway)
  → Provider redirects back with authorization code
  → /api/integrations/callback exchanges code for tokens
  → Tokens encrypted with AES-256-GCM, stored in connections table
```

### 3. MCP Endpoint — API Key Auth

```
Admin generates API key in dashboard
  → Raw key shown ONCE (e.g., sk_live_abc123...)
  → SHA-256 hash stored in api_keys table (with scope + expiry + permissions)
  → AI agent includes key in Authorization: Bearer header
  → withMcpAuth hashes incoming key, validates scope + expiry, matches against stored hash
```

### 4. Agent Worker — Slack User Lookup

```
User sends DM to Switchboard Slack bot
  → Bot looks up slack_user_id in agent_slack_bot_users table
  → Retrieves stored API key for that user
  → All MCP tool calls made using the user's API key (their permissions + connections)
```

---

## Security

- **RLS on all tables** — Supabase Row Level Security enforced; service-role client used only for MCP, admin, and public endpoints
- **AES-256-GCM encryption** — OAuth tokens encrypted at rest with unique IV per token. Format: `v1:iv:tag:ciphertext`
- **SHA-256 API key hashing** — Raw keys shown once, only hashes stored
- **API key scopes** — `full`, `read_write`, `read_only` — controls what operations a key can perform
- **API key expiry** — 90-day default expiration; expired keys are rejected
- **API key permissions** — optional per-key permission restrictions
- **Tool risk classification** — Every tool classified as `read`, `write`, or `destructive` with scope-based enforcement
- **Risk-based rate limiting** — Per-user limits by risk level (120 read, 30 write, 5 destructive per minute) + per-org limit (120 req/min)
- **Integration access scopes** — Org admins can restrict specific integrations to a subset of users
- **Tool group preferences** — Per-connection configurable tool categories (e.g., enable only "objects" and "pipelines" for HubSpot)
- **Security headers** — X-Frame-Options DENY, HSTS, CSP, Permissions-Policy (no camera/mic/geo)
- **Stateless MCP** — Per-request handler, no sticky sessions. Horizontally scalable.
- **Token exchange, not passthrough** — MCP bearer token is never forwarded to external APIs. Separately stored OAuth credentials are used.
- **Secrets vault** — AES-256-GCM encrypted per-user secret storage with scoped sharing (user, team, org)
- **Sandboxed agent execution** — Agent worker runs in a Docker container with an unprivileged user; each session gets an isolated workspace

---

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase CLI (`npx supabase init`)
- Google Cloud project with Calendar, Docs, Gmail, Sheets, Drive, and Slides APIs enabled
- Google OAuth 2.0 credentials (Web application type)

### Environment Variables

**`.env.local`** (Next.js app)
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

TOKEN_ENCRYPTION_KEY=your-32-byte-base64-key

# Optional: enables semantic search in discover_tools
OPENAI_API_KEY=your-openai-api-key
```

**`agent-worker/.env`** (Agent worker)
```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SOCKET_TOKEN=xapp-...
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SWITCHBOARD_MCP_URL=http://localhost:3000/api/mcp/streamable-http
ANTHROPIC_API_KEY=your-anthropic-key
```

### Local Development

```bash
# Install dependencies (both packages)
npm install
cd agent-worker && npm install && cd ..

# Start Supabase locally
npx supabase start

# Run migrations
npx supabase db reset

# Start Next.js dev server (with Turbopack)
npm run dev

# Start agent worker (separate terminal)
cd agent-worker && npm run dev
```

App runs at **http://localhost:3000**.

### Test the MCP Endpoint

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer sk_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

### Running Tests

```bash
# Next.js app tests
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report (src/lib + src/app/api)

# Agent worker tests
cd agent-worker && npm test
```

---

## Deployment

**Platform: Railway** (not Vercel)

The Railway project has two services:

1. **Main App** (Next.js) — Railpack builder, Node 20.20.1, port 8080, auto-deploys from `main` (Wait for CI enabled)
2. **Agent Worker** — Dockerfile builder, root dir `agent-worker/`, `npm start`, auto-deploys from `main`

- **Public domain:** `www.get-switchboard.com`
- **Private networking:** `switchboard.railway.internal`
- **Database:** Supabase (external, not Railway Postgres)
- **Env vars:** Managed in the Railway dashboard

---

## License

Private — All rights reserved.
