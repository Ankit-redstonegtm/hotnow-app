# Experiment: Parallel Task API for multi-company discovery (SPOTIO / situation_2)

Date: 2026-10-15. One controlled run. Not wired to production. FindAll/Blitz/DB untouched.

## Setup
- **Endpoint:** `POST https://api.parallel.ai/v1/tasks/runs` (then `GET /v1/tasks/runs/{id}/result`), auth header `x-api-key`. Structured output via `task_spec.output_schema = { type:"json", json_schema }`. Reused the production `taskRun()`.
- **Processor:** `pro`. Pricing (verified vs docs.parallel.ai): billed **per Task Run, flat**, independent of output size — `pro` = **$0.10/run**. (lite $0.005 / base $0.01 / core $0.025 / pro $0.10 / ultra $0.30 …)
- **Input:** SPOTIO seller context + ICP + situation_2 ("Scaling field teams to 5+ reps" — actively hiring 5+ field/outside sales reps), requiring a **specific, dated, public evidence_url** within 120 days, vendor/inside-sales exclusions, target 10 companies, "don't fabricate — fewer is fine." (Full prompt in `scratchpad/exp-task-discovery.mts`.)
- **Output schema:** `{ companies: [ { company_name, company_domain, company_description, industry, headquarters_country, employee_count, buying_situation_id, observed_event, event_date, evidence_url, evidence_summary, why_this_company_needs_the_product_now, icp_fit_reason, confidence } ] }`.

## Result
- **Latency:** 230s (~3.8 min). **Cost:** $0.10 (one `pro` run).
- **Companies returned:** **6** of 10 requested (it declined to fabricate to hit 10 — honest).
- Every company flagged its rationale as "Inferred opportunity:" (facts vs inference kept distinct — good).

## Quality audit (verified URLs/domains; did not trust self-reported confidence)
| Company | Domain (HTTP) | Evidence | Event genuine? | Verdict |
|---|---|---|---|---|
| Spectrum (spectrum.com) | ✓ 200 | news9.com — ~100 sales jobs incl. outside sales, OKC, 2026-09-29 | Yes, specific + dated | **STRONG** |
| Power Home Remodeling (powerhrg.com) | real (curl-blocked) | own press release — Cleveland = 28th territory + hiring, 2026-08-28 | Yes, territory expansion | **STRONG** |
| Cintas (cintas.com) | ✓ 200 | careers category page — 5+ sales roles, 2026-10-13 | Plausible (route-based field sales) | **OK** (evidence is a listing page, not one posting) |
| IKO Commercial (iko.com) | ✓ 200 | trade news — expanded via 3 independent rep agencies, 2026-07-24 | **Mismatch** — appointing independent agencies ≠ hiring 5+ employed reps; manufacturer | **WEAK** |
| Right Coast Medical | **no domain** | startup.jobs aggregator, 2026-06-22 | Unverified (aggregator) | **FAIL** (no official domain) |
| 3MG Roofing | **no domain** | jobbobs.com generic index URL, 2026-09-01 | Unverified (aggregator, not company-specific) | **FAIL** (no official domain) |

Tally of 6 returned: **~2 strong, 1 ok, 3 weak/fail.** 4/6 had an official domain; 2 had none. All within the 120-day window. 2 relied on aggregator sources rather than first-party/news.

## Task API vs FindAll — recommendation
**Do not replace FindAll based on this single run.** Task API is genuinely promising — **cheaper ($0.10 flat vs $0.25 + $0.03/match) and faster (~4 min vs 6–10) in one call with clean structured output** — and it nailed the big, well-covered companies (Spectrum, Power). But in this test it:
- **under-delivered on count** (6/10),
- had **domain gaps** (no official domain for 2/6) — it has no built-in domain resolution like FindAll, and
- accepted **aggregator evidence** and one **event mismatch** — no per-candidate verification step like FindAll's match-conditions.

**Recommended next step (before any switch):** a second experiment with processor `ultra`, plus a deterministic post-processor that reuses HotNow's existing `resolveDomain()` + `qualify.ts` (drop no-domain / aggregator-only / stale, enforce the match conditions). Only adopt Task API if `ultra` + post-processing matches FindAll's precision at lower cost. A hybrid (Task to generate candidates cheaply → existing qualify/resolve to verify) looks like the most promising direction.
