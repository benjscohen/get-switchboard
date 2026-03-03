# Switchboard

**One URL. Every tool.** The corporate app store for AI tools via MCP.

Switchboard gives teams a single MCP endpoint that connects any AI agent to the tools they need — starting with an exhaustive Google Calendar integration. Admins manage integrations, users connect their accounts, and AI agents call tools through a secure, stateless gateway.

---

## Repo Structure

The root of this repo is a **Next.js 16 landing page** (already built). The product lives in `app/` as a Turborepo monorepo:

```
switchboard/
├── src/                          # Landing page (EXISTING, Next.js 16)
│   ├── app/page.tsx              # Hero, Problem, HowItWorks, Integrations, Pricing, CTA
│   ├── app/layout.tsx            # Root layout with Navbar + Footer
│   ├── app/api/waitlist/         # Waitlist API endpoint
│   ├── components/sections/      # Hero, Problem, HowItWorks, etc.
│   ├── components/layout/        # Navbar, Footer
│   ├── components/ui/            # Button, Card, Badge, Input, etc.
│   └── lib/                      # Utils, fonts, constants
├── package.json                  # Root — Turborepo workspace root
├── pnpm-workspace.yaml           # Workspace definitions
├── turbo.json                    # Turborepo config
│
├── app/
│   ├── admin/                    # Next.js admin console
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── app/              # App Router pages
│   │   │   │   ├── (auth)/       # Login, signup, callback
│   │   │   │   ├── (dashboard)/  # Dashboard, integrations, members, connect
│   │   │   │   └── api/          # OAuth callbacks, Stripe webhooks
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── Dockerfile
│   │
│   └── mcp-gateway/              # Express MCP gateway
│       ├── package.json
│       ├── src/
│       │   ├── index.ts          # Express entry point
│       │   ├── middleware/       # Auth, org-resolver, rate-limit
│       │   ├── integrations/
│       │   │   └── google-calendar/
│       │   │       ├── tools.ts          # All tool definitions
│       │   │       ├── handlers/         # One handler per tool (~25 handlers)
│       │   │       ├── schemas.ts        # Zod schemas
│       │   │       └── client.ts         # Google Calendar API wrapper
│       │   └── lib/              # Supabase client, token manager, crypto
│       └── Dockerfile
│
├── packages/
│   ├── db/                       # Shared database types & queries
│   ├── shared/                   # Shared types, constants, crypto utils
│   └── tsconfig/                 # Shared TS configs
│
└── supabase/
    ├── config.toml
    ├── seed.sql
    └── migrations/
        ├── 00001_initial_schema.sql
        ├── 00002_rls_policies.sql
        └── 00003_functions.sql
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Landing Page** | Next.js 16, React 19, Tailwind 4, Motion (existing, root) |
| **Admin Console** | Next.js 15 (App Router), React 19, shadcn/ui, Tailwind |
| **MCP Gateway** | Express 5, `@modelcontextprotocol/sdk`, `googleapis` |
| **Database** | Supabase (Postgres + Auth + RLS) |
| **Auth** | Supabase Auth (console) + Google OAuth (Calendar) + API keys (MCP) |
| **Encryption** | AES-256-GCM (application-level token encryption) |
| **Deployment** | Railway (admin + gateway services) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  AI Agent (Claude, GPT, etc.)                                    │
│  Sends: POST /mcp  +  Authorization: Bearer <api-key>           │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  MCP Gateway (Express 5)                                         │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Auth         │→│ Org Resolver  │→│ Rate Limiter            │  │
│  │ Middleware   │  │ (slug→org)   │  │ (per-key, per-user)    │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ McpServer (per-request, stateless)                         │  │
│  │                                                            │  │
│  │  google_calendar_*  (33 tools)                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Token Manager: decrypt stored OAuth token → call Google API     │
└──────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            ┌──────────────┐       ┌──────────────┐
            │ Supabase     │       │ Google        │
            │ (Postgres)   │       │ Calendar API  │
            │              │       │ v3            │
            │ - orgs       │       └──────────────┘
            │ - tokens     │
            │ - api_keys   │
            └──────────────┘
```

