# Foundry staging environment — setup runbook

Staging lives at **`staging.foundry.gitwork.tech`** (Fasthosts VPS, Docker Compose — same shape as
production, see CLAUDE.md §23). This file is what to set, what **not** to copy from production, and
the five things that will silently break if you copy the production `.env` verbatim.

> **Status:** CLAUDE.md, `ONBOARDING.md` §"Deploying" and `docs/build-checklist.md` all still state
> *"there is no staging environment and there are no branch preview URLs."* That was true until now.
> Those three claims want updating **once staging is verified live** — not before, or a new builder
> will trust an environment that isn't answering yet.

---

## 0. 🔴 Before anything else — rotate what leaked

A full production `.env` was pasted into Slack on 2026-07-30 to seed this work. Slack is not a
secret store: that message is in channel history, in Slack's search index, in every member's local
cache, and in any export. **Every value in it is now burned and must be rotated in production**,
independently of whether staging ever goes live.

Most urgent first — the top three are live credentials to systems outside Foundry:

| Secret | Why it's urgent | Rotate at |
|---|---|---|
| `GITHUB_TOKEN` (`github_pat_11BPN2ODY0…`) | Full PAT. Grants repo read/write to `Git-Dann/*` — source, and fix-agent PR creation | GitHub → Settings → Developer settings → PAT. **Revoke the old one.** Re-add as Actions secret `FOUNDRY_GITHUB_TOKEN` (§35 — GitHub rejects secret names starting with `GITHUB_`) |
| `AUTH_GOOGLE_SECRET` | OAuth client secret for team sign-in | Google Cloud Console → Credentials → "Foundry Login" → Reset secret |
| `APNS_AUTH_KEY` | Apple push signing key (`.p8` contents). Signs push to real devices | Apple Developer → Keys → revoke, create new, note the new `APNS_KEY_ID` |
| `POSTGRES_PASSWORD` | Production database password | Change in Postgres + the VPS `.env`. (§23 already flagged this one as pending rotation from the migration — it is now overdue twice) |
| `AUTH_SECRET` | Signs NextAuth sessions. A holder can forge a session cookie | `openssl rand -base64 33`. Everyone is logged out once — harmless |
| `NEXT_PUBLIC_API_KEY` | Gates all `/api/*` except `/api/health` | Generate fresh. Already public-by-design (inlined in the client bundle) but still the API gate |
| `CRON_SECRET` | Guards `/api/cron/*` — lets a caller trigger retention sweeps, digests | `openssl rand -hex 32` |
| `VAPID_PRIVATE_KEY` | Signs browser push | Regenerate the pair (`npx web-push generate-vapid-keys`); existing subscriptions re-subscribe |
| `WEDGE_*` credentials | Client system logins | Coordinate with Big Wedge before changing |

### `ENCRYPTION_KEY` is the exception — and the reason it must not go on staging

Do **not** rotate it, and do **not** put the production value on staging.

It is the AES-256-GCM key (`src/lib/encryption.ts`) that encrypts **client bank details** captured
in onboarding. Rotating it makes every stored bank record permanently unreadable
(`docs/fasthosts-secrets-recovery.md` marks it 🔴 for exactly this). But putting it on staging means
anyone with staging shell access can decrypt real client banking data — so staging gets its **own
fresh key**, and staging holds no real bank records.

That combination is uncomfortable and it is the correct call: the prod key stays where it is,
access to the prod box gets tightened, and the leak is logged. Flag it to Dan as a known
accepted risk rather than quietly rotating.

---

## 1. What staging must never share with production

Five things. Each has bitten a staging environment somewhere before.

1. **The database.** Not the same server, not the same volume, not just a different database name on
   the same container.
2. **`ENCRYPTION_KEY`** — see above.
3. **Live third-party write tokens** — Slack bot token, Google refresh tokens, Resend email key,
   Care connector API tokens. These live in the **database**, not the `.env`, so restoring a
   production dump carries them across silently. §4 has the scrub.
4. **`NEXTAUTH_URL`** — must be the staging host, or login and every OAuth redirect goes to prod.
5. **The `:latest` image tag and the `/opt/apps/foundry` directory** — sharing either means a
   staging deploy restarts production. §6.

