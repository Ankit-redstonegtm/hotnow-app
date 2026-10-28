# Lead delivery

After a domain is saved, HotNow can send new opportunities to Slack, Google
Sheets, Microsoft Teams, and Telegram. Connect them at the end of onboarding or
later in Settings. Each workspace stores its own connection. A destination can
be paused, tested, or disconnected without deleting the company.

Apply this once in the Supabase SQL editor before using the screen:

`supabase/migrations/004_delivery_connections.sql`

Then expose nothing new: both tables are in the existing `hotnow` schema.
`delivery_secrets` is not granted to signed-in users. Credentials are encrypted
with `DELIVERY_TOKEN_KEY` (AES-256-GCM). Generate one value and keep it stable;
changing it makes saved connections unreadable.

```bash
openssl rand -base64 32
```

`APP_URL` must be the origin users actually open. Redirect URLs below are
`{APP_URL}` plus the path. Locally that is `http://localhost:3000`. Docker's
`DOCKER_APP_URL` (default `http://localhost:3001`) is the container's `APP_URL`,
so register that origin too if you connect providers from Docker. Production is
`https://app.hotnow.co`.

No client IDs are committed. Create the apps below and put only the env vars in
the server environment.

## Slack

1. Create an app at https://api.slack.com/apps.
2. Add a bot with these scopes: `chat:write`, `chat:write.public`, `channels:read`, `groups:read`, `channels:join`.
3. Under OAuth & Permissions, add redirect URLs:
   - `http://localhost:3000/api/delivery/slack/callback`
   - `http://localhost:3001/api/delivery/slack/callback` if you use Docker
   - `https://app.hotnow.co/api/delivery/slack/callback`
4. Leave token rotation off unless you want Slack to issue refresh tokens. The app stores a refresh token when Slack sends one.
5. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`.

Users install the app from HotNow and choose a channel. Public channels are
joined by the bot. Private channels need an invite to the app first. A Slack
incoming webhook saved before this change still delivers until it is removed,
or until a Slack channel is connected with OAuth.

## Google Sheets

This OAuth client is separate from Supabase Google sign-in. Do not reuse the
Supabase callback.

1. In Google Cloud, enable the Google Sheets API.
2. Configure the OAuth consent screen. The requested scope is `https://www.googleapis.com/auth/spreadsheets` (sensitive). While the app is in testing, add the Google accounts that will connect.
3. Create an OAuth client ID of type Web application with redirect URIs:
   - `http://localhost:3000/api/delivery/google/callback`
   - `http://localhost:3001/api/delivery/google/callback` if you use Docker
   - `https://app.hotnow.co/api/delivery/google/callback`
4. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

After consent, the user creates a spreadsheet named for their company or pastes
a link to an empty sheet (or one whose first row is already the HotNow header).
New opportunities are appended as rows. A connection test appends one row
labeled as a test.

## Microsoft Teams

Teams does not need an Azure app for this MVP. In the channel that should
receive leads, create a webhook:

- Workflows → **Post to a channel when a webhook request is received**, or
- the legacy Incoming Webhook connector.

Paste the HTTPS URL into HotNow. Accepted hosts are `webhook.office.com`,
`outlook.office.com`, `logic.azure.com`, and Power Platform / Power Automate
webhook hosts. Office 365 connector URLs get a MessageCard. Workflow URLs get
an Adaptive Card. The URL is stored encrypted and is not shown again.

## Telegram

1. In Telegram, open `@BotFather`, create a bot, and copy the token.
2. Set `TELEGRAM_BOT_TOKEN`. `TELEGRAM_BOT_USERNAME` is optional; HotNow reads it from Telegram when it is empty.
3. For a public HTTPS deployment, set `TELEGRAM_WEBHOOK_SECRET` to a long random string (`openssl rand -hex 32`). HotNow registers `{APP_URL}/api/delivery/telegram/webhook` and checks the `X-Telegram-Bot-Api-Secret-Token` header.
4. On localhost, leave the webhook secret unset (or keep `APP_URL` on http://localhost). The user opens `https://t.me/<bot>?start=<code>` and presses Start. HotNow polls `getUpdates` from the signed-in page. Telegram cannot call localhost.

The Start link is the connection. The user does not paste a chat id.

## What gets sent

When a discovery wave finishes, HotNow delivers once to every enabled
destination:

- Slack, Teams, and Telegram receive a short batch message.
- Google Sheets receives one row per new opportunity.
- An empty wave still notifies chat destinations and does not append sheet rows.

Pausing a destination keeps the connection and stops delivery. Disconnect
deletes that destination's saved credentials.

Parallel research, FindAll discovery, and the background worker are unchanged
aside from this notification step.
