# Foundry staging environment — build runbook

Staging is **`https://staging.foundry.gitwork.tech`** on the Fasthosts VPS, Docker Compose, same
shape as production (CLAUDE.md §23). Once it's up, **all development targets staging** and only
verified work reaches `main`.

**Part 1 is the build, step by step, tagged with who does each step.** Everything after it is
reference you only need when something misbehaves.

Committed artefacts this runbook uses — they exist, you don't write them:

| File | What it is |
|---|---|
| `deploy/staging/generate-env.sh` | Generates the staging `.env` with fresh secrets, **on the box** |
| `deploy/staging/docker-compose.yml` | Staging's Compose project (own network, own volume, port 3001, `:staging` tag) |
| `deploy/staging/nginx/staging.foundry.conf` | nginx site config incl. a blanket `Disallow: /` |
| `.github/workflows/deploy-staging.yml` | Build → GHCR `:staging` → deploy. Deploys **any branch** on demand |

> **Doc debt this creates.** CLAUDE.md §2, `ONBOARDING.md` §"Deploying" and
> `docs/build-checklist.md` all still state *"there is no staging environment and there are no
> branch preview URLs."* Update all three **once step 12 passes** — not before, or a new builder
> trusts an environment that isn't answering. See §9 for what changes when they do.

---

## 0. 🔴 First — rotate what leaked

A full production `.env` was pasted into Slack on 2026-07-30 to start this work. Slack is not a
secret store: that message is in channel history, its search index, every member's local cache, and
any export. **Every value in it is burned and must be rotated in production**, whether or not
staging proceeds. This is independent of everything below — do it in parallel.

Most urgent first; the top three are live credentials to systems outside Foundry.

| Secret | Why urgent | Rotate at |
|---|---|---|
| `GITHUB_TOKEN` (`github_pat_11BPN2ODY0…`) | Full PAT — repo read/write across `Git-Dann/*` | GitHub → Settings → Developer settings → PAT. **Revoke the old one.** Re-add as Actions secret `FOUNDRY_GITHUB_TOKEN` (§35 — GitHub rejects names starting `GITHUB_`) |
| `AUTH_GOOGLE_SECRET` | OAuth client secret for all team sign-in | Cloud Console → Credentials → "Foundry Login" → **Reset secret** |
| `APNS_AUTH_KEY` | Apple push signing key — signs push to real devices | Apple Developer → Keys → revoke, create new, note the new `APNS_KEY_ID` |
| `POSTGRES_PASSWORD` | Production database password | Change in Postgres + the VPS `.env`. §23 already flagged this as pending from the migration — now overdue twice |
| `AUTH_SECRET` | Signs NextAuth sessions — a holder can forge a session cookie | `openssl rand -base64 33`. Logs everyone out once; harmless |
| `NEXT_PUBLIC_API_KEY` | Gates all `/api/*` except `/api/health` | Generate fresh |
| `CRON_SECRET` | Guards `/api/cron/*` — can trigger retention sweeps and digests | `openssl rand -hex 32` |
| `VAPID_PRIVATE_KEY` | Signs browser push | `npx web-push generate-vapid-keys`; subscriptions re-subscribe |
| `WEDGE_*` | Real client system logins | Coordinate with Big Wedge first |

### `ENCRYPTION_KEY` is the deliberate exception

**Do not rotate it. Do not copy it to staging.** It's the AES-256-GCM key (`src/lib/encryption.ts`)
encrypting client **bank details** from onboarding — rotating it makes every stored bank record
permanently unreadable (`docs/fasthosts-secrets-recovery.md` marks it 🔴 for this). But the
production value on staging means anyone with staging shell access decrypts real client banking
data.

So: production keeps its key, staging generates its own, access to the prod box gets tightened, and
the exposure is logged as an accepted risk. That's a decision to record, not a config change.

---

## 1. Build it — step by step

**[DAN]** = needs your Google/GitHub access · **[SHAHAB]** = on the VPS · **[EITHER]**

Steps 1–3 are independent of 4–6, so they can run in parallel. Step 7 needs both done.

---

### Step 1 — DNS **[DAN]**

Point the staging hostname at the VPS.

```
Type: A     Name: staging.foundry     Value: 194.164.127.222     TTL: default
```

⚠️ **This is the `gitwork.tech` zone, not `gitwork.co.uk`.** §23 records that `gitwork.co.uk` is
Squarespace-managed; `.tech` may well be somewhere else entirely. Confirm who holds that zone before
assuming the record goes in the same place.

