# HotNow — Launch Checklist

Branch `mvp-build`. Do not deploy or apply prod migrations without founder approval.

## 1. Environment variables (names + purpose; set in Vercel → app project)
| Variable | Purpose | Required in prod |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client + server) | **Yes** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS-bound) | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for background/admin writes (server only) | **Yes** |
| `HOTNOW_DB_SCHEMA` | Schema name | No (defaults to `hotnow`) |
| `PARALLEL_API_KEY` | Parallel.ai Task + FindAll + Search | **Yes** |
| `PARALLEL_WEBHOOK_SECRET` | Verifies Parallel webhook (HMAC) | Strongly recommended |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | Situation + outreach reasoning | **Yes** |
| `LLM_PROVIDER` | Force reasoning provider | No (empty → Gemini) |
| `ANTHROPIC_API_KEY` | Alternate reasoning provider | No |
| `BLITZ_API_KEY` | Contact sourcing + emails | Yes (for contacts) |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Public base for webhook + deep links | **Yes** (e.g. `https://app.hotnow.co`) |
| `ADMIN_EMAILS` | Admin console allowlist override | No |
| `CRON_SECRET` | Guards `/api/cron/discover` (fail-closed) | **Yes** (cron is inert without it) |
| `DAILY_DISCOVERY_ENABLED` | Turns on scheduled paid discovery | No — leave unset/`false` until approved |
| `CLAY_API_KEY` | Clay Public API key (server-only) for the Seller-Intelligence workflow | Only if using the Clay path |
| `CLAY_SELLER_ROUTINE_ID` | Clay routine id to run | No (defaults to `workflow:wf_0tmxbl8enV2ZTXSfktn`) |
| `NEXT_PUBLIC_USE_CLAY` | `true` routes onboarding through Clay (falls back to Parallel+Gemini) | No — leave unset until Clay path is validated in prod |

Report only names here; never print values. `vercel env pull` returns Sensitive vars empty by design.

## 2. Database migrations (schema `hotnow`, project vsxgszlevcygijgulnzm)
Apply in order. **Reversible** (all additive; drop the added column/table to roll back).
1. `0001_add_contacts_email_status.sql` — APPLIED ✅
2. `0002_create_outreach_drafts.sql` — APPLIED ✅
3. `0003_create_opportunity_feedback.sql` — **PENDING founder approval** (additive table, safe). Apply before/at deploy.

Dedup: seller-level (one company once per seller) is enforced in app code (`upsertOpportunity`), with the existing `UNIQUE(seller,company,situation)` as a backstop. Pre-existing duplicate rows are not auto-collapsed (would be destructive); new discovery is deduped.

## 3. Vercel / scheduler
- `vercel.json` registers a daily cron → `/api/cron/discover` (13:00 UTC). It runs the **free reconcile sweep always**; scheduled discovery stays OFF until `DAILY_DISCOVERY_ENABLED=true`. Cron sends `Authorization: Bearer $CRON_SECRET`.
- Long FindAll runs execute **inside Parallel**, not in a Vercel function — no route depends on outliving the 60s Hobby limit. Results ingest via the webhook (needs `APP_URL` reachable + `PARALLEL_WEBHOOK_SECRET`) or in-session poll; `reconcileStuckRuns` self-heals orphans.

## 4. Auth redirect config (Supabase → Authentication → URL config)
- Add `https://app.hotnow.co/auth/callback` to the allowed redirect URLs (the callback uses the request origin, so no code change).
- Set Site URL to `https://app.hotnow.co`.

## 5. Build verification (run in `app/`)
```
npm run typecheck   # tsc --noEmit
npm run test        # vitest (30 tests)
npm run build       # next build
```

## 6. Smoke test (founder, post-deploy, logged in)
1. Visit hotnow.co → enter a domain → redirected to app signup.
2. Sign up; land in onboarding with research pre-warmed.
3. Confirm "what I understood" (product/customers/industries).
4. Confirm ICP (geos, size, industries).
5. Review buying situations; toggle at least one on.
6. "Find opportunities" → discovery launches (≤2 situations).
7. Close the tab; wait a few minutes.
8. Return to /dashboard → opportunities present (streamed in).
9. Open an opportunity → read Why now (fact vs. interpretation), inspect evidence source links.
10. See P1/P2/P3 contacts; recommended highlighted; email status accurate (never "verified").
11. Generate email → subject + body; generate LinkedIn → message; copy each.
12. Mark the opportunity Useful / Not relevant (needs migration 0003 applied).
13. Settings → "Daily opportunities" reflects schedule; Slack webhook test (optional).

## 7. Rollback
- App: redeploy the previous Vercel build (or `vercel rollback`).
- DB: migrations are additive — to revert, `drop table hotnow.outreach_drafts;` / `hotnow.opportunity_feedback;` and `alter table hotnow.contacts drop column email_status;`. No data loss to core tables.
- Scheduled spend: set `DAILY_DISCOVERY_ENABLED` unset to immediately stop scheduled discovery (reconcile continues, free).