---

## 2. The staging `.env`

Annotated. `⚠️` marks a value that differs from production and will break staging if copied.

```bash
NODE_ENV=production          # correct — this is a production Next build, not dev mode

# ── Database ─────────────────────────────────────────────────────────────────
# ⚠️ Its OWN Postgres, not a second database on the production container.
# See §3 for the compose project that provides this host.
DATABASE_URL="postgresql://foundry:<staging-db-password>@db:5432/foundry?sslmode=disable"
DIRECT_URL="postgresql://foundry:<staging-db-password>@db:5432/foundry?sslmode=disable"
POSTGRES_PASSWORD="<staging-db-password>"     # ⚠️ not the production one

# ── Auth ─────────────────────────────────────────────────────────────────────
# ⚠️ THE SINGLE MOST IMPORTANT LINE IN THIS FILE. Anything else here and Google
# login bounces to production, the Gmail connector's redirect_uri is rejected,
# middleware's resolve-host call (src/middleware.ts:45) queries prod, and Pulse
# monitor webhooks register prod callback URLs.
NEXTAUTH_URL="https://staging.foundry.gitwork.tech"
AUTH_SECRET="<openssl rand -base64 33>"       # ⚠️ staging's own — never the prod value
AUTH_TRUST_HOST=true

# Add https://staging.foundry.gitwork.tech/api/auth/callback/google to the
# "Foundry Login" OAuth client's authorised redirect URIs first — see §5.
AUTH_GOOGLE_ID="<login client id>"
AUTH_GOOGLE_SECRET="<login client secret>"

# "Foundry Care" client — Gmail/Calendar/Drive connector. Separate client from the
# login one. Leave BLANK unless you're testing the Care/Scribe connectors; blank
# means those features are simply unavailable, which is the right staging default.
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_IOS_SERVER_CLIENT_ID=""                # only for iOS Google sign-in

# ── App / API auth + encryption ──────────────────────────────────────────────
API_KEY="<openssl rand -base64 32>"           # ⚠️ staging's own
NEXT_PUBLIC_API_KEY="<same value as API_KEY>" # middleware falls back to this
ENCRYPTION_KEY="<openssl rand -base64 32>"    # ⚠️ MUST differ from prod — §0

# ── URLs used in outbound links ──────────────────────────────────────────────
# ⚠️ Set these. Unset, both DEFAULT TO THE PRODUCTION URL
# (src/server/notifications.ts:137, src/server/slack/blocks.ts:16,
# src/app/layout.tsx:59) — so staging notifications deep-link into prod.
# Read server-side only, so runtime .env is enough; no Docker build arg needed.
NEXT_PUBLIC_APP_URL="https://staging.foundry.gitwork.tech"
NEXT_PUBLIC_SITE_URL="https://staging.foundry.gitwork.tech"

# ── Initial admin ────────────────────────────────────────────────────────────
# ⚠️ NOT admin@example.com. ensureInitialAdmin() calls isSeedAccountEmail()
# (src/server/seed-accounts.ts:60) which rejects the whole @example.com domain
# and RETURNS EARLY WITHOUT CREATING ANYTHING. On a fresh staging database that
# leaves no way to sign in, with no error to tell you why.
# Note: whatever address you set is added to seedAccountEmails(), so this account
# is hidden from people-pickers and rosters by design. Login still works.
INITIAL_ADMIN_EMAIL="staging-admin@gitwork.co.uk"
INITIAL_ADMIN_PASSWORD="<a real password, changed in-app after first login>"

# ── AI ───────────────────────────────────────────────────────────────────────
# Per-workspace keys also live in the DB (Settings → AI provider); these are the
# fallback. A staging key with its own spend cap keeps staging scans off the
# production budget.
ANTHROPIC_API_KEY=""
ANTHROPIC_ADMIN_KEY=""
OPENAI_API_KEY=""                             # optional alt provider
GEMINI_API_KEY=""                             # optional alt provider

# ── Crons ────────────────────────────────────────────────────────────────────
CRON_SECRET="<openssl rand -hex 32>"          # ⚠️ staging's own. See §7 first

# ── Optional / feature-gated — safe to leave blank ───────────────────────────
GITHUB_TOKEN=""                    # Pulse repo scans. Use a read-only staging PAT
PROVENANCE_SIGNING_SECRET=""       # blank ⇒ Countermarks issue UNSEALED and say so (§38)
GOOGLE_PSI_API_KEY=""              # better Pulse PageSpeed quota
DEEPGRAM_API_KEY=""                # DevSignal transcription
DEVSIGNAL_ACCESS_PASSWORD=""       # defaults to "gitwork-devsignal" if unset
NEXT_PUBLIC_TURNSTILE_SITE_KEY=""  # public Pulse embed bot-gate
TURNSTILE_SECRET_KEY=""
COLD_STORE_DIR=""                  # retention cold store; unset ⇒ feature off

# ── iOS push (APNs) ──────────────────────────────────────────────────────────
# ⚠️ Leave blank unless testing push. If you do set it, APNS_PRODUCTION MUST be
# "false" — sandbox tokens from a dev/TestFlight build are rejected outright by
# the production APNs endpoint, which looks like "push is broken".
APNS_AUTH_KEY=""
APNS_KEY_ID=""
APNS_TEAM_ID=""
APNS_BUNDLE_ID="uk.co.gitwork.axisapp"
APNS_PRODUCTION="false"

# ── Web push (VAPID) ─────────────────────────────────────────────────────────
# ⚠️ Generate a staging pair (npx web-push generate-vapid-keys) — sharing the
# prod pair lets staging push to browsers subscribed via production.
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:dan@gitwork.co.uk"

# ── Client system credentials ────────────────────────────────────────────────
# ⚠️ Leave BLANK. These are real logins to a real client's systems; staging has
# no business holding them.
WEDGE_APP_API_USER=""
WEDGE_APP_API_PASSWORD=""
WEDGE_COURSE_API_USER=""
WEDGE_COURSE_API_PASSWORD=""
```