Check it before moving on — certbot in step 6 fails on an unresolved name:

```bash
dig +short staging.foundry.gitwork.tech      # expect 194.164.127.222
```

---

### Step 2 — Google OAuth redirect URI **[DAN]**

**Nothing else unblocks login.** Google is the only NextAuth provider (`src/auth.ts:14`;
`auth.config.ts:80` is `providers: []`) — there is no password login to `/app` at all (§5).

Cloud Console → the Gitwork project → **APIs & Services → Credentials** → OAuth 2.0 Client IDs →
the **"Foundry Login"** web client (Client ID begins `863801453214-1dv17p3eqf94nclttq9cig14uka7n1u6`).

**Authorised redirect URIs** — add (exact, no trailing slash):

```
https://staging.foundry.gitwork.tech/api/auth/callback/google
```

**Add, don't replace.** Leave the production URI in place. A second OAuth client would mean a second
consent screen and a second secret to keep in step.

**Authorised JavaScript origins — not required, skip it.** Origins only apply to browser-side Google
flows (Google Identity Services, One Tap, the implicit flow). This app uses none: `signIn("google")`
(`src/app/login/actions.ts`, `portal-login-form.tsx`, `invite/[token]/accept-button.tsx`) is
NextAuth's **redirect-based server-side authorization code flow**, so the token exchange happens on
our server and the browser never presents a client ID. Verified — there is no `gapi`,
`accounts.google.com/gsi` or `google.accounts.id` reference anywhere in `src/`. Adding the staging
origin is harmless, but it fixes nothing and its absence is not why a login would fail.

⚠️ **Google warns changes take "five minutes to a few hours" to take effect.** If sign-in still
fails immediately after saving, wait before debugging — a stale `redirect_uri_mismatch` here has
sent people off to change `NEXTAUTH_URL`, which was already correct.

While you're there, copy the **Client ID** and **Client secret** — step 5 needs them. (The secret
can't be viewed after creation; if you don't have it, **Reset secret**, which you're doing anyway
per §0.)

---

### Step 3 — ⚠️ Confirm who can actually sign in **[DAN]**

`src/auth.ts:47-51` hard-restricts sign-in:

```ts
async signIn({ user }) {
  // Restrict to @gitwork.co.uk accounts only
  if (!user.email?.endsWith("@gitwork.co.uk")) {
    return false;
  }
  return true;
}
```

A non-`@gitwork.co.uk` account is refused **after** a successful Google consent, so it surfaces as a
generic error resembling a broken config. No allow-list, no env var. **The staging host being
`gitwork.tech` is irrelevant — the check is on the email.**

**If Shahab isn't on `@gitwork.co.uk` he cannot log in at all**, no matter what else is configured.
Two options, and it's your call:

- **Issue him a `@gitwork.co.uk` Google account** — much the cleaner option, no code change, no
  production impact.
- **Widen the check** — a real code change that widens **production** too unless made host-aware.
  That wants its own PR and thought, not a quick edit.

Also check the **OAuth consent screen publishing status**: if it's *External* + *Testing*, only
listed test users can sign in regardless of domain. Setting it to **Internal** is separately the
prerequisite for the held PR #354 (§33), so it may be worth doing once, now.

---

### Step 4 — Create the staging directory **[SHAHAB]**

On the VPS, as the `deploy` user:

```bash
sudo mkdir -p /opt/apps/foundry-staging
sudo chown "$USER":"$USER" /opt/apps/foundry-staging
cd /opt/apps/foundry-staging

# Pull the three files this runbook ships. Adjust the ref if not on main yet.
BASE=https://raw.githubusercontent.com/Git-Dann/docs-by-gitwork/main/deploy/staging
curl -fsSLO "$BASE/docker-compose.yml"
curl -fsSLO "$BASE/generate-env.sh"

ls -la      # expect docker-compose.yml and generate-env.sh
```

⚠️ **`/opt/apps/foundry-staging`, never `/opt/apps/foundry`.** The second is production. Every
command below assumes you are in the staging directory — check with `pwd` if unsure.

---

### Step 5 — Generate the `.env` **[SHAHAB]**

```bash
cd /opt/apps/foundry-staging
bash generate-env.sh
```

This generates **every** random secret locally and writes `.env` at mode `600`, so no secret value
travels through Slack or a chat window — which is exactly how the production `.env` leaked. Generated
for you, none matching production:

