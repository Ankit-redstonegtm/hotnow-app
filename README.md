# HotNow

B2B opportunity discovery with evidence, buying signals, contact sourcing, saved
lists, CSV exports, and optional Slack notifications.

Start here: [Local and cloud setup](LOCAL_SETUP.md).

For a guide to the database, authentication, authorization, API keys, and
containers, read [Architecture](ARCHITECTURE.md). To run the app in Docker, follow
[Docker setup](DOCKER.md).

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

Open http://localhost:3000. The frontend and backend use one Next.js server.
The launcher also starts a background worker for research, signals, and discovery.
Overview shows saved task progress through a shared AG-UI event stream, and work continues when
you navigate away or close the browser. Docker Compose starts both services.
Fill `.env.local` to connect Supabase cloud, Clay (seller research), Parallel AI (company discovery), and Blitz. Until then,
the app shows a setup screen. Never commit credentials.

Each user can save multiple seller domains and switch company workspaces from
the sidebar. Profiles, signals, targeting, opportunities, contacts, and lists
belong to their workspace. Data is persisted in Supabase's `hotnow` schema.

The database baseline is [001_hotnow.sql](supabase/migrations/001_hotnow.sql).
Apply it to a new Supabase project, then expose `hotnow` in Data API settings.
The private trigger schema must stay unexposed. For existing installations, apply
[002_background_jobs.sql](supabase/migrations/002_background_jobs.sql) to enable
durable contact/email enrichment, task cancellation, retries and crash recovery.

## Checks

With Node/npm installed:

```powershell
npm install
npm run typecheck
npm run test:db
npm run test:background
node scripts/test-reliability.mjs
npm run check:cloud
npm run build
```

`pnpm-lock.yaml` is the canonical lockfile. With pnpm installed, use
`pnpm install --frozen-lockfile` for reproducible dependencies. The scripts use
Webpack for compatibility with Windows. Font styling uses system fonts so
builds do not need to download Google Fonts.

`test:db` runs local PostgreSQL schema and access-control checks without cloud
keys. `check:cloud` checks configured keys and Supabase tables without making
paid research calls. Live Supabase authentication, provider integrations, and
multi-user throughput must be verified after account configuration.

To check the running dashboard APIs against Supabase using temporary test users
and synthetic records, run `node scripts/test-api.mjs --allow-cloud-test-writes`.
This checks Overview, Companies, Contacts, Lists, authentication, and workspace
isolation. It removes its own test users/records afterward and makes no research,
contact-provider, or Slack calls. The default app URL is `http://127.0.0.1:3001`;
set `HOTNOW_TEST_URL` to test another local deployment.

Public hosting also needs the always-on worker described in [DEPLOY.md](DEPLOY.md). See
[GOOGLE_AUTH_SETUP.md](GOOGLE_AUTH_SETUP.md) for optional Google sign-in.
Automatic scheduled discovery is not configured; users launch searches manually.

For deep browser journeys, stop the worker before enabling synthetic queue
mutations. This opt-in check creates temporary users and removes its own records:

```powershell
docker compose --env-file .env.local stop worker
try {
  node scripts/test-api.mjs --allow-cloud-test-writes --worker-paused --browser
} finally {
  docker compose --env-file .env.local start worker
}
```

The browser check covers saved criteria, errors, list creation, signal toggles,
mobile layout, AG-UI reconnection, task controls and login/logout. It requires
Microsoft Edge at the configured Windows path in the test helper. The default
API-only test does not require a browser or pausing the worker.

`node scripts/test-reliability.mjs` tests retry/cancellation, stale leases,
validation, safe exports and evidence repair entirely offline. The optional
`node scripts/test-signup.mjs --allow-cloud-test-writes` exercises public signup
with one temporary account and blocks research/provider calls.

`node scripts/test-blitz.mjs` checks the contact provider contract offline,
including country filter arrays and titles from the searched company's current
employment. `node --env-file=.env.local scripts/test-blitz.mjs --live` also
resolves `hsbc.com` and fetches at most two contacts using the configured Blitz
key. The live check uses provider credits, fetches no emails and writes no data.
