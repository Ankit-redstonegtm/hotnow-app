# HotNow — Developer Handoff

Canonical onboarding doc for a developer taking over HotNow. Pairs with
[`mvp-architecture.md`](./mvp-architecture.md) (architecture/execution plan) and
[`launch-checklist.md`](./launch-checklist.md) (env vars, deploy sequence, smoke tests, rollback).

Last updated: 2026-10-15. Live branch: `mvp-build`.

## Table of contents
1. What it is
2. Repos & stack
3. Repo layout
4. Local development
5. The engine pipeline (A–F)
6. Data model
7. API routes
8. Background jobs & scheduling
9. Cost controls & observability
10. Deployment
11. Environment variables
12. Testing
13. Known issues & roadmap
14. Gotchas

---

## 1. What it is
A self-serve B2B SaaS "AI prospecting employee." A seller signs up with their domain; HotNow
researches their business, generates **buying situations** (observable, dated events that create
a reason to buy now), discovers companies currently in those situations, finds decision-makers,
and drafts personalized outreach. The output is an evidence-backed **opportunity**: company +
why-now + sources + contacts + email/LinkedIn drafts. No email sending — the user copies drafts.

## 2. Repos & stack
- **`hotnow-website/`** — Astro static marketing site → **hotnow.co**. Single domain-capture CTA
  that hands off to `app.hotnow.co/signup?domain=...`. (Not redesigned recently.)
- **`app/`** — **Next.js 16** (App Router, React 19, Tailwind v4) → **app.hotnow.co**.
  GitHub: `Ankit-redstonegtm/hotnow-app`.
- **Supabase** Postgres — project "RedstoneGTM Prospecting IQ" (`vsxgszlevcygijgulnzm`), schema
  **`hotnow`**, RLS on every table, Supabase Auth (email/password + Google OAuth).
- **Vercel** hosting. Deploys via **`vercel --prod` CLI** from the working tree (the reliable path
  used historically) — NOT git-push auto-deploy. Live code = `mvp-build`; `main` lags behind.
- Providers:
  - **Parallel.ai** (`api.parallel.ai`, `PARALLEL_API_KEY`): Task API (research), FindAll API
    (discovery), Search API (domain resolution). Called via raw `fetch` in `src/lib/providers/parallel.ts`.
  - **Google Gemini** (`@google/genai`, `GEMINI_API_KEY`): model `gemini-3.8-flash`, used for
    situation generation + outreach. Provider abstraction in `src/lib/llm/` (swappable: gemini → anthropic → parallel).
  - **Blitz** (`api.blitz-api.ai`, `BLITZ_API_KEY`): contact sourcing + email enrichment.

## 3. Repo layout (`app/src`)
```
app/
  vercel.json                 daily cron → /api/cron/discover
  supabase/migrations/        0001 email_status, 0002 outreach_drafts, 0003 opportunity_feedback
  docs/                       HANDOFF.md, mvp-architecture.md, launch-checklist.md
  src/
    app/
      (marketing) page.tsx, login/, signup/, auth/callback/
      onboarding/             → components/Onboarding.tsx (domain → company → contacts → signals)
      dashboard/              home (page.tsx), companies/, companies/[id]/ (detail),
                              contacts/, lists/, signals/, company-criteria/, contact-criteria/, settings/
      admin/                  owner-only spend/usage console (email allowlist)
      api/                    see §7
    components/
      AppShell.tsx, Onboarding.tsx, OpportunityCard.tsx, OutreachPanel.tsx
      ui/                     Toast, Badge, CopyButton, EmptyState, Spinner, CompanyAvatar
    lib/
      engine/                 seller.ts · situations.ts · discovery.ts · qualify.ts · contacts.ts · outreach.ts · config.ts · types.ts · index.ts
      providers/              parallel.ts · blitz.ts
      llm/                    index.ts · gemini.ts · anthropic.ts
      discovery/              worker.ts (idempotent ingest) · reconcile.ts · plan.ts (daily caps)
      db/                     repo.ts (all persistence)
      supabase/               server.ts · client.ts · admin.ts (service role) · schema.ts
      ratelimit.ts · log.ts · admin.ts · auth-helpers.ts · util/domain.ts · csv.ts
```

## 4. Local development
```
cd app
npm install
# create .env.local with the vars in §11 (ask the founder for keys)
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run test       # vitest (unit tests, providers mocked — no spend)
npm run build      # next build
```
Note: in local dev the discovery webhook URL can't be reached, so discovery results ingest only
via in-session polling (keep a dashboard tab open). No ESLint is configured.

## 5. The engine pipeline (A–F) — `src/lib/engine/`
Input is just the seller's domain. Orchestrated by `index.ts`; persistence layered in `db/repo.ts`.