`POSTGRES_PASSWORD` · `AUTH_SECRET` · `API_KEY` · `NEXT_PUBLIC_API_KEY` · `ENCRYPTION_KEY`
(verified to decode to 32 bytes, which the app requires) · `CRON_SECRET` ·
`PROVENANCE_SIGNING_SECRET`

It refuses to overwrite an existing `.env` — regenerating `ENCRYPTION_KEY` would orphan any data
already encrypted under the old one.

Then paste in the two values from step 2:

```bash
nano .env
#   AUTH_GOOGLE_ID="…"
#   AUTH_GOOGLE_SECRET="…"
```

Optional, only if you want the feature: `ANTHROPIC_API_KEY` (AI — use a staging key with its own
spend cap) and `GITHUB_TOKEN` (Pulse repo scans — a **read-only** PAT here). Both can also be set
later from GitHub Actions secrets; see step 8.

Sanity-check without printing anything secret:

```bash
grep -c '^AUTH_GOOGLE_ID=""' .env    # expect 0 — i.e. no longer empty
stat -c '%a' .env                    # expect 600
```

---

### Step 6 — TLS certificate and nginx **[SHAHAB]**

Certbot first — the nginx config references a certificate path, so pasting it in before the cert
exists makes `nginx -t` fail on an unresolvable file.

```bash
sudo certbot --nginx -d staging.foundry.gitwork.tech
```

Then take the committed config, which adds a blanket `Disallow: /` so staging can't be indexed
alongside production:

```bash
sudo curl -fsSL \
  https://raw.githubusercontent.com/Git-Dann/docs-by-gitwork/main/deploy/staging/nginx/staging.foundry.conf \
  -o /etc/nginx/sites-available/staging.foundry.gitwork.tech
sudo ln -sf /etc/nginx/sites-available/staging.foundry.gitwork.tech /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

⚠️ **If `nginx -t` reports `duplicate listen options for [::]:443`:** production's config carries
`ipv6only=on` on that socket, and the flag may only be set once per address:port. The staging file
deliberately omits it — if certbot re-added it during step 6, delete it from the **staging** file,
not from production's.

---

### Step 7 — First deploy **[EITHER]**

The image needs building once before the box has anything to pull.

**Option A — via GitHub Actions (preferred; this is the path you'll use from now on).**
Actions tab → **"Build, Push & Deploy — STAGING"** → *Run workflow* → pick a branch.

First it needs three repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `STAGING_VPS_HOST` | `194.164.127.222` |
| `STAGING_VPS_USER` | the `deploy` user |
| `STAGING_VPS_SSH_KEY` | the same private key production's deploy uses |

**Option B — by hand on the box**, if you'd rather not wait on CI:

```bash
cd /opt/apps/foundry-staging
docker compose pull app        # needs the :staging tag to exist — run Option A once first
docker compose up -d db
docker compose run --rm --no-deps --user root --entrypoint sh app \
  -c "npx --yes prisma@6.16.2 db push --schema=prisma/schema.prisma --skip-generate"
docker compose up -d --no-deps --force-recreate app
```

⚠️ **Never `npm run build` against a live `DATABASE_URL`** — that npm script runs `prisma db push`
first and mutates whatever database it's pointed at. The throwaway-container form above is what
production uses, and it omits `--accept-data-loss` on purpose.

---

### Step 8 — Optional: managed secrets from CI **[DAN]**

So rotating a staging key doesn't need SSH. Same mechanism as production (§35), distinct names so a
production value can never be synced into staging:

| Actions secret | Written to the box as |
|---|---|
| `STAGING_GITHUB_TOKEN` | `GITHUB_TOKEN` |
| `STAGING_ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` |

An unset secret is a **no-op**, not a delete — it leaves whatever's in the box's `.env` alone. Add
more by adding one `upsert_env` line to `deploy-staging.yml`.

`AUTH_GOOGLE_*` are deliberately **not** managed this way: they're shared with production's OAuth
client, and a second copy in Actions secrets would drift.

---

### Step 9 — Sign in, in this order **[DAN first, then everyone]**

⚠️ **Dan must sign in first.** `KNOWN_SUPER_ADMIN_EMAILS` (`src/server/permissions.ts:30`) is
`["dan@gitwork.co.uk"]` — the only address auto-promoted to Super Admin. Anyone else signing into an
empty workspace lands on the default role with nobody above them to grant anything, and most of the
app reads as *missing* rather than gated.

1. Dan → `https://staging.foundry.gitwork.tech` → sign in with Google.
2. Confirm you're Super Admin (Settings → Team shows the full matrix).
3. Grant everyone else from **Settings → Team** as they sign in.

