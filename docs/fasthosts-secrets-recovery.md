# Fasthosts deploy — secrets recovery checklist

Every variable marked **"Sensitive"** in Vercel is write-only: it cannot be exported (not via the
dashboard, not via `vercel env pull` — it returns blank). So for the Fasthosts move, each secret
below must be **re-sourced from its origin** or **regenerated**. This is the full list, grouped by
what you actually have to do.

Legend: 🔴 must recover intact (breakage/data loss if wrong) · 🟡 re-source from a provider console ·
🟢 regenerate freely · ⚪ optional / feature-gated · ✅ already in hand.

---

## ✅ Already have (no action beyond copying)

| Var | Value / source |
|---|---|
| `NEXT_PUBLIC_API_KEY` | *(value redacted — see the VPS `.env`)* — a `NEXT_PUBLIC_*` var, so it's already inlined into the client JS bundle; not a server secret. Rotate as part of post-live rotation. |
| `DATABASE_URL` / `DIRECT_URL` | Recovered from the Neon integration vars — **but these are replaced by the new Fasthosts Postgres strings anyway** (see the DB migration runbook). |

> Note: the app reads `API_KEY` and falls back to `NEXT_PUBLIC_API_KEY` (`src/middleware.ts`). You
> don't have a separate `API_KEY` set, so the value above covers API auth. If you want a
> non-public gate, set `API_KEY` to the same value.

---

## 🔴 CRITICAL — must recover the *exact original*

### `ENCRYPTION_KEY`
- **Why:** AES-256-GCM key (`src/lib/encryption.ts`) that encrypts client **bank details** captured
  in onboarding. A different key makes all existing encrypted values **permanently unreadable**.
- **How to get it back — in order of preference:**
  1. Check your **password manager / original setup notes** — it was generated once with
     `openssl rand -base64 32` and should have been saved.
  2. Check any old local `.env.local` on a machine that ran this app locally.
  3. Ask anyone who set up the Vercel env originally.
- **If it's genuinely lost:** you cannot decrypt existing bank fields. Options: (a) generate a new
  key, accept that stored bank details are dead, and have affected clients re-enter them; or (b)
  write a one-off re-encryption migration *before* switching keys (only possible while the old key
  still works — so this needs the original anyway). **Confirm you have it before cutover.**
- Format check: must base64-decode to 32 bytes.

---

## 🟡 Re-source from provider consoles