### How a Request Flows

1. AI agent sends `POST /{org-slug}/mcp` with `Authorization: Bearer <api-key>`
2. Auth middleware hashes the key with SHA-256, looks up `api_keys` table
3. Org resolver maps the slug to the organization and loads enabled integrations
4. Rate limiter checks per-key and per-user quotas
5. `McpServer` instantiated per-request (stateless Streamable HTTP transport)
6. Tool handler decrypts the user's stored Google OAuth token (AES-256-GCM)
7. Handler calls Google Calendar API v3 with the decrypted token
8. Response returned via MCP protocol

---

## MCP OAuth Best Practices

### 1. Token Exchange, NOT Token Passthrough

The MCP spec explicitly warns against the "confused deputy" anti-pattern. Switchboard:
- Receives an MCP bearer token (API key) and validates it
- Uses **separately stored** Google OAuth credentials to call the Calendar API
- The MCP token is **never** forwarded to Google

### 2. Stateless Streamable HTTP Transport

Each request is independent — no sticky sessions, no session store. Per-request `McpServer` instantiation. Horizontally scalable behind any load balancer.

### 3. Application-Level Token Encryption

Google OAuth tokens are encrypted with AES-256-GCM before storage. The encryption key lives in environment variables, never in the database. Each token gets a unique IV.

### 4. Rate Limiting Per API Key

Critical for MCP servers — LLMs aggressively retry tool calls. Per-token rate limiting with circuit breaker patterns prevent runaway costs.

### 5. Protected Resource Metadata (RFC 9728) — v0.2 Upgrade Path

`/.well-known/oauth-protected-resource` endpoint to advertise authorization server locations. The v0.1 API-key approach provides a clean upgrade path to full MCP OAuth 2.1.

---

## Google Calendar Tools — Complete Reference

33 MCP tools covering all 44 Google Calendar API v3 methods across 8 resource types.

### Events (14 tools)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_list_events` | Events.list | List events with filtering (date range, calendar, query, pagination) |
| `google_calendar_get_event` | Events.get | Get full event details |
| `google_calendar_create_event` | Events.insert | Create event (attendees, location, recurrence, reminders, Google Meet, attachments, all-day, focus time, out-of-office, working location) |
| `google_calendar_update_event` | Events.update | Full event update |
| `google_calendar_patch_event` | Events.patch | Partial event update (change just one field) |
| `google_calendar_delete_event` | Events.delete | Delete event with notification control |
| `google_calendar_move_event` | Events.move | Move event to a different calendar |
| `google_calendar_quick_add` | Events.quickAdd | Create event from natural language ("Lunch with Bob Tuesday at noon") |
| `google_calendar_import_event` | Events.import | Import a private copy of an existing event (iCal) |
| `google_calendar_list_recurring_instances` | Events.instances | List all occurrences of a recurring event |
| `google_calendar_rsvp` | Events.patch | Accept/decline/tentative an event invitation |
| `google_calendar_search_events` | Events.list (q) | Full-text search across events |
| `google_calendar_watch_events` | Events.watch | Set up push notifications for event changes |
| `google_calendar_batch_events` | Batch API | Batch create/update/delete multiple events |

### Calendars (6 tools)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_list_calendars` | CalendarList.list | List all calendars the user has access to |
| `google_calendar_get_calendar` | Calendars.get | Get calendar metadata (name, timezone, etc.) |
| `google_calendar_create_calendar` | Calendars.insert | Create a new secondary calendar |
| `google_calendar_update_calendar` | Calendars.update | Update calendar metadata |
| `google_calendar_delete_calendar` | Calendars.delete | Delete a secondary calendar |
| `google_calendar_clear_calendar` | Calendars.clear | Delete ALL events from primary calendar |