Your `User` + `WorkspaceMember` row is created automatically on first sign-in (`src/auth.ts` `jwt`
callback), so an empty database needs no admin seeding — which is just as well, since
`INITIAL_ADMIN_*` cannot produce a login (§5).

Being asked to consent on every sign-in is expected: `prompt: "consent"` is forced
(`src/auth.ts:40`) so Google always returns a refresh token.

---

### Steps 10–12 — Verify

Run the checklist in **§8**. Step 12 passing is the point at which staging is real and the three
docs in the header should be updated.

---

## 2. The `.env`, explained

`generate-env.sh` writes this and annotates each line. The five that differ from production and will
break staging silently if copied:

| Variable | Set to | If wrong |
|---|---|---|
| `NEXTAUTH_URL` | `https://staging.foundry.gitwork.tech` | The OAuth flow **completes and lands the user on production**. Nothing errors. Also breaks the Gmail connector redirect, middleware's resolve-host call (`middleware.ts:45`) and Pulse monitor webhook URLs |
| `ENCRYPTION_KEY` | staging's own | Prod value ⇒ staging can decrypt real client bank details |
| `NEXT_PUBLIC_APP_URL`<br>`NEXT_PUBLIC_SITE_URL` | staging URL | **Unset defaults to the production URL** (`notifications.ts:137`, `slack/blocks.ts:16`, `layout.tsx:59`) ⇒ staging notifications deep-link into prod. Read server-side only, so runtime env is enough — no build arg |
| `DATABASE_URL` | staging's own Compose `db` | A `foundry_staging` database on production's container doesn't exist (prod compose hardcodes `POSTGRES_DB: foundry`) and puts you one typo from writing to production |
| `APNS_PRODUCTION` | `"false"` | Sandbox tokens from a dev/TestFlight build are rejected outright by the production APNs endpoint — presents as "push is broken" |

### `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` — intentionally blank

They cannot produce a login, for two independent reasons:

1. `admin@example.com` specifically creates **nothing**: `ensureInitialAdmin` calls
   `isSeedAccountEmail` (`src/server/seed-accounts.ts:60`), which rejects the whole `@example.com`
   domain and returns early, silently.
2. Even with a valid address, **there is no password login to `/app`.** `User.passwordHash` is
   written by team invites, `forgot-password` and `ensureInitialAdmin`, but the only
   `bcrypt.compare` in the codebase is `src/server/wiki-access.ts`, which gates the separate public
   wiki. Nothing ever compares it for `/app`.

### Read by the code but not worth setting

`NEXTAUTH_SECRET` (legacy alias — set to `AUTH_SECRET` only if something complains),
`ASSAY_SIGNING_SECRET` (pre-rename fallback for `PROVENANCE_SIGNING_SECRET`; on a new environment
just set the new name), `BASE_URL` / `PULSE_API_URL` / `PULSE_API_KEY` (appear in a `process.env`
grep but have no live read in `src/`).

---

## 2a. Isolation — can a staging sign-in touch production?

**No.** Three independent boundaries, any one of which would be sufficient. Verified in code:

| Layer | Why it holds |
|---|---|
| **Different registrable domain** | `foundry.gitwork.co.uk` is under `gitwork.co.uk`; staging is under `gitwork.**tech**`. They share no suffix above the public suffix, so a browser cannot expose one's cookies to the other — the cookie isn't merely un-sent, it's invisible. There is also **no cookie `domain` override anywhere** in `src/auth.ts` / `auth.config.ts` / `middleware.ts` (checked), so cookies are host-only regardless |
| **Different `AUTH_SECRET`** | `session: { strategy: "jwt" }` (`auth.config.ts:29`) — there is no session table; **the session *is* a signed cookie**. `generate-env.sh` gives staging its own `AUTH_SECRET`, so even a hand-copied production cookie fails signature validation on staging. This is a cryptographic boundary, not a naming convention |
| **Different database** | Separate Compose project and volume. Your `User` / `WorkspaceMember` rows are distinct records — changing your role on staging cannot affect production |

### What *is* shared, and why it's harmless