### Not in the pasted file, and not needed

`NEXTAUTH_SECRET` is read as a legacy alias — set it to the same value as `AUTH_SECRET` only if
something complains. `ASSAY_SIGNING_SECRET` is the pre-rename fallback for
`PROVENANCE_SIGNING_SECRET` (see `deploy.yml`); on a new environment just set the new name.
`BASE_URL`, `PULSE_API_URL` and `PULSE_API_KEY` appear in a grep of `process.env` but have no live
read in `src/` — ignore them.

---

## 3. Compose — a separate project, not a second database

The pasted config used `foundry_staging` as a database name on host `db`. Two problems: the
committed `docker-compose.yml` hardcodes `POSTGRES_DB: foundry`, so `foundry_staging` **does not
exist** and never gets created; and if `db` resolves to the production container, staging is one
typo away from writing to production.

Run staging as its own Compose project in its own directory (`/opt/apps/foundry-staging`), which
gives it its own network, its own `postgres_data` volume, and its own `db` hostname.

### ⚠️ `postgres:17-alpine` has no pgvector

`src/server/bootstrap.ts:134` runs, on every boot:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "SupportConversation" ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS "SupportConversation_embedding_hnsw" ON "SupportConversation" USING hnsw (embedding vector_cosine_ops);
```

All three statements sit inside a swallow-everything `try/catch` (bootstrap.ts:155-161), so with the
stock `postgres:17-alpine` image **boot succeeds, logs nothing, and the column is never created** —
Care semantic search then fails at query time, far from the cause. Use `pgvector/pgvector:pg17`.

> This is worth checking on **production** too. The committed compose pins `postgres:17-alpine`
> while CLAUDE.md §23 says the image "must ship the `vector` extension". Either the box is running
> something other than the committed file, or Care semantic search has never worked in production.
> `docker compose exec db psql -U foundry -c '\dx'` settles it — that is a question for Dan, not a
> change to make from here.

```yaml
# /opt/apps/foundry-staging/docker-compose.yml
name: foundry-staging            # own project ⇒ own network + volume namespace