### Calendar List / Personalization (4 tools)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_get_calendar_entry` | CalendarList.get | Get personalized calendar entry (colors, visibility) |
| `google_calendar_update_calendar_entry` | CalendarList.patch | Update calendar colors, visibility, default reminders |
| `google_calendar_add_calendar` | CalendarList.insert | Add an existing calendar to the user's list |
| `google_calendar_remove_calendar` | CalendarList.delete | Remove calendar from the user's list |

### Sharing & Permissions (4 tools)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_list_sharing_rules` | ACL.list | List all sharing rules for a calendar |
| `google_calendar_share_calendar` | ACL.insert | Share calendar with user/group/domain (set access level) |
| `google_calendar_update_sharing` | ACL.update | Change sharing permissions |
| `google_calendar_unshare_calendar` | ACL.delete | Remove sharing access |

### Availability (1 tool)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_find_free_busy` | Freebusy.query | Query free/busy across multiple calendars and users |

### Settings (2 tools)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_get_settings` | Settings.list | Get all user settings (timezone, date format, week start, etc.) |
| `google_calendar_get_setting` | Settings.get | Get a specific setting value |

### Colors (1 tool)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_get_colors` | Colors.get | Get available color palette for events and calendars |

### Notifications (1 tool)

| Tool | API Method | Description |
|---|---|---|
| `google_calendar_stop_watching` | Channels.stop | Stop a push notification channel |

### Key Event Features Supported

- **All event types**: Default, Focus Time, Out of Office, Working Location, Birthday
- **Recurrence**: Full RFC 5545 support (RRULE, RDATE, EXDATE)
- **Conference data**: Google Meet link creation
- **Attachments**: Google Drive file attachments
- **Extended properties**: Custom metadata (private and shared)
- **Attendee management**: Add/remove attendees, optional flag, additional guests
- **Reminders**: Custom overrides (email/popup, up to 5 per event)
- **Visibility/transparency**: Public/private, busy/free
- **Natural language**: QuickAdd for creating events from plain text

---

## Database Schema

6 core tables in Supabase (Postgres) with Row Level Security on all tables.

### `organizations`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | Display name |
| slug | text | Unique, used in MCP URL (`/{slug}/mcp`) |
| plan | text | `free`, `pro`, `enterprise` |
| stripe_customer_id | text | Nullable |
| created_at | timestamptz | |

### `organization_members`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK → organizations |
| user_id | uuid | FK → auth.users |
| role | text | `admin`, `member` |
| created_at | timestamptz | |

### `integrations`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| slug | text | `google-calendar` |
| name | text | Display name |
| description | text | |
| icon_url | text | |
| oauth_scopes | text[] | Required scopes |

Seeded with `google-calendar` for v0.1.

### `organization_integrations`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK → organizations |
| integration_id | uuid | FK → integrations |
| enabled | boolean | |
| created_at | timestamptz | |

### `user_oauth_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| organization_id | uuid | FK → organizations |
| integration_id | uuid | FK → integrations |
| encrypted_access_token | text | AES-256-GCM encrypted |
| encrypted_refresh_token | text | AES-256-GCM encrypted |
| iv | text | Unique initialization vector |
| token_expires_at | timestamptz | |
| scopes | text[] | Granted scopes |
| created_at | timestamptz | |

### `api_keys`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK → organizations |
| user_id | uuid | FK → auth.users (who created it) |
| key_hash | text | SHA-256 hash (raw key shown once) |
| name | text | Human-readable label |
| last_used_at | timestamptz | |
| expires_at | timestamptz | Nullable |
| created_at | timestamptz | |

---

## Auth Flows

### 1. Admin Console — Supabase Auth

Standard email/password or Google social login via Supabase Auth. Handles session management, password reset, etc.

### 2. Google Calendar OAuth — Per-User Token Exchange

