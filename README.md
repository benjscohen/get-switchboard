# Switchboard

**One URL. Every tool.** The corporate app store for AI tools via MCP.

Switchboard gives teams a single MCP endpoint that connects any AI agent to the tools they need — starting with deep Google Workspace integrations (Calendar, Docs, Gmail, Sheets). Admins manage integrations, users connect their accounts, and AI agents call tools through a secure, stateless gateway.

---

## Design Philosophy: The Stripe of MCP

Every decision in Switchboard is measured against one question: **would Stripe ship it this way?**

Stripe turned payment infrastructure — one of the most complex, regulated, high-stakes domains in software — into something a solo developer can integrate in an afternoon. That's the bar. Switchboard should do the same for AI tool access.

**What this means in practice:**

- **5-minute time to first tool call.** A developer should go from "I've never heard of Switchboard" to a working MCP endpoint calling Google Calendar in under 5 minutes. Sign up, connect Google, copy the endpoint URL, paste it into Claude/Cursor, done.
- **Progressive complexity, not progressive confusion.** The simple path is obvious. Advanced features (custom MCP servers, org-wide policies, per-user permissions) are there when you need them, invisible when you don't.
- **Beautiful defaults.** Sensible rate limits out of the box. Encryption on by default. Secure by default. The "I didn't configure anything" path should be production-ready, not a security hole.
- **Copy-paste-run.** Endpoint URLs should be clickable. API keys should be one click to generate. Every interaction should respect the developer's time.

---

## Repo Structure

Single Next.js 16 application — no monorepo, no microservices.

```
switchboard/
├── src/
│   ├── app/
│   │   ├── (marketing)/              # Landing page (Navbar + Footer)
│   │   │   └── page.tsx              # Hero, Problem, HowItWorks, Integrations, Pricing, CTA
│   │   ├── (app)/                    # Dashboard (auth-guarded)
│   │   │   ├── dashboard/page.tsx    # Connections, custom MCP servers, API keys
│   │   │   ├── org/page.tsx          # Org settings (admin/owner only)
│   │   │   ├── admin/                # Super-admin panel (users, MCP servers, usage)
│   │   │   └── layout.tsx            # Dashboard layout with auth guard
│   │   ├── login/page.tsx            # Google OAuth login
│   │   ├── auth/callback/route.ts    # OAuth code exchange
│   │   └── api/
│   │       ├── mcp/[transport]/      # MCP endpoint (Streamable HTTP)
│   │       ├── keys/                 # API key CRUD
│   │       ├── integrations/         # OAuth connect/disconnect/callback
│   │       ├── org/                  # Org info, members, domains
│   │       ├── admin/                # Admin: users, MCP servers, stats, usage
│   │       └── waitlist/             # Waitlist signups
│   ├── components/
│   │   ├── sections/                 # Marketing: Hero, Problem, HowItWorks, etc.
│   │   ├── layout/                   # Navbar, Footer
│   │   ├── dashboard/                # ConnectCard, IntegrationList, CustomMcpKeyForm
│   │   ├── admin/                    # StatCard, UsageTable, PermissionsEditor, etc.
│   │   └── ui/                       # Button, Card, Badge, Input, Select, Tabs, etc.
│   ├── lib/
│   │   ├── supabase/                 # server.ts, client.ts, admin.ts
│   │   ├── integrations/             # Registry, tools, schemas per integration
│   │   │   ├── google-calendar/      # 33 tools
│   │   │   ├── google-docs/          # 17 tools
│   │   │   ├── google-gmail/         # 17 tools
│   │   │   ├── google-sheets/        # 16 tools
│   │   │   ├── registry.ts           # Integration registry
│   │   │   ├── catalog.ts            # Builtin + custom MCP catalog
│   │   │   ├── token-refresh.ts      # OAuth token refresh logic
│   │   │   └── types.ts              # IntegrationConfig, CatalogEntry, etc.
│   │   ├── mcp/
│   │   │   └── proxy-client.ts       # Custom MCP server proxy (discover + call)
│   │   ├── api-auth.ts               # requireAuth(), requireAdmin(), requireOrgAdmin()
│   │   ├── crypto.ts                 # API key generation (sk_live_...) + SHA-256 hashing
│   │   ├── encryption.ts             # AES-256-GCM token encryption
│   │   ├── rate-limit.ts             # In-memory rate limiting
│   │   ├── permissions.ts            # Per-user tool permissions (full/custom modes)
│   │   ├── usage-log.ts              # Usage logging (fire-and-forget)
│   │   ├── oauth-state.ts            # OAuth state management
│   │   ├── constants.ts              # Site config, integrations, pricing
│   │   └── utils.ts                  # Shared utilities
│   └── test/
│       └── setup.ts                  # Vitest setup
├── supabase/
│   └── migrations/                   # 6 migration files
├── .github/workflows/
│   └── test.yml                      # CI: runs vitest on PRs
├── middleware.ts                      # Supabase SSR (cookie refresh + route protection)
├── next.config.ts                    # Standalone output + security headers
├── vitest.config.ts                  # Test config (coverage on lib + api)
├── package.json                      # npm, not pnpm
└── tsconfig.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4 |
| **Animation** | Motion (Framer Motion) |
| **Database** | Supabase (Postgres + RLS) via `@supabase/supabase-js` + `@supabase/ssr` |
| **Auth** | Supabase Auth with Google OAuth |
| **MCP** | `mcp-handler` v1.0.7 + `@modelcontextprotocol/sdk` |
| **Google APIs** | `googleapis` v171 |
| **Validation** | Zod 4 |
| **Encryption** | AES-256-GCM (application-level token encryption) |
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
│  │  → Load profile, permissions, connections, org context     │  │
│  │  → Rate limit (120 req/min per org)                        │  │
│  │  → Decrypt stored OAuth tokens (AES-256-GCM)               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ createMcpHandler (per-request, stateless)                  │  │
│  │                                                            │  │
│  │  Builtin tools (83):                                       │  │
│  │    google_calendar_*  (33)   google_docs_*   (17)          │  │
│  │    google_gmail_*     (17)   google_sheets_* (16)          │  │
│  │                                                            │  │
│  │  Custom MCP proxy tools:                                   │  │
│  │    {server_slug}__{tool_name}  (org-scoped)                │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                    │                       │
        ┌───────────┴──────┐    ┌───────────┴──────┐
        ▼                  ▼    ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Supabase     │  │ Google       │  │ Custom MCP   │
│ (Postgres)   │  │ Workspace    │  │ Servers      │
│              │  │ APIs         │  │ (proxied)    │
│ - profiles   │  └──────────────┘  └──────────────┘
│ - api_keys   │
│ - connections│
│ - orgs       │
└──────────────┘
```

