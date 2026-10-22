# HotNow: local app with cloud services

The Next.js process serves both the frontend and `/api` backend on port 3000.
Supabase Auth and PostgreSQL, Parallel AI research, and Blitz contact data stay in
the cloud. No Docker or local database server is required to use the app.

## 1. Start locally

Open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

Open http://localhost:3000. Until Supabase is configured, this shows the setup
screen. The launcher uses the bundled Node runtime on this computer when available.
On another computer install Node.js LTS including npm, then use the same script.

Conventional commands also work when npm is installed:

```powershell
npm install
npm run dev
```

The committed lockfile is `pnpm-lock.yaml`; for reproducible installation with
pnpm use `pnpm install --frozen-lockfile`. The Windows launcher and package scripts
use Webpack, avoiding a Turbopack helper-process failure seen on this computer.

## 2. Create Supabase cloud project

1. Sign up at https://supabase.com/dashboard and create a new project.
2. Choose an appropriate region near your users. Save its database password
   privately; the app itself uses API keys rather than that password.
3. Open SQL Editor and run `supabase/migrations/001_hotnow.sql` once. This is a
   baseline for a **new project**, not an upgrade script for an existing database.
4. In the project's Data API settings add `hotnow` to **Exposed schemas**. Keep
   `hotnow_private` unexposed. The migration supplies grants and row-level security.
5. Find the project URL and API keys in the project's Connect/API Keys settings.
6. Edit `.env.local` (already created from `.env.example`):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SECRET-KEY
HOTNOW_DB_SCHEMA=hotnow
NEXT_PUBLIC_HOTNOW_DB_SCHEMA=hotnow
```

The existing variable names also support Supabase's legacy anon/service-role
keys. The public key goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`; only the server
secret goes in `SUPABASE_SERVICE_ROLE_KEY`. Never prefix a server secret with
`NEXT_PUBLIC_`. `.env.local` is excluded from Git.

In Authentication → URL Configuration set:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

Email/password signup works through the app's existing server signup route,
which creates pre-confirmed accounts. Google sign-in is optional; enable the
Google provider using the steps in `GOOGLE_AUTH_SETUP.md` if you want it.

## 3. Create Parallel AI account

1. Open https://platform.parallel.ai and create an account.
2. Create an API key and enable the access/credits required for Task and FindAll.
3. Set these values in `.env.local`:

```dotenv
PARALLEL_API_KEY=YOUR-PARALLEL-KEY
LLM_PROVIDER=parallel
APP_URL=http://localhost:3000
```

This handles website research, buying-signal generation, and company discovery.
Gemini and Anthropic keys are optional; they are not needed when using Parallel
for signal generation. Prices and provider limits must be checked in your provider
account; the repository's cost figures are estimates, not billing guarantees.

The launcher starts a separate background worker. It checks persisted tasks every
five seconds, so research, buying signals, and discovery finish even after you
leave the dashboard. Keep the launcher/Docker running. Overview shows live stages
and discovery counts over AG-UI/SSE; a header badge links to activity from other sections.
Contact and email jobs need `supabase/migrations/002_background_jobs.sql` applied
to existing projects, then start from an explicit action in Contacts.

For public HTTPS hosting, set `APP_URL` (or Docker `DOCKER_APP_URL`) and obtain
`PARALLEL_WEBHOOK_SECRET` from Parallel Settings → Webhooks. New tasks register
`/api/discovery/webhook` automatically. This signing secret differs from your
API key. Localhost uses worker checks because Parallel cannot reach it. See
`DOCKER.md` for worker health and deployment details.

## 4. Create Blitz account

1. Open https://www.blitz-api.ai and create an account.
2. Obtain an API key in its account dashboard and enable the required credits.
3. Set `BLITZ_API_KEY=YOUR-BLITZ-KEY` in `.env.local`.

Blitz provides domain-to-LinkedIn lookup, employee sourcing, and email lookup.
Without this key, research/discovery can work but contact sourcing cannot be
validated. Optional Slack incoming webhooks are configured separately for each
company through the app's Settings screen.

## 5. Check configuration and restart

After editing environment variables, stop the server with Ctrl+C and start it again.
From the project folder run:

```powershell
node scripts/check-cloud.mjs
```

This prints key presence (not values), then checks the Supabase tables. It does
not spend Parallel or Blitz credits or verify their key validity.

Create an account, enter a domain, review the profile and signals, and launch a
search. Use **Your companies → Add company** to add another domain. Company
profiles and all related data are saved in Supabase. Switch companies using the
sidebar selector. The same user/domain pair is reused instead of creating duplicates.
Selecting a different company does not overwrite an earlier company's records.

## 6. Use with 5–10 people

This is a suitable architecture to evaluate for a small pilot: one Next.js server,
one Supabase cloud project, and cloud research/contact APIs. It has not been
load-tested against real providers. Actual throughput depends on provider quotas,
API credits, discovery duration, and hosting resources.

- Each user signs up separately and can have several company workspaces.
- SQL row-level security restricts records to their owner; workspaces are not
  shared team accounts. Provider work is asynchronous.
- The database enforces one active discovery run per signal, and ten discovery
  launches per user per UTC day across all their companies (including failed
  launch attempts). A batch of five signals counts as five runs.
- Background result ingestion uses a database lease to avoid simultaneous
  ingestion of the same run. Contact batches are five companies; email batches
  are ten contacts. Repeated contact requests can still consume provider credits.
- For users on different computers, deploy the app to public HTTPS hosting
  (Vercel is already documented in `DEPLOY.md`). Everyone shares that deployment
  and the same cloud services. Their browser's localhost points to their own PC.
- For a trusted LAN pilot, `start-local.ps1 -Production` builds and binds to all
  interfaces. Use your PC's LAN address and configure Supabase redirect URLs for
  it. Windows Firewall may need an inbound port rule; the script does not change
  firewall settings. Your PC must remain running. Use HTTPS hosting for normal
  remote use and secure sessions.

Before inviting users, run `npm run test:db` and `npm run build`, then test with
two real accounts and two domains each in Supabase. The local SQL tests validate
schema rules and user isolation using an in-memory PostgreSQL engine, not a
live Supabase project or real provider concurrency. Never run the old demo smoke
scripts against production: some contain fixed sample credentials or paid calls.

## Official setup references

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/api/using-custom-schemas
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/redirect-urls
- https://docs.parallel.ai/introduction
- https://www.blitz-api.ai/developers

Account-specific daily discovery exemptions can be applied through
`supabase/migrations/003_account_discovery_limit.sql`. It grants unlimited daily
runs to the existing `abidansaria024@gmail.com` account, resolved to its auth user
ID. Other accounts retain ten runs per UTC day. The override table is private;
users cannot grant themselves an exemption. Apply this separately in Supabase
SQL Editor; no app rebuild is needed. The service-only
`discovery_daily_limit(target_user_id)` RPC returns NULL for an unlimited account
and 10 for accounts without an override. Per-search match settings, provider
limits and duplicate-active-search protection are independent of the daily cap.
