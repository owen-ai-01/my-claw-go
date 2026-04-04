# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `pnpm dev` - Start development server (runs with 4GB memory allocation)
- `pnpm build` / `pnpm start` - Build and serve production
- `pnpm lint` / `pnpm format` - Biome linter and formatter

### Database (Drizzle ORM)
- `pnpm db:generate` - Generate migration files from schema changes
- `pnpm db:migrate` - Apply pending migrations
- `pnpm db:push` - Sync schema directly (dev only)
- `pnpm db:studio` - Open Drizzle Studio UI

### Other Scripts
- `pnpm chat-proxy:start` - Start the chat gateway proxy (bridge server)
- `pnpm email` - Email template dev server on port 3333
- `pnpm content` - Process MDX content collections
- `pnpm list-users` / `pnpm list-contacts` - Admin CLI tools
- `pnpm fix-payments` / `pnpm fix-payments-scene` - Payment repair scripts

## Architecture Overview

This is a Next.js 15 multi-agent SaaS platform ("OpenClaw") where users configure AI agents, organize them into groups, and run relay-style conversations. The app has two major runtime components:

### 1. Next.js Web App (`src/`)
Standard App Router SaaS with auth, payments, and a dashboard UI.

**Key directories:**
- `src/app/[locale]/` - Internationalized routing (en/zh). Route groups: `(marketing)`, `(protected)`, `docs`
- `src/actions/` - Next.js Server Actions (use `next-safe-action` for validated forms)
- `src/db/schema.ts` - All Drizzle table definitions
- `src/config/website.tsx` - Site-wide config including pricing tiers
- `src/lib/myclawgo/` - Core business logic: model router, billing, membership checks
- `src/stores/` - Zustand client state
- `src/payment/` - Stripe subscription + one-time + credit package logic
- `src/credits/` - Per-user credit balance and transaction system
- `src/mail/templates/` - React Email templates

### 2. Bridge Server (`bridge/`)
A separate **Fastify** server that acts as an orchestration layer between the web app and a local OpenClaw gateway (WebSocket at `ws://127.0.0.1:18789`). It is **not** part of the Next.js build.

**Key bridge routes:** `/agents`, `/chat`, `/groups`, `/tasks`, `/activity`, `/config`, `/logs`, `/health`

**Core bridge services:**
- `bridge/src/services/openclaw.ts` - Gateway communication: device identity, chat send, agent wait, history
- `bridge/src/services/agent.ts` - Agent lifecycle and memory management
- `bridge/src/services/group.ts` - Group CRUD; persists to `myclawgo-groups.json`
- `bridge/src/services/task.ts` - Task queue management
- `bridge/src/services/chat-store.ts` - Chat transcript persistence to local filesystem

## Key Architectural Patterns

### Group Chat & Relay Orchestration
Groups have a **leader** and multiple members. When a human sends a message, the leader responds first. The leader (or any member) can handoff to another member via `@agentId` mention. The bridge auto-chains these handoffs ("relay mode") up to a configurable `maxTurns`.

Relay loop guards (`groupRelayControl` Map by runId) prevent self-mentions and infinite cycles. Stop commands (`#stop`, `#pause`, `/stop-relay`) and Chinese patterns (`继续@`, `随机@`, `接龙`) are recognized. Server-side mention normalization whitelists only valid group members and falls back to leader on invalid mentions.

**Implementation:** `bridge/src/routes/chat.ts` + `bridge/src/services/group.ts`

### Model Router (L1/L2/L3)
Rule-based classifier in `src/lib/myclawgo/model-router.ts` with zero LLM overhead:
- **L1** (fast/cheap): Short greetings, acknowledgments → Gemini 2.0 Flash
- **L2** (specialized): Code review → Claude Haiku; Chinese content → DeepSeek-V3
- **L3** (powerful): Architecture, tool-heavy, long context → Claude Sonnet 4.6 / Gemini Pro

Configurable via `MYCLAWGO_ROUTER_L*_MODEL` env vars. User model overrides are respected. All messages route through the bridge to preserve agent memory and tools.

### Billing Audit Pattern
Every chat message has a `userChatBillingAudit` record tracking: input/output tokens, cache reads, credits deducted, and provider cost. The `source` field distinguishes `actual` (from provider response), `estimated`, or `fallback`. The `metaJson` JSONB field holds provider-specific extras. This enables per-model cost accounting.

### Membership & Access Control
- `checkUserMembership()` - checks for active subscription or lifetime payment
- `checkUserCredits()` - returns balance for credit-gated features
- Applied at API route level; fail-open on DB errors to avoid blocking users

### Payment System
Three Stripe payment scenes (stored in `payment.scene`):
1. **lifetime** - one-time permanent access
2. **subscription** - recurring monthly/yearly with trial
3. **credit** - one-time credit package purchase

Pricing tiers: Free, Pro ($29.90/mo), Premium ($59.90/mo), Ultra ($199.90/mo) plus credit packages ($9.90–$99.90).

## Database Schema Key Tables
- `user`, `session`, `account`, `verification` - Better Auth tables
- `userAgent` - Agent configs per user (name, slug, isDefault)
- `userAgentTelegramBot` - Telegram bot bindings with encrypted tokens
- `userChannelBinding` - External platform bindings
- `userChatMessage` / `userChatTask` - Chat history and task lifecycle
- `userChatBillingAudit` - Per-message cost tracking
- `payment` / `userCredit` / `creditTransaction` - Billing and credits

## AI Provider Stack
Uses Vercel AI SDK v5 (`ai` package) with providers: OpenAI, Google Gemini, DeepSeek, Fireworks, FAL, OpenRouter, Replicate. Image generation, video (Shotstack, Replicate), and audio are supported. Provider selection flows through the model router.

## Conventions
- TypeScript everywhere; path alias `@/*` maps to `src/*`
- Biome: single quotes, trailing commas, semicolons, 80-char line width, 2-space indent
- Server actions use `next-safe-action` with Zod schemas
- Zustand for all client-side state
- Database changes always via Drizzle migrations (`db:generate` then `db:migrate`)
- Bridge auth via `BRIDGE_TOKEN` env var (checked on every bridge request)

## Configuration Files
- `src/config/website.tsx` - Site name, pricing, feature flags
- `env.example` - All required environment variables
- `drizzle.config.ts` - Database connection config
- `biome.json` - Linting rules (ignores: db migrations, generated UI components, payment type files)
- `tsconfig.json` - Excludes `bridge/` from Next.js build
