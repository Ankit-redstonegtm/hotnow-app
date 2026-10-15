# HotNow — Developer Handoff

A build-oriented guide to the HotNow application. Pairs with the code in this repo
(`hotnow-app`). No secrets or account data live here — request credential **values** from
Ankit and use your own Supabase project for local development.

> Active branch is **`mvp-build`** — it has the current app (data workspace, auth, pipeline).
> `main` is older. `git checkout mvp-build` after cloning.

---

## 1. What HotNow is

A B2B SaaS that delivers a small number (≤3/day) of **evidence-backed companies worth
contacting right now** to a seller, identifies the right people there, and drafts the
outreach. The differentiator is **buying situations** — observable events ("opened two new
offices", "new VP of Sales") that imply a reason to buy, each backed by cited evidence.
The product keeps **observed fact** and **inferred relevance** visually distinct everywhere.

## 2. Stack

- **Next.js (App Router)** + React 19, TypeScript. Deployed on **Vercel**.
- **Supabase** — Postgres (app data lives in the **`hotnow`** schema, not `public`), plus
  Supabase Auth (email/password + Google OAuth). **Row-Level Security is on for every
  `hotnow` table**; isolation is per-seller via an `owns_profile(seller_profile_id)` helper.
- **Tailwind** + a small in-repo design system (`src/components/ui/*`, tokens in
  `src/app/globals.css`).
- Tests: **vitest**. Table engine: **@tanstack/react-table v8** (pinned).

## 3. The pipeline (the heart of the product)

Four external providers, chained. Each stage is in `src/lib/`:

1. **Clay — seller research + buying situations.** From a domain, produces the seller
   profile (what they sell) and ~5 buying situations. Entry: `POST /api/seller/intelligence`
   (+ `/status` poll). Code: `src/lib/engine/clay-intelligence.ts`, `src/lib/providers/clay.ts`.
   Gated by `NEXT_PUBLIC_USE_CLAY=true`; a Parallel+Gemini research path is the fallback.
2. **Parallel Task API — discovery.** For an enabled situation, finds companies currently
   experiencing it, with evidence. Async (webhook + polling). Code: `src/lib/discovery/*`
   (`task-discovery.ts`, `worker.ts`, `reconcile.ts`), routes `POST /api/discovery/start`,
   `POST /api/discovery/poll`, `POST /api/discovery/webhook` (HMAC-verified).
3. **Blitz — contacts.** Finds decision-makers at each company and their work emails,
   tiered P1/P2/P3. Code: `src/lib/providers/blitz.ts`, `src/lib/engine/contacts.ts`.
   Routes `POST /api/contacts/source`, `POST /api/contacts/enrich`.
4. **Gemini — outreach.** Drafts evidence-grounded email + LinkedIn + optional follow-up
   sequence. Code: `src/lib/engine/outreach.ts`. Routes `POST /api/outreach/generate`,
   `GET /api/outreach`.

Qualification/selection logic: `src/lib/engine/qualify.ts`, `src/lib/discovery/select-situation.ts`.
Provider-agnostic types: `src/lib/engine/types.ts`.

## 4. Repo layout

```
src/app/                 routes (App Router)
  (marketing)/           public landing
  login, signup          auth (src/components/AuthForm.tsx + AuthShowcase.tsx)
  onboarding/            first-run "studio" (src/components/Onboarding.tsx)
  dashboard/             the product (gated by dashboard/layout.tsx)
    page.tsx             daily briefing
    companies/           companies workspace + [id] opportunity detail
    contacts/            contacts workspace
    lists/ signals/ company-criteria/ contact-criteria/ settings/
  api/                   all server endpoints (see §6)
  dev/                   dev-only component gallery (/dev/ui) + table prototype (/dev/companies)
src/components/          AppShell, OpportunityCard, OutreachPanel, SaveListDialog, ui/*
src/lib/
  db/repo.ts             all DB reads/writes (single source of truth for queries)
  engine/                provider-agnostic business logic
  discovery/             async discovery orchestration
  providers/             clay / parallel / blitz / gemini adapters
supabase/migrations/     0001–0003 (SQL)
```

## 5. Data model (`hotnow` schema, snake_case)

- **seller_profiles** — one per user: `domain, company_name, product_description,
  target_customers, problems_solved, buyer_personas, industries, contact_criteria(jsonb),
  slack_webhook_url, research/situations status`.
- **buying_situations** — `name, description, demand_hypothesis, discovery_objective,
  observable_indicators, evidence_sources, match_conditions, generator, enabled, source('ai'|'user')`.
- **icp_constraints** — company criteria: `geographies, industries, excluded_industries,
  size_min, size_max, daily_target`.
- **companies** — shared across sellers: `normalized_domain (unique), name`.
- **opportunities** — the primary row: `company_id, situation_id, what_happened,
  why_it_matters, confidence, evidence_date, status, first_discovered_at`. Joins to
  companies, buying_situations, evidence.
- **evidence** — `opportunity_id, source_url, source_date, citation(jsonb)`.
- **contacts** — `full_name, title, linkedin_url, priority(P1/P2/P3), email, email_status,
  job_level, job_function, company_id`. (`email_status` is never upgraded to "verified".)
- **lists / list_items** — saved company/contact lists.
- **outreach_drafts** — `opportunity_id, contact_id, channel, subject, body, followups`.
- **opportunity_feedback** — `verdict('useful'|'not_relevant'), reason` (one per opportunity).

## 6. API routes (all auth-gated, per-seller)

`seller`(+`research`,`intelligence`,`/status`), `situations`(+`custom`,`/status`), `icp`,
`settings`, `opportunities`(+`[id]`,`[id]/feedback`), `contacts`(+`source`,`enrich`),
`outreach`(+`generate`), `lists`(+`[id]`,`add`), `slack/send`, `discovery/`(`start`,`poll`,
`webhook`), `cron/discover`, `prewarm`, `auth/signup`. Read each `route.ts` for the exact
request/response shape; `repo.ts` is where they hit the DB.

## 7. Local setup

```bash
git clone https://github.com/Ankit-redstonegtm/hotnow-app.git
cd hotnow-app && git checkout mvp-build
npm install
cp .env.production.example .env.local   # then fill in values
npm run dev    # http://localhost:3000
```

**Required env var NAMES** (get values from Ankit; use your OWN Supabase dev project —
do not point local dev at production):

```
NEXT_PUBLIC_SUPABASE_URL          NEXT_PUBLIC_SUPABASE_ANON_KEY     SUPABASE_SERVICE_ROLE_KEY
HOTNOW_DB_SCHEMA=hotnow           LLM_PROVIDER=parallel             NEXT_PUBLIC_USE_CLAY=true
CLAY_API_KEY   PARALLEL_API_KEY   BLITZ_API_KEY   GEMINI_API_KEY
CRON_SECRET    APP_URL            DAILY_DISCOVERY_ENABLED=false
```

Secrets are gitignored (`.env.local`) — **never commit them** (this repo is public).
Set up the schema in your dev project by applying `supabase/migrations/0001→0003` in order.

## 8. Build / test gates

```bash
npx tsc --noEmit -p tsconfig.json    # types
npx vitest run                       # unit tests
npm run build                        # production build
```

## 9. Cost & safety guardrails (important)

- **`DAILY_DISCOVERY_ENABLED` must stay `false`** unless you intend recurring paid discovery.
  The daily cron (`/api/cron/discover`) is fail-closed and only self-heals runs when the flag
  is off (no provider spend). Manual, user-triggered discovery is separate and always available.
- Per-user daily cost caps live in `src/lib/engine` (`LIMITS`). Clay/Parallel/Blitz/Gemini
  calls cost real money — develop against mocked providers or a single controlled test.

## 10. Deploy

Production (`app.hotnow.co`) runs on Vercel (project `hotnow-app`) and is **owner-operated
via the Vercel CLI** (`vercel --prod`); the GitHub→Vercel auto-deploy is intentionally not
wired. For your own work, use a Vercel preview or local. Coordinate production changes with Ankit.
