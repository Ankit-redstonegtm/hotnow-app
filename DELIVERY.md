# Lead delivery

This MVP delivers new opportunities in two ways:

- **Slack.** OAuth install, then choose a channel. HotNow posts each finished search there.
- **CSV.** Download the workspace's opportunities from onboarding, Settings, or Companies.

Google Sheets, Microsoft Teams, and Telegram are deferred. They are not in the product UI and the app does not read their environment variables.

Apply this once in the Supabase SQL editor before connecting Slack:

`supabase/migrations/004_delivery_connections.sql`

`delivery_secrets` is not granted to signed-in users. The Slack bot token is encrypted with `DELIVERY_TOKEN_KEY`. Generate one value and keep it stable; changing it makes saved Slack connections unreadable.

```bash
openssl rand -base64 32
```

`APP_URL` must be the origin users actually open. The Slack redirect URL is `{APP_URL}/api/delivery/slack/callback`.

- Local: `http://localhost:3000/api/delivery/slack/callback`
- Docker (`DOCKER_APP_URL`, default port 3001): `http://localhost:3001/api/delivery/slack/callback`
- Production: `https://app.hotnow.co/api/delivery/slack/callback`

## Slack app

1. Create an app at https://api.slack.com/apps.
2. Add a bot with these scopes: `chat:write`, `chat:write.public`, `channels:read`, `groups:read`, `channels:join`.
3. Under OAuth & Permissions, add the redirect URLs above.
4. Leave token rotation off unless you want Slack to issue refresh tokens. The app stores a refresh token when Slack sends one.
5. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `DELIVERY_TOKEN_KEY`.

Users install the app from HotNow and choose a channel. Public channels are joined by the bot. Private channels need an invite to the app first. A Slack incoming webhook saved before this change still delivers until it is removed or a channel is connected with OAuth.

No other delivery credentials are required for the app to run.

## CSV

The file includes company, domain, signal, what happened, why it matters, confidence, evidence date, and source. Downloads use the same spreadsheet-safe encoding as the rest of the app. During onboarding there may be no rows yet; the button enables after the first search.
