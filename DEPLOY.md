# Deploying the HotNow app to Vercel → app.hotnow.co

The app is a standalone Next.js project in this folder (`/Users/ankitsingh/hotnow.co/app`).
The marketing site (Astro) stays at `hotnow.co` / `www`; this app goes to **app.hotnow.co**.

## 1. Create the Vercel project (CLI — fastest)
```bash
cd /Users/ankitsingh/hotnow.co/app
vercel login                 # browser/email flow
vercel link                  # choose "create new project", name it e.g. hotnow-app
```
Framework auto-detects as Next.js. Root directory = this folder. Build = default.

## 2. Add environment variables
Set these for **Production** and **Preview** (values are in your local `app/.env.local`):

| Variable | Value source |
|---|---|
| `CLAY_API_KEY` | Clay personal API key. Required for seller research and buying situations. |
| `CLAY_ROUTINE_ID` | `workflow:wf_0tmxbl8enV2ZTXSfktn` (optional; this is the default) |
| `PARALLEL_API_KEY` | from .env.local. Company discovery (FindAll) only. |
| `LLM_PROVIDER` | `parallel` (unused for seller research) |
| `GEMINI_API_KEY` | from .env.local (optional until it has credits) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://vsxgszlevcygijgulnzm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_...` key |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_...` key |
| `HOTNOW_DB_SCHEMA` | `hotnow` |
| `APP_URL` | `https://app.hotnow.co` (optional; falls back to `VERCEL_URL`) |
| `PARALLEL_WEBHOOK_SECRET` | `whsec_...` from Parallel → Settings → Webhooks (optional) |

**Current background processing:** Vercel can host the Next.js frontend and API,
but this version also requires a separate always-on worker. Deploy the Docker
image on a worker-capable host with command `node background-worker.cjs`, the
same runtime secrets and Supabase schema as the app, and `APP_URL` set to the
public app origin. Use one worker replica. A Vercel deployment alone will leave
jobs queued. For an app and worker on one host, use [Docker setup](DOCKER.md).

The signed webhook updates task readiness and cumulative discovery counters;
the worker retrieves results, qualifies companies, persists opportunities, and
sends completion notifications. Configure `PARALLEL_WEBHOOK_SECRET` from
Parallel Settings → Webhooks. Localhost uses worker checks; no open tab is needed.

CLI (repeat per var, paste value when prompted):
```bash
vercel env add PARALLEL_API_KEY production
vercel env add LLM_PROVIDER production          # value: parallel
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add HOTNOW_DB_SCHEMA production       # value: hotnow
# (optional) vercel env add GEMINI_API_KEY production
```
Or paste them all in the Vercel dashboard → Project → Settings → Environment Variables.

## 3. Deploy
```bash
vercel --prod
```

## 4. Attach the domain
```bash
vercel domains add app.hotnow.co
```
Then at your DNS provider for hotnow.co, add the record Vercel shows (typically):
```
CNAME   app   cname.vercel-dns.com.
```
Vercel issues the TLS cert automatically once DNS resolves.

## 5. Verify
- Visit https://app.hotnow.co → sign up → enter a domain → confirm → approve situations →
  Find opportunities → dashboard fills in as discovery finishes (~5–8 min).

## Notes
- Research, buying-signal generation, and discovery enqueue work and return HTTP
  202. Browser status endpoints read persisted state; provider work and ingestion
  run in the dedicated worker rather than a long-running serverless request.
- Daily scheduled discovery (Vercel Cron) is NOT wired yet (Phase 6). Runs are user-triggered
  from Dashboard → Manage situations.
- Cost control: discovery defaults to FindAll `base` with per-run caps (see src/lib/engine/config.ts).
  Signup is open — anyone who signs up can trigger real Parallel spend; keep the URL private while testing.
