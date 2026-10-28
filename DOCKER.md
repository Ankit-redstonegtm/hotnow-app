# Run HotNow with Docker

Docker runs a production Next.js container for the frontend/backend and a
separate worker container for research and discovery. Supabase, Parallel AI,
Blitz, and optional lead delivery remain cloud services.
The Docker setup does not create accounts or apply database migrations.

## Start

Docker Desktop is installed on this computer. Start it in Linux containers mode.
Open PowerShell in the folder containing `compose.yaml`:

```powershell
cd "C:\Users\AbidAnsari\OneDrive - Ctrl Agent\Documents\ChatGPT\Hotnow\hotnow-app-main"
# Only on a fresh checkout without .env.local:
# Copy-Item .env.example .env.local
docker compose --env-file .env.local up --build -d --wait
```

Open http://localhost:3001. The native development server may continue using port
3000; the container uses host port 3001 to avoid a conflict. The first build
downloads Node and project dependencies and can take several minutes.

With blank credentials, the container shows `/setup`. Follow `LOCAL_SETUP.md` to
create the cloud accounts, apply `supabase/migrations/001_hotnow.sql` to a new
Supabase project, expose the `hotnow` schema, and fill `.env.local`. In Supabase
Auth's URL Configuration add `http://localhost:3001/auth/callback` and use
`http://localhost:3001` as the Site URL when testing this Docker setup. You can
also keep the port-3000 callback in the allowed redirects for native development.

Then rerun the same `up --build` command. Building without Supabase public
configuration creates a setup-only image; runtime credentials alone cannot fix
the browser configuration embedded in that image.

## Everyday commands

```powershell
# Show health/state (does not print credentials).
docker compose --env-file .env.local ps

# Follow application logs. Ctrl+C stops following, not the container.
docker compose --env-file .env.local logs --follow --tail 100 app

# Rebuild after code or NEXT_PUBLIC_* configuration changes.
docker compose --env-file .env.local up --build -d --wait

# Reload changed private keys without rebuilding the browser bundle.
docker compose --env-file .env.local up -d --force-recreate --wait

# Stop/remove this project's container and network. Supabase data stays saved.
docker compose --env-file .env.local down
```

Use `--env-file .env.local` on these commands. Compose reads that file for
substitution of public build arguments; `env_file` in the YAML separately passes
the settings to the running container. `docker compose restart` does not reload
edited environment files.

The liveness endpoint is http://localhost:3001/api/health and returns
`{"status":"ok"}`. Container health confirms that the app server responds;
it does not prove that Supabase, Parallel, or Blitz are configured or reachable.

## What the build contains

1. **Dependencies stage:** Node 24 on Debian slim, pinned pnpm, locked packages.
2. **Builder stage:** compiles Next.js using Webpack and standalone output.
3. **Runner stage:** copies the minimal server, static assets, and public files.
   Runs as the `node` user rather than root and includes a liveness check.

`.dockerignore` excludes `.env.local`, other private environment files, Windows
`node_modules`, Git data, and host build output. Linux dependencies are installed
inside the build. Only public Supabase values are build arguments; server secrets
are supplied when the container starts.

Next.js standalone output is enabled only when `DOCKER_BUILD=1`, preserving native
Windows builds without standalone symlink requirements. No application data
volume is needed because persistent records are in Supabase cloud. Container
build caches and the installed image use Docker Desktop's disk storage.

## Ports and hosting

Optional Compose settings in `.env.local`:

```dotenv
HOTNOW_PORT=3001
DOCKER_APP_URL=http://localhost:3001
```

If you change the host port, also update `DOCKER_APP_URL` and Supabase callback
URLs. Compose maps `DOCKER_APP_URL` to the app's `APP_URL` inside the container;
the native app's `APP_URL=http://localhost:3000` can remain in the same file.

The default port binding is `127.0.0.1`, so only this computer can access the app.
For a cloud deployment, place the container behind your host's HTTPS routing and
set `DOCKER_APP_URL` to its public HTTPS URL. Adjust the port binding/routing for
that host. Set the Supabase Site URL and callback allowlist to the same domain.
Supply runtime secrets through the host's secret/environment settings.

The worker checks persisted tasks every five seconds, with up to three provider
jobs handled concurrently. It saves results with no open browser tab. Overview's
Agent activity panel and header badge share one authenticated AG-UI SSE feed
per dashboard tab. The feed checks saved state every three seconds; provider
checks remain in the worker. It restores a fresh snapshot after reconnect and
keeps a 15-second HTTP fallback while disconnected. Requests enqueue work
and return HTTP 202; they do not wait for Parallel research to finish.

Parallel cannot deliver webhooks to localhost. Local use works through the
separate worker. For webhooks, deploy the app and worker on an always-on host,
set `DOCKER_APP_URL` to your public HTTPS origin, and set
`PARALLEL_WEBHOOK_SECRET` to the signing secret from Parallel Settings → Webhooks
(not your Parallel API key and not a Supabase key). Recreate both services after
changing configuration. New provider runs automatically register
`https://your-domain/api/discovery/webhook`. Existing runs continue through
worker checks. No public tunnel is created automatically.

Signed Task completion events schedule result retrieval. Signed FindAll
candidate events refresh cumulative candidate/match counters; terminal events
save the final counters. The worker handles qualification and final ingestion.
Callbacks require a valid HMAC signature and a timestamp within five minutes.
Repeated deliveries do not increment counters or launch more searches.

Contact and email enrichment require the additive database upgrade
`supabase/migrations/002_background_jobs.sql` on existing installations. The
worker claims one company/person per batch using PostgreSQL leases, checkpoints
results, and retries temporary failures with bounded exponential backoff and
jitter. Failed or stopped enrichment jobs can be retried from Agent activity.
Stopping prevents future batches; a lookup already in flight may finish.
Opening Companies or Contacts does not start paid enrichment.

Task webhooks expose completion, not a detailed internal progress stream. The
UI shows truthful task stages and FindAll counters, with no invented percentage.
The worker also polls as a fallback for missed callbacks. Run one worker replica;
its internal pool handles three concurrent operations. Docker restart resumes stored
provider IDs. An interrupted launch with no saved provider ID fails for review,
rather than automatically launching a possibly duplicated paid job.

Inspect background health with `docker compose --env-file .env.local ps` and logs
with `docker compose --env-file .env.local logs --tail 100 worker`. A healthy
worker heartbeat confirms recent database checks; it does not prove provider
credits are available. Keep Docker Desktop running while jobs execute. This is
background execution of user-requested work, not scheduled discovery launches.

For cloud/public deployments, keep the build-time Supabase public URL/key and
runtime settings pointed at the same project. Rebuild the image when changing
that project. The server's Supabase schema must also match the public schema.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Docker engine unavailable | Start Docker Desktop and select Linux containers. |
| Port already allocated | Set an unused `HOTNOW_PORT`, matching `DOCKER_APP_URL`, and callback URL. |
| Setup screen after entering keys | Rebuild with `--env-file .env.local`; public values are baked into the image. |
| Login works but database queries fail | Apply the baseline to the correct project and expose `hotnow`; check key/schema alignment. |
| No contacts | Check Blitz credentials/credits; discovery and contacts use different services. |
| No background results after closing local dashboard | Check that the worker service is healthy and Docker Desktop remains running; inspect worker logs. |

Do not display the expanded output of `docker compose config` when sharing
diagnostics; it includes runtime environment values. Use `config --quiet` to
validate the Compose file without printing credentials.