### How a Request Flows

1. AI agent sends `POST /api/mcp` with `Authorization: Bearer <api-key>`
2. `withMcpAuth` hashes the key with SHA-256, looks up `api_keys` table
3. Loads user profile (status, permissions), org context, and integration access rules
4. Rate limiter checks per-org quota (120 req/min)
5. Decrypts the user's stored OAuth tokens (AES-256-GCM)
6. `createMcpHandler` routes the tool call to the appropriate integration handler
7. Handler calls the external API (Google, custom MCP server, etc.)
8. Response returned via MCP protocol (Streamable HTTP transport)

---

## Builtin Integrations — 83 Tools

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

create_document, get_document, read_content, search, insert_text, replace_text, delete_content, format_text, format_paragraph, manage_tables, manage_sections, manage_headers_footers, manage_images, manage_named_ranges, manage_tabs, update_document_style, insert_special_element

### Google Gmail (17 tools)

list_messages, get_message, get_attachment, send_message, reply_to_message, forward_message, modify_message, trash_message, batch_modify_messages, list_threads, get_thread, manage_drafts, manage_labels, manage_vacation, manage_filters, get_profile, list_history

### Google Sheets (16 tools)

get_info, create, search, read, write, append, clear, sort_filter, manage_tabs, copy_tab, modify_structure, format, conditional_format, validate, manage_charts, manage_named_ranges

### Custom MCP Server Proxying

Beyond builtin integrations, admins can add custom MCP servers that get proxied through Switchboard:
- **Org-scoped access control** — global servers (null org_id) available to all, org-specific servers restricted to members
- **Shared or per-user API keys** — shared key set by admin, or each user provides their own
- **Automatic tool discovery** — tools discovered from the remote server and namespaced as `{server_slug}__{tool_name}`
- **Unified auth and rate limiting** — all requests go through the same API key auth and rate limiting

---

## Multi-Tenant Architecture

Switchboard uses domain-based organization routing:

- Every user belongs to exactly one organization
- On signup, the `handle_new_user()` trigger extracts the email domain, checks against `personal_email_domains` (gmail.com, etc.), and either matches to an existing org via `organization_domains` or creates a personal org
- Org roles: `owner`, `admin`, `member`
- API keys are org-scoped — they inherit the creating user's connections
- Connections (OAuth tokens) are per-user

---

## Database Schema

Supabase Postgres with Row Level Security on all tables. 6 migration files.

### Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `organizations` | Multi-tenant orgs | id, name, slug, is_personal |
| `organization_domains` | Maps email domains to orgs | organization_id, domain, is_primary |
| `personal_email_domains` | Lookup (gmail.com, etc.) | domain (PK) |
| `profiles` | Users | id, email, name, role, status, permissions_mode, organization_id, org_role |
| `connections` | Encrypted OAuth tokens (per-user) | user_id, integration_id, access_token, refresh_token, expires_at |
| `api_keys` | MCP auth (org-scoped) | user_id, organization_id, key_hash, key_prefix, name |
| `usage_logs` | Tool usage tracking | user_id (text), tool_name, integration_id, status, duration_ms, organization_id |
| `user_integration_access` | Per-user tool permissions | user_id, integration_id, allowed_tools[] |
| `custom_mcp_servers` | Custom MCP server configs | name, slug, server_url, auth_type, shared_api_key, key_mode, organization_id |
| `custom_mcp_tools` | Tools from custom servers | server_id, tool_name, description, input_schema, enabled |
| `custom_mcp_user_keys` | Per-user keys for custom servers | user_id, server_id, api_key |
| `waitlist_entries` | Waitlist signups | email |

### Key Relationships

- `profiles.organization_id` → `organizations.id` (every user belongs to one org)
- `profiles.role` = platform-level (`admin`/`user`); `profiles.org_role` = org-level (`owner`/`admin`/`member`)
- `api_keys.organization_id` → `organizations.id` (NOT NULL, org-scoped)
- `api_keys.user_id` = creator (audit trail; their connections are used for tool calls)
- `connections` are per-user (OAuth tokens are personal)
- `custom_mcp_servers.organization_id` nullable (null = global)

---

## Auth Flows

### 1. Dashboard — Supabase Auth + Google OAuth

Users sign in via Google OAuth through Supabase Auth. The OAuth callback at `/auth/callback` exchanges the code for a session. Middleware at `middleware.ts` refreshes cookies and protects `/dashboard` and `/admin` routes.

### 2. Integration OAuth — Per-User Token Exchange

```
User clicks "Connect" on an integration in the dashboard
  → Redirect to provider OAuth consent screen (e.g., Google)
  → Provider redirects back with authorization code
  → /api/integrations/callback exchanges code for tokens
  → Tokens encrypted with AES-256-GCM, stored in connections table
```

### 3. MCP Endpoint — API Key Auth

```
Admin generates API key in dashboard
  → Raw key shown ONCE (e.g., sk_live_abc123...)
  → SHA-256 hash stored in api_keys table
  → AI agent includes key in Authorization: Bearer header
  → withMcpAuth hashes incoming key, matches against stored hash
```

---

## Security

- **RLS on all tables** — Supabase Row Level Security enforced; service-role client used only for MCP, admin, and public endpoints
- **AES-256-GCM encryption** — OAuth tokens encrypted at rest with unique IV per token. Format: `v1:iv:tag:ciphertext`
- **SHA-256 API key hashing** — Raw keys shown once, only hashes stored
- **Rate limiting** — 120 req/min per organization (in-memory)
- **Security headers** — X-Frame-Options DENY, HSTS, CSP, Permissions-Policy (no camera/mic/geo)
- **Stateless MCP** — Per-request handler, no sticky sessions. Horizontally scalable.
- **Token exchange, not passthrough** — MCP bearer token is never forwarded to external APIs. Separately stored OAuth credentials are used.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase CLI (`npx supabase init`)
- Google Cloud project with Calendar, Docs, Gmail, and Sheets APIs enabled
- Google OAuth 2.0 credentials (Web application type)

### Environment Variables

**`.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

TOKEN_ENCRYPTION_KEY=your-32-byte-base64-key
```

### Local Development

```bash
# Install dependencies
npm install

# Start Supabase locally
npx supabase start

# Run migrations
npx supabase db reset

# Start dev server (with Turbopack)
npm run dev
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
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report (src/lib + src/app/api)
```

---

## Progressive Disclosure of Tools

As the tool count grows (83 builtin + custom), token cost and tool-selection accuracy become concerns — each tool definition is ~400-500 tokens, and LLMs lose accuracy past ~30 tools in a flat list.

**Today, this is largely a solved problem on the client side.** Claude Code already implements `ToolSearch` with deferred loading. The Claude API supports `defer_loading: true` per tool. As the MCP ecosystem matures, more clients will follow.

**Our stance:** Don't over-engineer server-side progressive disclosure while clients are solving this. If we hit a point where dumb clients (no built-in tool search) are a significant user segment, we'll add a `find_tools` meta-tool with semantic search and schema-on-demand. Until then, we focus on making each tool definition as clean and well-documented as possible so client-side discovery works well.

---

## License

Private — All rights reserved.
