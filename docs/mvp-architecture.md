# HotNow MVP — Architecture Lock & Implementation Plan

Execution doc (not a PRD). Grounded in the Prompt 0 audit + live schema inspection on
2026-10-15. Branch: `mvp-build`. Deploy only on explicit founder approval.

## 1. Preserve (do not rebuild — verified working as coded)
- Astro marketing site → domain capture → `app.hotnow.co/signup?domain=`.
- Auth (Supabase email + Google OAuth), prewarm research, 3-step onboarding studio.
- Discovery engine stages A–F: `src/lib/engine/{seller,situations,discovery,qualify}.ts`,
  providers `src/lib/providers/{parallel,blitz}.ts`, LLM dispatch `src/lib/llm/*`.
- Background model: `discovery/start` launches FindAll runs (non-blocking); results ingest
  via webhook **or** in-session poll through one idempotent worker `src/lib/discovery/worker.ts`.
- Persistence `src/lib/db/repo.ts`; RLS on all 13 `hotnow` tables via `owns_profile()`.
- Design system in `src/app/globals.css` (token-driven). Lists / CSV / Slack / admin console.

## 2. Database changes (ADDITIVE ONLY — non-destructive)
Applied via Supabase migrations against schema `hotnow`. No existing column/constraint is
dropped or altered. `usage_counters(user_id, day, runs_count, cost)` already exists — reused
for spend caps.

1. `contacts.email_status text` — enum-by-convention: `null`/`'unknown'` (not attempted),
   `'none'` (checked, not found), `'found'` (have email, UNVERIFIED), `'verified'` (only if a
   provider verification signal exists). Backfill from existing `email`: non-empty→`'found'`,
   `''`→`'none'`, null→null. **Never label an unverified email `verified`.**
2. `outreach_drafts` — new table. Columns: `id uuid pk`, `seller_profile_id uuid fk→seller_profiles cascade`,
   `opportunity_id uuid fk→opportunities cascade`, `contact_id uuid fk→contacts set null`,
   `channel text ('email'|'linkedin')`, `subject text null`, `body text`, `followups jsonb null`,
   `model text`, `created_at`, `updated_at`. `UNIQUE(opportunity_id, contact_id, channel)`.
   RLS `ALL USING owns_profile(seller_profile_id)`.

**Dedup is fixed BEHAVIORALLY, not by schema change.** The live `UNIQUE(seller,company,situation)`
stays as a backstop. `upsertOpportunity` now looks up any existing opp for `(seller, company)`
ignoring situation; if found it is NOT a new opportunity (refresh delivery ts; upgrade
fact/evidence only if the new candidate is strictly stronger). Existing 19 rows are left as-is
(collapsing them would be a destructive data edit — deferred, noted).

## 3. Shared TypeScript contracts (`src/lib/engine/types.ts` + new)
- Existing `Opportunity`, `BuyingSituation`, `Citation`, `Candidate`, `IcpConstraints` unchanged.
- Add `EmailStatus = 'unknown'|'none'|'found'|'verified'`.
- Add `OutreachChannel = 'email'|'linkedin'`.
- Add `OutreachContent = { email?: {subject,body}; linkedin?: {body}; followups?: Followup[] }`.

## 4. API contracts (frozen — FE agents build against these)
- `GET /api/opportunities/[id]` → `{ opportunity, evidence[], contacts[], recommendedContactId, draftsByContactId }`.
  - `opportunity`: `{id, companyName, companyDomain, situationName, whatHappened, whyItMatters, confidence, evidenceDate, status, firstDiscoveredAt}`.
  - `contacts[]`: `{id, fullName, title, priority, linkedinUrl, email, emailStatus}` (priority asc).
  - `recommendedContactId`: best P1 (else P2) with the strongest email status, else first.
- `GET  /api/outreach?opportunityId=&contactId=` → `{ content: OutreachContent | null, model?, updatedAt? }`.
- `POST /api/outreach/generate` `{opportunityId, contactId}` → `{ content: OutreachContent, model }`.
  Generates email + linkedin + optional 3-touch sequence grounded ONLY in stored evidence;
  upserts `outreach_drafts`. Paid LLM call, user-initiated only.
- `POST /api/cron/discover` — guarded by `CRON_SECRET` header. ALWAYS runs the stuck-run
  reconciliation sweep (no spend). Runs daily discovery per seller ONLY when
  `DAILY_DISCOVERY_ENABLED==='true'` (default off) AND under per-user daily cost cap.
- Existing routes unchanged.

## 5. Background execution model (final)
- Launch: user button → `/api/discovery/start` (unchanged). Overlap prevented by the
  `busy` set on `(queued|running)` runs.
- Ingest: webhook (primary) + poll (incremental), one idempotent `ingestRun`.
- NEW reliability: `src/lib/discovery/reconcile.ts::reconcileStuckRuns()` re-ingests runs stuck
  in `running` beyond a threshold; finalizes terminal ones; clears the busy-deadlock. Called by
  the cron every run (free, no provider spend beyond cheap status reads).
- NEW scheduling: `vercel.json` cron → `/api/cron/discover` daily. Ships DISABLED for discovery
  (reconcile-only) until founder approves recurring spend.
- Cost caps: per-run `maxCostPerRunUSD=5`; per-user per-day via `usage_counters` + new
  `maxDailyCostPerUserUSD`; `maxRunsPerUserPerDay=10`.

## 6. File ownership (parallel-safe)
- **Lead (backend spine + contracts):** `src/lib/**`, `src/app/api/**`, migrations, `vercel.json`,
  `src/lib/log.ts`, `docs/`.
- **Agent UI-primitives:** `src/components/ui/*` (new), append-only `globals.css`.
- **Agent FE-pages (after spine):** `src/app/dashboard/**`, new `src/app/dashboard/companies/[id]/page.tsx`,
  `src/components/OutreachPanel.tsx`, opportunity card component. Consumes §4 APIs + primitives.
- No two agents share a file. Lead mounts `ToastProvider` + integrates.

## 7. Logging / observability
- `src/lib/log.ts`: structured JSON logger to stdout (Vercel captures). `log.info/warn/error(event, fields)`.
  Instrument engine entry points, provider failures, cron, and API `handle(e)`. Sentry deferred
  (new dep; cheap to add later against the same logger).

## 8. Testing strategy (vitest, mocked providers)
Add `vitest` (dev dep) + `npm run test`. Mock Parallel/Gemini/Blitz — never spend to test.
Focused unit tests: seller-level dedup, qualification (match/freshness/citation), contact
prioritization (P1/P2/P3), missing-email handling, outreach generation shape, cron overlap
prevention + reconcile, daily cost cap. Quality gates per workstream: `tsc --noEmit`, build, tests.

## 9. Verification labels (be honest)
- **Mock-tested:** unit tests with mocked providers.
- **Build-verified:** `tsc --noEmit` + `next build` pass.
- **Live-verified:** real signup + real provider run (NOT done this session — requires paid calls
  + a logged-in walkthrough; the true E2E test remains outstanding).
