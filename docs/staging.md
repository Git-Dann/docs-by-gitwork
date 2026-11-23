# Staging

A second copy of Foundry on the same VPS, for trying a branch on real infrastructure before it
reaches `main` (CLAUDE.md §148). It is off until someone deploys to it, and it never touches
production.

| | Production | Staging |
|---|---|---|
| Deployed by | push to `main` (`deploy.yml`) | **Actions → "Deploy to staging" → Run workflow**, any ref |
| Directory on the box | `/opt/apps/foundry` | `/opt/apps/foundry-staging` |
| Compose project | `foundry` | `foundry-staging` |
| Containers | `foundry`, `foundry-db` | `foundry-staging`, `foundry-staging-db` |
| Database | `foundry` (its own volume) | `foundry_staging` (its own volume) |
| App port | `127.0.0.1:3000` | `127.0.0.1:3001` |
| Image tag | `:latest`, `:<sha>`, `:previous` | `:staging`, `:staging-<sha>` |
| Address | `foundry.gitwork.co.uk` | `staging.foundry.gitwork.co.uk` (behind a password) |

## What keeps it away from production

`deploy/staging-deploy.sh` refuses to run unless all of these hold, before it runs anything:

- the directory is named `foundry-staging`;
- `DATABASE_URL` (and `DIRECT_URL`, if set) in the staging `.env` point at `@db:5432/foundry_staging`,
  the staging stack's own Postgres, so a `.env` copied from production can never reach the real
  database;
- the compose file is the staging one: project `foundry-staging`, app container `foundry-staging`,
  the `:staging` image and `127.0.0.1:3001`, and it names no production container or image.

Every Compose command is pinned to `-p foundry-staging` and the staging compose file. The workflow
pushes only `:staging` tags and has its own concurrency group. Staging's app is capped at 2 GB of
memory and its database is the first the kernel kills if the box runs out, so it can't starve
production. `src/__tests__/staging-deploy.test.ts` checks all of this against fake `docker` and
`curl`.

`prisma db push --accept-data-loss` is used on staging only: its database holds nothing worth
keeping. Production's deploy never passes that flag.

## Deploying

1. Actions → **Deploy to staging** → **Run workflow**.
2. `ref`: a branch, tag or full commit sha. `seed`: tick it to load the demo data.
3. The run builds the image from that ref, deploys it, and waits for
   `http://127.0.0.1:3001/api/health?deep=1` to report that exact commit. If staging isn't healthy
   the run fails; production is not affected either way.

The compose file and scripts always come from the default branch, so deploying an old ref can't
bring back an older, less careful staging setup.

## Demo data

With `seed` ticked, the deploy calls the existing seed routes on staging with staging's own
`API_KEY` (sent on stdin, never on a command line): `seed-demo` (Pulse), `seed-study-demo`,
`seed-provenance-demo`, `seed-starters-demo` and `seed-devsignal-demo`. Each is idempotent, so
seeding again replaces its own rows. First-time setup (the Gitwork workspace, the handbook, the
Starters) runs by itself when the app starts.

To seed by hand on the box:

```bash
cd /opt/apps/foundry-staging
KEY="$(grep '^API_KEY=' .env | cut -d= -f2-)"
curl -X POST -H "Authorization: Bearer $KEY" http://127.0.0.1:3001/api/dev/seed-demo
```

## One-time setup (Dan)

A staging stack may already be running on the box from before; if so, steps 2 and 3 are only a
check. Its data volume keeps its name, so nothing is lost.

1. **DNS.** In Squarespace DNS for `gitwork.co.uk`, add an **A record** `staging.foundry` pointing
   at the same address as the existing `foundry` record. Change nothing else.
2. **Directory**, owned by the deploy user:
   ```bash
   sudo mkdir -p /opt/apps/foundry-staging
   sudo chown deploy:deploy /opt/apps/foundry-staging
   ```
3. **`/opt/apps/foundry-staging/.env`**, owned by `deploy`, mode 600. Use NEW values for every
   secret; never copy production's `.env`:
   ```bash
   POSTGRES_PASSWORD=<openssl rand -hex 24>
   DATABASE_URL=postgresql://foundry:<that password>@db:5432/foundry_staging?sslmode=disable
   DIRECT_URL=postgresql://foundry:<that password>@db:5432/foundry_staging?sslmode=disable
   AUTH_SECRET=<openssl rand -base64 32>
   NEXTAUTH_URL=https://staging.foundry.gitwork.co.uk
   AUTH_URL=https://staging.foundry.gitwork.co.uk
   AUTH_TRUST_HOST=true
   NEXT_PUBLIC_APP_URL=https://staging.foundry.gitwork.co.uk
   API_KEY=<openssl rand -hex 32>
   CRON_SECRET=<openssl rand -hex 32>
   ENCRYPTION_KEY=<openssl rand -base64 32>
   AUTH_GOOGLE_ID=<the "Foundry Login" client id>
   AUTH_GOOGLE_SECRET=<its secret>
   ```
   Leave out Slack, Resend, APNs, the backup bucket and the AI keys unless a test needs them:
   staging must not message real people, page anyone or write to production's bucket. With no AI
   key, AI features say so rather than failing.
4. **Google sign-in.** In Google Cloud Console → the "Foundry Login" OAuth client, add the
   authorised redirect URI `https://staging.foundry.gitwork.co.uk/api/auth/callback/google`.
   The first `@gitwork.co.uk` owner to sign in becomes Super Admin, as on production.
5. **nginx and the certificate.** Copy [`deploy/nginx/staging.conf`](../deploy/nginx/staging.conf)
   to the box, then:
   ```bash
   sudo cp staging.conf /etc/nginx/sites-available/foundry-staging
   sudo ln -s /etc/nginx/sites-available/foundry-staging /etc/nginx/sites-enabled/
   sudo htpasswd -c /etc/nginx/foundry-staging.htpasswd gitwork   # the browser password
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d staging.foundry.gitwork.co.uk
   ```
   (`htpasswd` is in `apache2-utils`.)
6. **GitHub.** No new secrets: the workflow uses the same `VPS_HOST`, `VPS_USER` and `VPS_SSH_KEY`
   as production. Then run **Deploy to staging** once.

## Not on staging

- **Scheduled jobs.** Staging has no crontab, so monitors, digests, Pulse monitor scans and
  backups don't run there. Call a cron route by hand if a test needs one:
  `curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/cron/jobs`.
- **Production data.** Staging starts empty apart from first-time setup and the demo seed. Never
  restore a production backup into it: it would put client data behind a weaker setup.