| Stage | File | Provider | What | Latency / cost |
|---|---|---|---|---|
| A Research | `seller.ts` | Parallel Task (`core`) | domain → SellerProfile (product, customers, personas, industries) | ~60s / ~$0.025 |
| B Situations | `situations.ts` | Gemini | profile → ~5 buying situations (buyer-centric objective that EXCLUDES vendors; match conditions incl. end-operator + recency) | ~15s / negligible |
| C/D Discovery | `discovery.ts` | Parallel FindAll + Search | per enabled situation, find companies matching NOW; resolve to real domain | **6–10 min / $0.25 + $0.03·match** |
| E/F Qualify | `qualify.ts` | deterministic | keep matched candidates w/ fresh cited evidence; split FACT (`what_happened`) vs INTERPRETATION (`why_it_matters`); undated evidence kept but capped to low confidence | fast |
| Contacts | `contacts.ts` | Blitz | domain → company LinkedIn → decision-makers, tiered P1/P2/P3; email status found/none/unknown (never falsely "verified") | per-company |
| Outreach | `outreach.ts` | Gemini | opportunity+contact → evidence-grounded email + LinkedIn (+ optional 3-touch); never invents facts | ~$0.001 |

Dedup is **seller + company** (one company once per seller, strongest-evidence-wins), enforced in
`repo.ts::upsertOpportunity` with the DB `UNIQUE(seller,company,situation)` as a backstop.

## 6. Data model (schema `hotnow`)
Root is `seller_profiles` (one per auth user); all seller-owned tables cascade from it.
- `seller_profiles` — profile + research/situation status + `slack_webhook_url` + `contact_criteria`.
- `buying_situations` — situations (name, demand_hypothesis, discovery_objective, match_conditions, enabled, generator, source).
- `icp_constraints` — geos, industries, size, daily_target (1:1 with profile).
- `discovery_runs` — provider job id, status (`queued`→`running`→`completed`/`failed`), counts, est/actual cost, `notified_at`.
- `opportunities` — company_id, situation_id, run_id, `what_happened`, `why_it_matters`, confidence, evidence_date, status. UNIQUE(seller,company,situation).
- `evidence` — source_url, source_date, citation (jsonb), per opportunity.
- `companies` — SHARED across another project; `normalized_domain` unique; **never delete**. SELECT for any authenticated user; writes via service role only.
- `contacts` — full_name, title, linkedin_url, priority (P1/P2/P3), email, `email_status`. UNIQUE(seller,company,linkedin_url).
- `outreach_drafts` — channel (email/linkedin), subject, body, followups (jsonb). UNIQUE(opportunity,contact,channel).
- `opportunity_feedback` — verdict (useful/not_relevant) + reason. UNIQUE(opportunity).
- `lists` / `list_items`, `prewarm_research` (pre-signup research cache, server-only), `usage_counters` (per-user per-day runs + cost).

**RLS:** every seller-owned table is scoped by `hotnow.owns_profile(seller_profile_id)` (or `auth.uid()` for seller_profiles/usage_counters); `candidates`/`evidence`/`list_items` are join-scoped via their parent. Verified: no cross-seller access. The service-role client (`supabase/admin.ts`) bypasses RLS and is used only server-side for background/ingest writes, always with an explicit seller scope.

## 7. API routes (`src/app/api`)
All user routes gated by `requireUser` (RLS via the request client) unless noted.
- **Discovery:** `discovery/start` (launch, per-user daily caps), `discovery/poll` (incremental ingest), `discovery/webhook` (public, HMAC-verified, re-fetches real results), `cron/discover` (CRON_SECRET-gated; reconcile always + gated daily discovery).
- **Seller/onboarding:** `seller` (GET/PATCH), `seller/research` (+`/status`), `situations` (+`/status`, `/custom`), `icp`, `settings`, `prewarm` (public, rate-limited).
- **Opportunities:** `opportunities` (list), `opportunities/[id]` (detail: opportunity+evidence+contacts+recommended+drafts+feedback), `opportunities/[id]/feedback`.
- **Contacts:** `contacts` (list/status), `contacts/source` (Blitz), `contacts/enrich` (Blitz emails).
- **Outreach:** `outreach` (GET drafts), `outreach/generate` (POST, Gemini).
- **Lists/Slack:** `lists`, `lists/[id]`, `lists/add`, `slack/send`.
- **Auth/admin:** `auth/signup` (public, rate-limited, pre-confirmed users), `admin/overview`, `admin/reset` (both `isAdmin`-gated).

