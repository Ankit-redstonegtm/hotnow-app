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
| `PARALLEL_API_KEY` | from .env.local |
| `LLM_PROVIDER` | `parallel` |
| `GEMINI_API_KEY` | from .env.local (optional until it has credits) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://vsxgszlevcygijgulnzm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_...` key |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_...` key |
| `HOTNOW_DB_SCHEMA` | `hotnow` |
| `APP_URL` | `https://app.hotnow.co` (optional; falls back to `VERCEL_URL`) |
| `PARALLEL_WEBHOOK_SECRET` | `whsec_...` from Parallel → Settings → Webhooks (optional) |

**Background discovery (no open tab needed):** when a FindAll run finishes,
Parallel POSTs `app.hotnow.co/api/discovery/webhook` and results ingest server-side,
then a Slack ping (if a webhook URL is set in Settings) says how many new
opportunities landed. This works out of the box on Vercel via `VERCEL_URL`; set
`APP_URL` for a stable domain + nicer Slack links, and `PARALLEL_WEBHOOK_SECRET`
to signature-verify incoming deliveries. The in-app poll still runs as a fallback.

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
- Function durations: onboarding is async-polled, so it fits the 60s limit. The discovery
  **poll/ingest** route is set to `maxDuration = 300`; on Hobby it's capped at 60s, which is
  enough because each poll processes already-finished runs. No Pro plan required.
- Daily scheduled discovery (Vercel Cron) is NOT wired yet (Phase 6). Runs are user-triggered
  from Dashboard → Manage situations.
- Cost control: discovery defaults to FindAll `base` with per-run caps (see src/lib/engine/config.ts).
  Signup is open — anyone who signs up can trigger real Parallel spend; keep the URL private while testing.