### Google — **login** client → `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
Used by NextAuth for team sign-in (`src/auth.ts`).
1. [Google Cloud Console](https://console.cloud.google.com) → the Gitwork project → **APIs &
   Services → Credentials**.
2. Under **OAuth 2.0 Client IDs**, open the **Web** client used for app login.
3. **Client ID** is shown (that's `AUTH_GOOGLE_ID`). For the secret, click the client → **Reset
   secret** (old value can't be viewed) → copy → that's `AUTH_GOOGLE_SECRET`.
4. **Add the Fasthosts domain** to *Authorized redirect URIs*:
   `https://<your-fasthosts-domain>/api/auth/callback/google` — otherwise login breaks.

### Google — **Care / Gmail connector** client → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
Separate OAuth client from the login one (the code comment calls this out explicitly).
1. Same Credentials page → open the **other** OAuth client used for Gmail/Calendar/Drive.
2. Copy the Client ID; **Reset secret** for the secret.
3. Ensure its redirect URIs include the Fasthosts domain if it does an OAuth redirect.

### Google — **iOS** client → `GOOGLE_IOS_SERVER_CLIENT_ID`
- Same Credentials page → the **iOS** OAuth client → copy its **Client ID** (server client id used
  to verify iOS Google sign-in tokens). No secret for iOS clients.

### Anthropic → `ANTHROPIC_ADMIN_KEY`
1. [Anthropic Console](https://console.anthropic.com) → **API Keys**.
2. You can't view the old key — **Create Key**, copy it, paste as `ANTHROPIC_ADMIN_KEY`. Revoke the
   old one once the new deploy is verified.
- **Note:** per-workspace AI keys are also stored **in the database** (Settings → AI provider), so
  after the DB migration the workspace's own key carries over; this env var is a fallback. If the
  workspace has its key set, this is lower urgency.

### Apple Push (APNs) → `APNS_AUTH_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION`
Only needed for iOS push notifications. From [Apple Developer](https://developer.apple.com/account) →
**Certificates, Identifiers & Profiles → Keys**:
- `APNS_AUTH_KEY` — the **contents of the `.p8` key file**. ⚠️ Apple lets you download a `.p8`
  **once**. If you saved it, paste its contents. If not, **create a new APNs Auth Key**, download it,
  use that (and note the new Key ID).
- `APNS_KEY_ID` — shown next to the key in the Keys list.
- `APNS_TEAM_ID` — top-right of the developer account (Membership details).
- `APNS_BUNDLE_ID` — your iOS app's bundle identifier (Identifiers list).
- `APNS_PRODUCTION` — `true` for the production APNs environment, `false` for sandbox. (Was set;
  match whatever the live iOS build expects — production for App Store/TestFlight.)

---

## 🟢 Regenerate freely (no recovery needed)

### `AUTH_SECRET`
- Random secret signing NextAuth sessions. Generate a fresh one:
  ```bash
  openssl rand -base64 33
  ```
- Effect of changing it: everyone is logged out once and signs back in. Harmless. (If the code also
  references `NEXTAUTH_SECRET`, set it to the same value.)

### `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`
- Bootstrap **creates or patches** the admin user (`src/server/bootstrap.ts`). On a **migrated DB the
  admin already exists**, so these are optional. If you set them, the next boot will (re)assert that
  admin's password — a handy way to guarantee you can log in. Set fresh values; change the password
  in-app afterwards.

---

## Not a secret — just set for the new host

### `NEXTAUTH_URL`
- Set to the exact URL Fasthosts serves, e.g. `https://foundry.gitwork.co.uk` (or the new domain).
  Must match the Google redirect URI host from above.

---

## ⚪ Optional — only if you want the feature (were never set in prod)

| Var | Feature | Where |
|---|---|---|
| `GITHUB_TOKEN` | Pulse repo scans + fix-agent PRs | GitHub → Settings → Developer settings → PAT (repo + metadata read) |
| `CRON_SECRET` | Guards `/api/cron/*` | Generate (`openssl rand -hex 32`) **if** you wire up your own scheduler — Vercel crons don't run on Fasthosts |
| `OPENAI_API_KEY` | Alt AI provider | platform.openai.com |
| `GEMINI_API_KEY` | Alt AI provider | Google AI Studio |
| `GOOGLE_PSI_API_KEY` | Better Pulse PageSpeed quota | Google Cloud → PageSpeed Insights API |
| `PROOF_SERVER_URL` | Proof module (currently hidden) | internal |

---

## Quick status table

| Var | Action | Done |
|---|---|:--:|
| `ENCRYPTION_KEY` | 🔴 Recover original from password manager/notes | ☐ |
| `AUTH_GOOGLE_ID` | 🟡 Google Cloud → login web client | ☐ |
| `AUTH_GOOGLE_SECRET` | 🟡 Google Cloud → reset secret | ☐ |
| `GOOGLE_CLIENT_ID` | 🟡 Google Cloud → connector client | ☐ |
| `GOOGLE_CLIENT_SECRET` | 🟡 Google Cloud → reset secret | ☐ |
| `GOOGLE_IOS_SERVER_CLIENT_ID` | 🟡 Google Cloud → iOS client | ☐ |
| `ANTHROPIC_ADMIN_KEY` | 🟡 Anthropic Console → new key | ☐ |
| `APNS_AUTH_KEY` | 🟡 Apple → .p8 contents (or new key) | ☐ |
| `APNS_KEY_ID` | 🟡 Apple → Keys | ☐ |
| `APNS_TEAM_ID` | 🟡 Apple → Membership | ☐ |
| `APNS_BUNDLE_ID` | 🟡 Apple → Identifiers | ☐ |
| `APNS_PRODUCTION` | 🟡 set `true`/`false` | ☐ |
| `AUTH_SECRET` | 🟢 `openssl rand -base64 33` | ☐ |
| `INITIAL_ADMIN_EMAIL` | 🟢 set fresh | ☐ |
| `INITIAL_ADMIN_PASSWORD` | 🟢 set fresh | ☐ |
| `NEXTAUTH_URL` | ⚪ set to Fasthosts domain | ☐ |
| `NEXT_PUBLIC_API_KEY` | ✅ already have it | ☑ |
| `DATABASE_URL` / `DIRECT_URL` | ✅ new Fasthosts Postgres strings | ☐ |