services:
  db:
    image: pgvector/pgvector:pg17     # NOT postgres:17-alpine — see above
    container_name: foundry-staging-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: foundry
      POSTGRES_USER: foundry
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U foundry"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    # Pin a tag, don't track :latest — staging should move when you choose.
    image: ghcr.io/git-dann/docs-by-gitwork:latest
    container_name: foundry-staging
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "3001:3000"          # 3000 is production's. Nginx proxies staging here
    env_file:
      - .env

volumes:
  postgres_data:
```

### Nginx + DNS + certificate

`deploy/nginx/foundry.conf` is production-only (`server_name foundry.gitwork.co.uk`, proxying
`127.0.0.1:3000`). Staging needs its own server block: copy that file, change `server_name` to
`staging.foundry.gitwork.tech`, change `proxy_pass` to `http://127.0.0.1:3001`, keep
`server_tokens off` and the `gzip on`/security-header blocks.

- **DNS** — `staging.foundry.gitwork.tech` needs an A record at the VPS IP. Note this is
  `gitwork.tech`, a different zone from the Squarespace-managed `gitwork.co.uk` (§23) — confirm who
  manages `.tech` before assuming the record can be added the same way.
- **Certificate** — its own Let's Encrypt cert: `certbot --nginx -d staging.foundry.gitwork.tech`.
- **Keep it out of search results.** `src/app/robots.ts` is written for the production host. Add a
  blanket `Disallow: /` for the staging host at the nginx layer, or staging pages get indexed and
  compete with production.

---

## 4. Database — fresh, or a scrubbed restore

**Prefer starting empty.** `bootstrap.ts` creates the base workspace and, with a valid
`INITIAL_ADMIN_EMAIL`, an admin. Schema is applied the same way production does it — a throwaway
container running `prisma db push` (never `npm run build`, which does a `db push` against whatever
`DATABASE_URL` it finds):

```bash
cd /opt/apps/foundry-staging
docker compose up -d db
docker compose run --rm --no-deps --user root --entrypoint sh app \
  -c "npx --yes prisma@6.16.2 db push --schema=prisma/schema.prisma --skip-generate"
docker compose up -d app
```

### If you restore a production dump, scrub it in the same session

A dump carries **live third-party write credentials in the database**, not in the `.env`. Left in
place, staging will post to real client Slack channels (Foreman digests, Dispatch replies, task
standups), write to the real Google Drive (`docs-gdrive-backup`), read real mailboxes, and email
real admins from Backstage. Run this immediately after restore, before starting the app:

Column names below are checked against `prisma/schema.prisma` at the time of writing. **Re-check
before running** — a silently-missed column is exactly the failure this scrub exists to prevent.