## 8. Background jobs & scheduling
Long FindAll runs execute **inside Parallel**, not in a Vercel function, so no HTTP request must
outlive the 60s Hobby limit. Results ingest through one **idempotent worker** (`discovery/worker.ts::ingestRun`)
via two paths: the Parallel **webhook** (needs public `APP_URL` + optional `PARALLEL_WEBHOOK_SECRET`)
and in-session **polling** (dashboard every 15s). `discovery/reconcile.ts::reconcileStuckRuns` re-ingests
runs stuck in `running` past 20 min (closes the "webhook missed + tab closed" deadlock) and runs free on
the daily cron. Scheduled daily discovery (`plan.ts::planSellerRuns` enforces per-user caps + overlap +
disabled-situation skipping) is **gated OFF** behind `DAILY_DISCOVERY_ENABLED` until explicitly enabled.

## 9. Cost controls & observability
- Caps in `engine/config.ts`: `maxCostPerRunUSD` $5, `maxDailyCostPerUserUSD` $3, `maxRunsPerUserPerDay` 10,
  `maxSituationsPerDailyRun` 5. Recorded in `usage_counters`; surfaced in the owner `/admin` console.
- Logging: `lib/log.ts` emits structured JSON to stdout (Vercel Logs). Instrumented on discovery start,
  cron, reconcile, webhook, outreach, feedback, and provider-route error paths. **No Sentry/alerting yet.**
- Rate limiting: `lib/ratelimit.ts` per-IP in-memory on public `prewarm` + `signup`; `prewarm` also has a
  global per-minute DB cap + domain dedupe.

## 10. Deployment
Full sequence in [`launch-checklist.md`](./launch-checklist.md). Summary: set env (§11) in Vercel →
apply pending migrations → Supabase auth redirect config → `cd app && vercel --prod` → smoke test.
Rollback: redeploy prior Vercel build; migrations are additive (drop the added table/column); unset
`DAILY_DISCOVERY_ENABLED` to halt scheduled spend. All of `0001`–`0003` are currently applied to prod.

## 11. Environment variables
See the table in [`launch-checklist.md`](./launch-checklist.md). Required in prod: Supabase URL/anon/service-role,
`PARALLEL_API_KEY`, `GEMINI_API_KEY`, `BLITZ_API_KEY`, `APP_URL`, `CRON_SECRET`. Recommended: `PARALLEL_WEBHOOK_SECRET`.
Optional: `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `ADMIN_EMAILS`, `HOTNOW_DB_SCHEMA`. Leave `DAILY_DISCOVERY_ENABLED`
unset until scheduled discovery is approved.

## 12. Testing
`npm run test` (vitest, 30 tests, all providers mocked — never spends): seller-level dedup + stronger-evidence,
qualification (match/freshness/undated/citation), P1/P2/P3 classification, missing-email handling, outreach
shape, cron planner (caps/overlap/disabled), rate limiter, feedback upsert. No live provider tests (would cost
money) and no e2e/browser tests.

## 13. Known issues & roadmap (ordered by impact)
1. **Discovery latency (6–10 min) is the core UX problem** and the dominant cost. It's an external black box
   (FindAll). Biggest open question: keep FindAll, or build faster discovery (own crawler + signal detectors,
   a precomputed company-event index, cheap first-pass + expensive verify on finalists)?
2. **Per-seller volume/quality is unpredictable.** Niche situations can return few/zero matches. No
   post-generation validator on situations; the new `opportunity_feedback` isn't yet fed back into tuning.
3. **Not battle-tested live** — first real end-to-end runs against Parallel/Gemini/Blitz; expect live-only bugs.
   Confirm `gemini-3.8-flash` resolves in prod logs.
4. **Empty/loading UX is weak** — during an active search the Companies page reads as "nothing here"; polished
   components only render with data, so fresh accounts look bare.
5. **Marketing site (hotnow.co) is unchanged / old design.**
6. **Operational maturity:** stdout-only logging (add Sentry); in-memory (not shared) rate limiting; a few
   authed paid endpoints (outreach-generate, seller-research, situations) lack per-user caps (low-dollar);
   pre-existing duplicate opportunity rows from before the dedup fix aren't collapsed.
7. **"10 leads/day" marketing claim is not an operational guarantee** — throughput depends on FindAll results.

## 14. Gotchas
- Prod env vars marked Sensitive return empty from `vercel env pull`.
- Supabase `execute_sql` can throw transient errors — retry.
- The shared `companies` table must never be deleted; user-delete cascades never touch it (it's a parent).
- `main` is behind the live `mvp-build`; deploy from the working tree with `vercel --prod`.
- Discovery is capped to 2 situations on first launch (onboarding uses `?max=2`).