```
User clicks "Connect Google Calendar" in admin console
  → Redirect to Google OAuth consent screen
  → access_type: 'offline', prompt: 'consent', PKCE enabled
  → Google redirects back with authorization code
  → Server exchanges code for access + refresh tokens
  → Tokens encrypted with AES-256-GCM
  → Stored in user_oauth_tokens table
```

### 3. MCP Endpoint — API Key Auth

```
Admin generates API key in console
  → Raw key shown ONCE (e.g., sk_live_abc123...)
  → SHA-256 hash stored in api_keys table
  → AI agent includes key in Authorization header
  → Gateway hashes incoming key, matches against stored hash
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase CLI (`npx supabase init`)
- Google Cloud project with Calendar API enabled
- Google OAuth 2.0 credentials (Web application type)

### Environment Variables

**`app/admin/.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
```

**`app/mcp-gateway/.env`**
```env
PORT=4000
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

TOKEN_ENCRYPTION_KEY=your-32-byte-hex-key
```

### Local Development

```bash
# Install dependencies
pnpm install

# Start Supabase locally
npx supabase start

# Run migrations
npx supabase db reset

# Start all services (landing page, admin, gateway)
pnpm dev
```

| Service | URL |
|---|---|
| Landing page | http://localhost:3000 |
| Admin console | http://localhost:3001 |
| MCP gateway | http://localhost:4000 |

### Test the MCP Endpoint

```bash
curl -X POST http://localhost:4000/your-org-slug/mcp \
  -H "Authorization: Bearer sk_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

---

## Implementation Phases

### Phase 1 — Foundation
- Turborepo monorepo setup with pnpm workspaces
- `pnpm-workspace.yaml` and `turbo.json`
- Supabase project initialization
- Database migrations (all 6 tables + RLS policies)
- Shared packages (`packages/db`, `packages/shared`, `packages/tsconfig`)

### Phase 2 — Admin Console Auth & Org
- Next.js app in `app/admin/`
- Supabase Auth (login, signup, password reset)
- Organization CRUD (create, invite members, manage roles)
- Dashboard layout with sidebar navigation

### Phase 3 — Integrations & OAuth
- Google Calendar OAuth flow (consent → token exchange → encrypted storage)
- Token encryption/decryption utilities (AES-256-GCM)
- API key generation and management UI
- "Connect" page showing integration status

### Phase 4 — MCP Gateway Core
- Express 5 app in `app/mcp-gateway/`
- Auth middleware (API key validation via SHA-256 hash lookup)
- Org resolver middleware (slug → organization)
- Rate limiting middleware (per-key, per-user)
- MCP SDK integration (Streamable HTTP transport, per-request `McpServer`)
- Token manager (decrypt stored OAuth tokens for API calls)

### Phase 5 — Google Calendar Tools
- All 33 tool definitions with Zod input schemas
- Handler implementations (one file per handler group)
- Google Calendar API v3 client wrapper
- End-to-end testing with real Google Calendar

### Phase 6 — Deployment
- Dockerfiles for admin console and MCP gateway
- Railway configuration (two services)
- Custom domain + DNS setup
- Production rate limiting and error handling
- Audit logging

### Phase 7 — Stripe (Deferrable)
- Billing integration
- Plan enforcement
- Usage metering

---

## Deployment

Both services deploy to Railway as separate containers.

```
Railway Project: switchboard
├── Service: admin    (app/admin/Dockerfile)     → admin.switchboard.dev
├── Service: gateway  (app/mcp-gateway/Dockerfile) → api.switchboard.dev
└── Service: supabase (managed)                  → db.switchboard.dev
```

### MCP Endpoint URL Pattern

```
https://api.switchboard.dev/{org-slug}/mcp
```

Each organization gets a unique slug. AI agents configure this single URL to access all enabled integrations.

---

## License

Private — All rights reserved.
