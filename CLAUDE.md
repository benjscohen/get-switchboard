# Switchboard — Agent Context

## Deployment

**Platform: Railway** (not Vercel)

### Railway Project — Two Services

#### 1. Main App (Next.js)
- **Builder:** Railpack (auto-detected)
- **Node version:** 20.20.1
- **Port:** 8080
- **Auto-deploy:** from `main` branch
- **Wait for CI:** enabled
- **Public domain:** `www.get-switchboard.com`
- **Private networking:** `switchboard.railway.internal`

#### 2. Agent Worker
- **Builder:** Dockerfile
- **Root directory:** `agent-worker/`
- **Start command:** `npm start`
- **Auto-deploy:** from `main` branch

### Database
- **Supabase** (external) — not Railway Postgres
- Connection details are in Railway env vars

### Environment Variables
- Managed in the **Railway dashboard** (not `.env` files in production)
- Local dev uses `.env.local`

## Tech Stack
- Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Supabase (Auth + PostgreSQL + RLS)
- MCP server via `mcp-handler`

## Key Conventions
- See `.claude/projects/.../memory/MEMORY.md` for detailed architecture notes
- DB columns are snake_case; API responses use camelCase
- RLS is enabled on all tables
- Service-role client (`supabaseAdmin`) is only for MCP, admin, and public API endpoints
