# Enable "Continue with Google" (5 minutes)

The button and the `/auth/callback` handler are already built and deployed. To turn it on
you just need a Google OAuth client and to paste it into Supabase. Nothing in the code changes.

## 1. Create a Google OAuth client
1. Go to https://console.cloud.google.com → APIs & Services → **Credentials**.
2. **Create Credentials → OAuth client ID** → Application type **Web application**.
3. **Authorized redirect URI** — add exactly:
   `https://vsxgszlevcygijgulnzm.supabase.co/auth/v1/callback`
4. Create it and copy the **Client ID** and **Client secret**.

## 2. Paste into Supabase
1. Supabase dashboard → project **RedstoneGTM Prospecting IQ** → **Authentication → Providers → Google**.
2. Toggle **Enable**, paste the Client ID + Secret, save.

## 3. Allow the app's redirect URLs
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://app.hotnow.co`
- **Redirect URLs:** add `https://app.hotnow.co/auth/callback` (and `http://localhost:3000/auth/callback` for local dev).

That's it — the "Continue with Google" button on /login and /signup will work immediately.
Until then, email + password works (new signups are auto-confirmed, no email step).
