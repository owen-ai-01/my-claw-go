# CODEBUDDY.md This file provides guidance to CodeBuddy Code when working with code in this repository.

## Development Commands
- pnpm dev — Start Next.js dev server (content, i18n enabled)
- pnpm build — Build the app and content collections
- pnpm start — Start production server
- pnpm lint — Biome linter (write mode)
- pnpm lint:fix — Biome auto-fix (unsafe)
- pnpm format — Biome formatter (write mode)
- pnpm db:generate — Generate Drizzle migrations from schema
- pnpm db:migrate — Apply migrations
- pnpm db:push — Push schema directly (dev only)
- pnpm db:studio — Open Drizzle Studio
- pnpm content — Process MDX content (Fumadocs)
- pnpm email — Email template dev server on port 3333
- pnpm preview — Build+preview via opennextjs-cloudflare
- pnpm deploy — Build+deploy via opennextjs-cloudflare
- pnpm upload — Build+upload static via opennextjs-cloudflare
- pnpm cf-typegen — Wrangler type generation for Cloudflare Env
- pnpm knip — Unused code/exports analysis

Utility scripts:
- pnpm list-contacts — Run scripts/list-contacts.ts
- pnpm list-users — Run scripts/list-users.ts
- pnpm fix-payments — Run scripts/fix-payments.ts
- pnpm fix-payments-scene — Run scripts/fix-payments-scene.ts

Testing:
- No test runner is configured; there are no test scripts. Running a single test is not applicable.

## High-Level Architecture

### Framework & Routing
- Next.js 15 (App Router) with next-intl for i18n. Locale-aware routes live under src/app/[locale]/...
- Route groups:
  - (marketing): landing, blog, pricing, docs entry points.
  - (protected): dashboard, settings, payment, admin.
- Middleware and route helpers at src/middleware.ts and src/routes.ts.

### Data & Persistence
- PostgreSQL via Drizzle ORM.
  - Config: drizzle.config.ts:1-19
  - Schema: src/db/schema.ts (users, sessions, accounts, verifications, payments, credits, credit transactions).
  - Migrations output: src/db/migrations/*.sql
- Run db changes via pnpm db:generate then pnpm db:migrate. Use pnpm db:push for dev-only sync.

### Authentication
- better-auth with PostgreSQL adapter and social providers (GitHub, Google). Secrets and OAuth IDs in env.example.

### Payments & Credits
- Stripe integration for subscriptions, lifetime purchases, and credit packages.
- Customer portal and credits system under src/payment and src/credits; payment records and credit transactions modeled in schema.

### Content & Docs
- Fumadocs for docs; MDX content in content/ with processing via fumadocs-mdx (postinstall and pnpm content).
- Docs route under src/app/[locale]/docs/[[...slug]].

### Email
- react-email templates under src/mail/templates with local preview server (pnpm email) on port 3333.

### UI & State
- Radix UI components and TailwindCSS 4.
- Shared components under src/components/* (some vendored libraries excluded from lint via biome.json).
- Client state via Zustand; runtime validation via Zod.

### Integrations
- S3-compatible storage via s3mini; configure Cloudflare R2 or S3 in env.example.
- Analytics via multiple providers (Google, Umami, OpenPanel, Plausible, Ahrefs, Seline, DataFast, PostHog).
- AI features via ai SDK providers (OpenAI, Google, Replicate, Fireworks, FAL, DeepSeek, OpenRouter) with keys in env.example.

## Configuration & Conventions
- next.config.ts: wraps next-intl and Fumadocs MDX; sets dev-friendly CSP headers; optional standalone output for DOCKER_BUILD; image remotePatterns and unoptimized toggle.
- drizzle.config.ts: loads Next.js env, uses DATABASE_URL, outputs migrations to src/db/migrations.
- tsconfig.json: path aliases @/* → src/*, @/content/* → content/*, @/public/* → public/*.
- Biome (biome.json): formatter and linter with extensive ignore patterns. Use pnpm lint/format.
- Package manager: pnpm.
- Environment: env.example documents all required keys (NEXT_PUBLIC_BASE_URL, DATABASE_URL, auth providers, Resend, Stripe, storage, analytics, captcha, notifications, AI, Firecrawl). Copy to .env and fill.

## Operational Notes from CLAUDE.md
- Use TypeScript throughout; follow Biome formatting.
- Server actions under src/actions; use next-safe-action for secure submissions.
- Internationalization: next-intl with [locale] routing; translation messages under messages/ (en/zh/ja).

## Quick Pointers
- Marketing pages, blog, pricing under src/app/[locale]/(marketing)/...
- Protected areas (dashboard, settings, payment, admin) under src/app/[locale]/(protected)/...
- Middleware and route helpers at src/middleware.ts and src/routes.ts.