The OAuth **client**. Both hosts send the same `client_id` to Google, which means a shared *consent
record* and obviously the same Google account. It does **not** mean a shared session: Google
redirects to whichever `redirect_uri` the authorization request carried, so signing into staging
neither signs you into production nor signs you out of it. (`prompt: "consent"` is forced anyway —
`src/auth.ts:40` — so you're re-asked on every sign-in regardless.)

Sharing the client is the deliberate choice: a second one would mean a second consent screen and a
second secret to keep in step, for no isolation gain given the three boundaries above.

### ⚠️ Sharing production's `AUTH_SECRET` destroys boundary 2 — and it is not obvious

The three boundaries above assume staging has its **own** `AUTH_SECRET`. "Let's just reuse the same
`.env` for now" is the natural shortcut and it breaks the most important one, in a way domain
separation does **not** cover:

The session is a **JWT signed with `AUTH_SECRET`** — it carries the user id, role and permissions,
and it is verified by signature, not looked up in a table. With the same secret on both hosts, **a
token minted by staging is cryptographically valid on production.** Different registrable domains
stop a browser *automatically* sending it, but nothing stops anyone reading a staging cookie and
setting it manually on the production domain. Staging is the box where a half-finished feature, a
debug endpoint or a `console.log` is most likely to expose one.

So a shared `AUTH_SECRET` turns "staging access" into "production access". Same reasoning, decreasing
severity, for the others:

| Shared value | What it grants on production |
|---|---|
| `AUTH_SECRET` | **Session forgery — a staging token authenticates as that user on prod** |
| `ENCRYPTION_KEY` | Decryption of real client bank details (§0) |
| `API_KEY` | Every `/api/*` route except `/api/health` |
| `CRON_SECRET` | Ability to fire `/api/cron/*` — retention sweeps, digests |
| `VAPID_PRIVATE_KEY` / APNs key | Push to devices subscribed via production |
| `POSTGRES_PASSWORD` | Nothing extra by itself, but removes a layer if the network is ever reachable |

**Genuinely fine to share:** the Google OAuth client id + secret. One client serving both hosts is the
deliberate design (§5), and it grants no cross-environment session.

There is no effort saved by sharing: `generate-env.sh` produces all of these in one command, on the
box, in seconds.

### The only realistic route to a crossover is `NEXTAUTH_URL`

Which is why it's called out in step 5 and §2. Several places build URLs from it directly, and each
would point at production if it were left at the production value:

- `src/middleware.ts:45` — the internal resolve-host call
- `src/app/api/integrations/gmail/connect|callback` — the connector redirect URI
- `src/server/pulse-agents/monitor.ts:240` — registered webhook callback URLs

Note `AUTH_TRUST_HOST=true` lets Auth.js derive its own base URL from the forwarded `Host` header,
so **NextAuth's own callback and the hand-rolled builders above can disagree** — the login flow could
land correctly on staging while a Pulse monitor still registers a production webhook. Don't rely on
one covering for the other: set `NEXTAUTH_URL` correctly and the question doesn't arise.

### One inert quirk, so nobody "fixes" it

`DEFAULT_HOSTS` (`src/middleware.ts:14`) lists production and the Vercel hosts, **not** the staging
host — so `isDefaultHost()` is `false` on staging. That sounds alarming and isn't: the branch it
guards is `!isDefaultHost(host) && looksLikeShareToken(pathname)`, and `looksLikeShareToken` requires
the **first path segment to be 16+ url-safe characters**. No normal route qualifies — not `/`, not
`/login`, not `/app/**`, not `/api/**` — so the custom-hostname lookup never runs for ordinary
staging traffic and costs nothing.

It only fires if someone visits a root-level token-shaped URL on staging
(`https://staging.foundry.gitwork.tech/<16+ chars>`), which is the custom-domain share-link feature.
With `NEXTAUTH_URL` set correctly that does one lookup against staging itself, finds no match, and
falls through. Adding the staging host to `DEFAULT_HOSTS` would be tidier but changes nothing
observable, so it's deliberately left alone rather than shipped as a production-file edit.

---

## 3. What staging must never share with production

1. **The database** — not the same server, not the same volume, not a second database name on the
   same container.
2. **`ENCRYPTION_KEY`** — §0.
3. **Live third-party write tokens** — Slack bot token, Google refresh tokens, Resend key, Care
   connector tokens. These live in the **database**, not the `.env`, so a restored dump carries them
   silently. §4.
4. **`NEXTAUTH_URL`** — §2.
5. **The `:latest` tag and `/opt/apps/foundry`** — sharing either means a staging deploy restarts
   production. Staging uses `:staging` and `/opt/apps/foundry-staging`.

---

## 4. Database

**Start empty** unless you specifically need production data. Step 7 applies the schema; step 9
creates your user.

### If you restore a production dump, scrub it in the same session

A dump carries live third-party write credentials **in the database**. Left in place, staging posts
to real client Slack channels (Foreman digests, Dispatch replies, task standups), writes to the real
Google Drive (`docs-gdrive-backup`), reads real mailboxes, and emails real admins from Backstage.

Run this immediately after restore, **before starting the app**. Column names checked against
`prisma/schema.prisma` — re-check before running, since a silently-missed column is the exact failure
this exists to prevent.

```sql
-- Slack. NOTE BOTH: slackBotToken is the LEGACY PLAINTEXT column (kept for
-- migration), slackBotTokenEncrypted is what new reads go through. Nulling only
-- one leaves a working token behind.
UPDATE "Workspace" SET
  "slackBotToken"               = NULL,
  "slackBotTokenEncrypted"      = NULL,
  "slackSigningSecretEncrypted" = NULL,
  "slackAppId"                  = NULL,
  "slackTeamId"                 = NULL,
  "slackBotUserId"              = NULL,
  "slackSummaryChannelId"       = NULL,
  "slackChannels"               = NULL,
  "channelRoutes"               = NULL;

-- Email (Resend / SMTP) — stops Backstage + digests mailing real people
UPDATE "Workspace" SET "emailApiKey" = NULL, "emailSmtpPassword" = NULL;

-- AI keys: staging spends against its own budget, not production's
UPDATE "Workspace" SET
  "anthropicApiKey"      = NULL,
  "openaiApiKey"         = NULL,
  "geminiApiKey"         = NULL,
  "anthropicAdminApiKey" = NULL,
  "openaiAdminApiKey"    = NULL,
  "externalApiKey"       = NULL,
  "turnstileSecretKeyEncrypted" = NULL;

-- Google OAuth refresh tokens — on BOTH tables (Scribe, docs backup, Care)
UPDATE "User"      SET "googleOAuthRefreshToken" = NULL;
UPDATE "Workspace" SET "googleOAuthRefreshToken" = NULL;

-- Drive backup off + folder forgotten
UPDATE "Workspace" SET "docsBackupEnabled" = false, "docsBackupFolderId" = NULL;

-- Care connector tokens (analytics APIs, mailboxes)
UPDATE "AccountConnection" SET "scraperConfig" = NULL;

-- Client platform logins — real credentials to real client systems
UPDATE "ClientPlatformLogin" SET "usernameCipher" = NULL, "passwordCipher" = NULL;

-- Background agents off until deliberately enabled
UPDATE "Workspace" SET "curatorConfig" = NULL, "foremanConfig" = NULL, "dispatchConfig" = NULL;

-- Public share tokens: rotating them stops a staging link resolving as if it were prod
UPDATE "Document"        SET "shareToken" = NULL, "isShared" = false;
UPDATE "PulseScan"       SET "shareToken" = NULL;
UPDATE "WorkspaceClient" SET "timelineShareToken" = NULL;
```

Bank details in the onboarding tables will be undecryptable under staging's own `ENCRYPTION_KEY` —
intended, not a fault to work around.

---

## 5. OAuth — the only way in

Covered in steps 2, 3 and 9. Three things must line up, and each fails differently:

| Symptom | Cause | Fix |
|---|---|---|
| Google's own `redirect_uri_mismatch` page, before Foundry loads | Redirect URI missing | Step 2 |
| Flow completes but you land on `foundry.gitwork.co.uk` | `NEXTAUTH_URL` still production | Step 5 |
| Generic error **after** a successful Google consent | Email isn't `@gitwork.co.uk` | Step 3 |
| Signed in, but the app looks half-empty | Not Super Admin; Dan hasn't signed in first | Step 9 |

The **"Foundry Care"** client (a different one) needs the staging host on its redirect URIs too —
`/api/integrations/gmail/callback` — but only if you're testing Care.

---

## 6. Deploying from now on

`.github/workflows/deploy-staging.yml`:

- **push to `staging`** → auto-deploy.
- **`workflow_dispatch`** → deploy **any branch**. This is the one that makes staging worth having:
  a feature branch can be opened in a browser, which nothing else allows.

Three deliberate differences from production's `deploy.yml`, each a safety boundary:

1. **`concurrency: deploy-staging`** — sharing `deploy-production` would couple the two environments
   for no reason. `cancel-in-progress` is **true** here (you're iterating; newest push wins) and
   **false** in production (cancelling mid-run can leave the box half-deployed).
2. **Tags `:staging` / `:staging-<sha>`, never `:latest`** — `:latest` is what production's compose
   pulls, so pushing it from here would deploy staging code to production on its next restart.
   `deploy.yml`'s header records the 2026-07-28 incident where two runs racing on `:latest` silently
   reverted production; this is that hazard across environments, and much harder to spot.
3. **`/opt/apps/foundry-staging`**, and it fails loudly if `.env` has no `DATABASE_URL` rather than
   starting a container that 500s on every page.

The version string carries a `-staging` suffix so the sidebar footer makes the environment obvious.

---

## 6a. Wiki and client portal — how they actually work

Not staging-specific, but the first two things anyone testing a fresh workspace trips over.

### The `/wiki/<slug>` 404

**`/wiki/<something>` treats that segment as a SHARE TOKEN, not a client slug.** It's a legacy
redirect (`src/app/wiki/[slug]/page.tsx` — the directory is named `[slug]` to match the canonical
two-segment route, but the comment says outright that it "actually holds the share token"). So
visiting `/wiki/my-dummy-client` calls `resolvePublicWiki("my-dummy-client")`, finds nothing, and
`notFound()`s. **A 404 there is correct behaviour, not a broken client.**

The three URLs that matter:

| URL | What it is | Auth |
|---|---|---|
| `/app/portal/<slug>/wiki` | **Internal** wiki workspace — where the team edits | Team Google sign-in |
| `/wiki/<slug>/<token>` | **Public** client-facing wiki — the canonical form | The token, plus a portal login for gated sections |
| `/wiki/<token>` | Legacy single-segment share links | 307s to the canonical form |

Get the token by enabling the share: `POST /api/clients/<slug>/wiki/share`, or the share control on
the wiki workspace.

**The wiki record itself never needs creating.** `getWikiBySlug` → `getOrCreateWiki(clientId)`, and
`ensureWikiId` upserts — so it materialises on first access. If `/app/portal/<slug>/wiki` 404s, the
*client* lookup failed (`workspaceId_slug`), not the wiki: check the slug in the URL matches
`WorkspaceClient.slug`, which is `slugifyClientName(name)` and not always what you'd guess from the
display name.

### Client portal login is NOT Google

A different auth system from the team's, and the distinction matters when making test accounts:

- **Team** (`/app/**`) → Google OAuth, restricted to `@gitwork.co.uk` (§5).
- **Clients** (`/portal/login`) → **email + password**, stored as a `ClientWikiUser` row with a bcrypt
  hash, scoped to one client's wiki. No Google, no domain restriction — so a client can be on any
  email.

`POST /api/portal/login` checks the credentials across **every** client wiki, sets an access cookie
per wiki the user can reach, and returns the list — one match goes straight in, several show a
chooser. That's why there's no client picker on the login form.

### Making a test client login

Create the user against the client (password **min 8 characters**; requires `canManageClients`):

```bash
curl -X POST https://staging.foundry.gitwork.tech/api/clients/<slug>/wiki/users \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"usman@example.com","password":"<8+ chars>","name":"Usman"}'
```

Then they sign in at `/portal/login`. List or remove them via `GET` / `DELETE` on the same route.
There is also a UI for this on the wiki workspace's users panel — prefer that if you're already in
the app.

⚠️ **Use a throwaway address, not a real client's.** On staging this is harmless; the same call
against production creates a real portal account with a real password.

---

## 7. Crons — install nothing at first

17 `/api/cron/*` routes ship; none fire on their own (`docs/vps-crons.md`). Leave staging's crontab
**empty** until you've decided per route, because several have outbound side-effects:
`docs-gdrive-backup` writes to Drive, `support-sync` reads mailboxes, `foreman` / `care-digest` /
`availability-digest` notify people, `meet-transcripts` reads Drive.

Test one by hand instead:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://staging.foundry.gitwork.tech/api/cron/jobs
```

Two things worth knowing before copying production's crontab, both from `docs/vps-crons.md`:

- **`foreman`, `curator`, `retention` and `wedge-keepwarm` have never run in production.** Documented,
  absent from the live crontab.
- **`retention`'s first run is not a no-op** — it sweeps the entire accumulated backlog in one pass.
  Staging on a scrubbed dump is the right place to find out what that does before it's ever installed
  in production. That's the first concrete payoff from having staging.

---

## 8. Verification checklist

In order — each failure mode is distinct, so don't skip ahead.

| # | Check | Expected |
|---|---|---|
Checks 1–5 need **no login and no shell** — they can be run by anyone, from anywhere, and they cover
the two failures most likely to go unnoticed.

| # | Check | Expected |
|---|---|---|
| 1 | `dig +short staging.foundry.gitwork.tech` | `194.164.127.222` |
| 2 | `curl -I https://staging.foundry.gitwork.tech` | valid cert, **no** `Server: nginx/<version>` |
| 3 | `curl https://staging.foundry.gitwork.tech/api/health` | 200 with `commit` / `builtAt` |
| 4 | `curl https://staging.foundry.gitwork.tech/robots.txt` | `Disallow: /` — see the ⚠️ below |
| 5 | **`curl https://staging.foundry.gitwork.tech/api/auth/providers`** | every URL on the **staging** host — this is the definitive `NEXTAUTH_URL` test |
| 5 | `docker compose exec db psql -U foundry -c '\dx'` | lists **`vector`** — if not, the db image is wrong (§2 of the compose file) |
| 6 | `docker compose logs app \| tail -50` | no repeated errors |
| 7 | Visit `/` | 307 → `/portal/login` |
| 8 | **Dan** signs in with Google | lands on staging, **not** `foundry.gitwork.co.uk`. Symptom table in §5 |
| 9 | Settings → Team | Dan is Super Admin, full matrix visible |
| 10 | Sidebar footer | version ends `-staging` |
| 11 | Care → semantic search | returns results (proves pgvector end to end) |
| 12 | `grep -c '<prod ENCRYPTION_KEY>' .env` | **0** |

Checks 8, 11 and 12 are the three that fail from copying the production `.env` verbatim, and none
announces its cause.

### Check 5 is the one worth knowing about

`GET /api/auth/providers` is public and returns NextAuth's own resolved URLs:

```json
{"google":{"id":"google","name":"Google","type":"oidc",
 "signinUrl":"https://staging.foundry.gitwork.tech/api/auth/signin/google",
 "callbackUrl":"https://staging.foundry.gitwork.tech/api/auth/callback/google"}}
```

If either URL names `foundry.gitwork.co.uk`, `NEXTAUTH_URL` is still the production value and the
login flow will complete **on production** — the silent failure this runbook keeps warning about.
This turns it from something you discover by signing in and squinting at the address bar into a
one-line check anyone can run before touching the box.

### ⚠️ Check 4 failed on the first real deployment — staging was indexable

Verified live on 2026-07-30. The app's own `src/app/robots.ts` is written for production, so it
serves `Allow: /` under **any** hostname, and these were reachable and un-disallowed on staging:

```
/pulse-overview   200    (and carries no noindex meta)
/api-docs         200
```

So Google could index staging copies of both, competing with production for the same content. It also
serves `Host:` and `Sitemap:` pointing at `foundry.gitwork.co.uk` — a weak canonical hint that does
not prevent crawling. (`/context` and `/provenance-overview` were fine: disallowed *and* carrying
`noindex` meta.)

This is exactly why the nginx `location = /robots.txt` block in
`deploy/staging/nginx/staging.foundry.conf` exists rather than leaving it to the app: nginx takes
precedence over the Next route, needs no deploy, and cannot be undone by one. Apply it before staging
is linked anywhere public.

---

## 9. What staging unlocks — and the docs to update

Once step 12 passes, update the three "there is no staging" claims in CLAUDE.md §2,
`ONBOARDING.md` §"Deploying" and `docs/build-checklist.md`. Two of them are load-bearing beyond the
wording:

**`npm run audit:clipping` can finally run against `/app`.** §31 and `docs/build-checklist.md`
record this as deferred with a specific reason: the runtime clipping audit "needs a reachable page
and those are auth-gated", so the screens where most layout defects actually live have only ever had
the *static* `audit:ui` over them. §30 lists what that gap cost — two `/app` layout defects found by
screenshot rather than by any detector, and §30 pass 4's radius bugs found from a screenshot Dan
took. Staging is a reachable `/app`. Wiring `audit:clipping` at it is the highest-value follow-up
here and should be its own PR.

**Verification honesty changes.** `docs/build-checklist.md`'s "no staging, no branch previews,
`/app` can't be self-screenshotted" section is the basis for a lot of "verified via `tsc` + `eslint`,
not visually verified" notes throughout CLAUDE.md. That caveat stops being necessary for anything
reachable on staging — but only once the environment is genuinely up, which is why the update waits
for step 12 rather than shipping with this runbook.

Also worth settling while you're here: **production may have the same pgvector gap.** The committed
root `docker-compose.yml` pins `postgres:17-alpine`, which has no `vector`, while §23 says the image
must ship it. Either the box runs something other than the committed file, or Care semantic search
has never worked in production. `docker compose exec db psql -U foundry -c '\dx'` in
`/opt/apps/foundry` settles it in one command.