```sql
-- Slack. NOTE both: slackBotToken is the LEGACY PLAINTEXT column (kept for
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

-- AI keys: staging should spend against its own budget, not production's
UPDATE "Workspace" SET
  "anthropicApiKey"      = NULL,
  "openaiApiKey"         = NULL,
  "geminiApiKey"         = NULL,
  "anthropicAdminApiKey" = NULL,
  "openaiAdminApiKey"    = NULL,
  "externalApiKey"       = NULL,
  "turnstileSecretKeyEncrypted" = NULL;

-- Google OAuth refresh tokens — on BOTH tables (Calendar/Gmail/Drive: Scribe,
-- the docs backup, the Care connector)
UPDATE "User"      SET "googleOAuthRefreshToken" = NULL;
UPDATE "Workspace" SET "googleOAuthRefreshToken" = NULL;

-- Drive backup off + folder forgotten
UPDATE "Workspace" SET "docsBackupEnabled" = false, "docsBackupFolderId" = NULL;

-- Care connector tokens (analytics APIs, mailboxes) live on scraperConfig
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

Any client bank details in the onboarding tables will be undecryptable under staging's own
`ENCRYPTION_KEY` — that is the intended outcome, not a fault to work around.

---

## 5. Google OAuth

Login is the first thing you'll test and the first thing that will fail. In Google Cloud Console →
the Gitwork project → APIs & Services → Credentials → the **"Foundry Login"** web client, add to
*Authorised redirect URIs*:

```
https://staging.foundry.gitwork.tech/api/auth/callback/google
```

Adding a URI to the existing client is deliberate — a second OAuth client would mean a second
consent screen and a second secret to manage. Do **not** remove the production URI.

If you test the Care/Gmail connector, the **"Foundry Care"** client needs the staging host on its
redirect URIs too (`/api/integrations/gmail/callback`).

Note `src/auth.config.ts` carries a `SESSION_VERSION`; bumping it forces re-consent. Staging
signing in for the first time will consent anyway.

---

## 6. Deploying to staging

`.github/workflows/deploy.yml` is production-only and must stay that way. It triggers on push to
`main`, pushes `:latest`, and SSHes to `/opt/apps/foundry`. Three things to get right if you add a
staging workflow:

1. **A different `concurrency` group.** The current group is `deploy-production`; reusing it makes
   staging deploys queue behind production ones and vice versa.
2. **A different image tag and directory** — e.g. `:staging` into `/opt/apps/foundry-staging`.
   Sharing `:latest` means a staging build overwrites the tag production pulls from. The header
   comment on `deploy.yml` records a real incident (2026-07-28) where two runs racing on `:latest`
   silently reverted production — the same hazard, one environment wider.
3. **Its own managed-secret sync.** The `upsert_env` block writes into `/opt/apps/foundry/.env`;
   staging's path and its own Actions secrets (`STAGING_VPS_*`) need to be distinct.

The simplest start needs no workflow at all — pin a tag by hand:

```bash
cd /opt/apps/foundry-staging
docker compose pull app && docker compose up -d --no-deps --force-recreate app
```

---

## 7. Crons — install nothing at first

The app ships **17** `/api/cron/*` routes. None fire on their own; the VPS crontab drives them
(`docs/vps-crons.md`). Leave staging's crontab empty until you've decided per-route what should run,
because several have outbound side-effects: `docs-gdrive-backup` writes to Drive, `support-sync`
reads mailboxes, `foreman`/`care-digest`/`availability-digest` notify people, `meet-transcripts`
reads Drive.

Two things worth knowing before you copy production's crontab, both recorded in
`docs/vps-crons.md`:

- **`foreman`, `curator`, `retention` and `wedge-keepwarm` have never run in production.** They are
  in the docs and absent from the live crontab.
- **`retention` is not a no-op on first run** — it sweeps the entire accumulated backlog in one
  pass. Staging is genuinely the right place to find out what that does, on a scrubbed dump, before
  it is ever installed in production. That's the first real payoff from having staging at all.

Test a route by hand instead:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://staging.foundry.gitwork.tech/api/cron/jobs
```

---

## 8. Verification checklist

In order — each step's failure mode is distinct, so don't skip ahead.

| # | Check | Expected |
|---|---|---|
| 1 | `curl https://staging.foundry.gitwork.tech/api/health` | 200, with `commitSha` / `buildTime` |
| 2 | `docker compose exec db psql -U foundry -c '\dx'` | lists `vector` — if not, §3's image is wrong |
| 3 | `docker compose logs app \| grep -i bootstrap` | no repeated errors |
| 4 | Visit `/` | 307 → `/portal/login` (CLAUDE.md §4) |
| 5 | Sign in with Google | lands on staging, **not** redirected to `foundry.gitwork.co.uk` |
| 6 | Sign in with `INITIAL_ADMIN_EMAIL` + password | works — if not, re-read §2's admin note |
| 7 | `curl -I https://staging.foundry.gitwork.tech` | valid cert, no `Server: nginx/<version>` |
| 8 | Open `/app` | sidebar renders; footer version matches the tag you pulled |
| 9 | Settings → AI provider | staging's own key, or blank |
| 10 | Send a test notification | link points at `staging.…`, not production |
| 11 | Care → semantic search | returns results (proves pgvector end to end) |
| 12 | Grep the staging `.env` for the production `ENCRYPTION_KEY` | **no match** |

Steps 5, 6 and 11 are the three that fail from copying the production `.env` verbatim, and none of
them announces its cause.
