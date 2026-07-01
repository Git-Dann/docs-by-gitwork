# Database migration — Neon → Fasthosts (Foundry by Gitwork)

**Goal:** move the production PostgreSQL database from Neon (managed serverless) to a
self-hosted PostgreSQL on a Fasthosts Cloud Server, with **zero application code changes**.

**Who this is for:** whoever provisions and cuts over the database. Assumes comfort with a Linux
server, `psql`, and `pg_dump`/`pg_restore`.

**TL;DR:** The app connects to Postgres only through `DATABASE_URL` + `DIRECT_URL` (Prisma). This
is a *server-provisioning + data-copy* job. The one easy-to-miss requirement is **pgvector must be
installed on the target server** — the app creates a `vector(1536)` column on boot for Care
semantic search, and boot fails without it.

---

## 0. Facts about the current setup (do not skip)

| Thing | Value |
|---|---|
| ORM | Prisma 6 (`provider = "postgresql"`) |
| Connection vars | `DATABASE_URL` (pooled on Neon) + `DIRECT_URL` (direct on Neon) |
| Schema delivery | **`prisma db push`** on every build — **there are NO migration files** |
| Required extension | **`pgvector`** — used by Care semantic search |
| Extension provisioning | `src/server/bootstrap.ts` runs, idempotently, on app start: `CREATE EXTENSION IF NOT EXISTS vector`, `ALTER TABLE "SupportConversation" ADD COLUMN IF NOT EXISTS embedding vector(1536)`, and an HNSW index |
| SSL | Neon URLs use `sslmode=require` |

Because schema is delivered via `db push` (not migrations) and the vector bits are re-applied on
every boot, the target DB self-heals its schema **provided pgvector is installed**.

---

## 1. Pre-flight — gather these before touching anything

1. **Neon Postgres major version.** Neon console → project → overview (e.g. PostgreSQL **16** or
   **17**). You'll match this on Fasthosts and in the `pgvector` package name. Record it here:
   `PG_MAJOR = ____`
2. **Current Neon connection strings** — already exported to `.env.fasthosts` /
   `.env.vercel-production` in the repo (`DATABASE_URL`, `DIRECT_URL`). You need the **`DIRECT_URL`**
   for the dump (never dump through the pooler).
3. **Database size**, to gauge dump/restore time. From any machine with `psql`:
   ```bash
   psql "<NEON_DIRECT_URL>" -tAc "select pg_size_pretty(pg_database_size(current_database()));"
   ```
4. **Decide the app's future home** (affects pooling — see step 3):
   - App also moves to Fasthosts as a long-running Node server → **no pooler needed**.
   - App stays on Vercel serverless, DB on Fasthosts → **PgBouncer required** in front of Postgres.

---

## 2. Provision PostgreSQL + pgvector on Fasthosts

Fasthosts has no managed Postgres service — this runs on a Fasthosts **Cloud Server / VPS** that
you administer. (Example commands assume Ubuntu/Debian; adjust `PG_MAJOR`.)

```bash
# 1. Install PostgreSQL matching Neon's major version
sudo apt update
sudo apt install -y postgresql-16 postgresql-client-16      # <-- match PG_MAJOR

# 2. Install pgvector for that version — REQUIRED, or the app won't boot
sudo apt install -y postgresql-16-pgvector                  # <-- match PG_MAJOR

# 3. Create the database and an app role
sudo -u postgres psql <<'SQL'
CREATE ROLE foundry WITH LOGIN PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE foundry OWNER foundry;
SQL
```

**TLS/SSL:** configure `ssl = on` in `postgresql.conf` with a cert (Let's Encrypt or self-signed),
so the app can connect with SSL like it did to Neon. If you don't set up SSL, you must set the URL's
`sslmode` accordingly (e.g. `sslmode=disable` on a trusted private network) — but SSL is
strongly recommended since these are production credentials over the internet.

> You do **not** need to run `CREATE EXTENSION vector` by hand — the app's bootstrap does it on
> first boot. You only need the **package installed** so that command can succeed.

---

## 3. Connection strings for the app

The app needs both `DATABASE_URL` and `DIRECT_URL`.

- **Single self-hosted Postgres (no pooler):** point **both** at the same direct connection:
  ```
  DATABASE_URL="postgresql://foundry:PASSWORD@DB_HOST:5432/foundry?sslmode=require"
  DIRECT_URL="postgresql://foundry:PASSWORD@DB_HOST:5432/foundry?sslmode=require"
  ```
- **App stays on Vercel serverless:** install **PgBouncer** (transaction pooling) and point
  `DATABASE_URL` at PgBouncer (port 6432), `DIRECT_URL` at Postgres directly (port 5432). Without a
  pooler, serverless will exhaust Postgres connections.

Update these in `.env.fasthosts` (the Neon-specific `POSTGRES_*` / `PG*` / `NEON_PROJECT_ID` vars
are already excluded — the app never read them).

---

## 4. Migrate the data (dump → restore)

Do a full dump/restore (there are no migration files to replay).

```bash
# From a machine that can reach Neon (use the DIRECT, non-pooled URL):
pg_dump "<NEON_DIRECT_URL>" -Fc --no-owner --no-privileges -f foundry.dump

# Copy foundry.dump to the Fasthosts box, then restore:
pg_restore --no-owner --no-privileges -d \
  "postgresql://foundry:PASSWORD@localhost:5432/foundry" foundry.dump
```

Notes:
- The dump includes `CREATE EXTENSION IF NOT EXISTS vector`, the `embedding vector(1536)` column,
  and its HNSW index. **The `pgvector` package must already be installed** (step 2) or the restore
  errors on the extension line.
- Run `pg_dump`/`pg_restore` from a client whose version **matches the target major version**
  (`PG_MAJOR`). Newer client dumping an older server is fine; avoid an older client.
- A few `--no-owner`/`--no-privileges` warnings about roles are expected and harmless.

**Clean-start alternative (only if you do NOT need existing data):** skip the dump, point the env at
the empty Fasthosts DB — the build's `prisma db push` creates every table and bootstrap adds the
vector bits on first boot. You then reseed. **This discards all current data.**

---

## 5. Cutover (minimise data loss)

1. **Freeze writes** — put the app in maintenance mode / stop the running instance so no writes
   happen after the dump.
2. **Final `pg_dump`** from Neon (step 4).
3. **Restore** into Fasthosts (step 4).
4. **Switch env** — deploy the app with the new `DATABASE_URL`/`DIRECT_URL`.
5. **First boot** runs bootstrap's idempotent extension/column/index setup automatically. The build's
   `prisma db push` should report **no schema changes** against the restored DB.
6. **Resume traffic.**
7. **Keep Neon alive, read-only,** for a rollback window (a day or two) before deleting it.

---

## 6. Verify after cutover

- [ ] App boots with no errors in logs (watch for anything about `vector`/`extension`).
- [ ] Google login works.
- [ ] Create + edit a record (e.g. a client or task) — confirms writes.
- [ ] **Care semantic search returns results** — this is the *only* path that depends on pgvector,
      so it's the canary. If search errors, pgvector isn't installed/created on the target.
- [ ] Reconnect and confirm row counts on a couple of large tables match Neon.

---

## 7. Ongoing ownership (new, vs Neon)

Self-hosting takes on what Neon did for you. Set these up:

- **Backups** — scheduled `pg_dump` (or `pgBackRest` / WAL archiving) with off-box storage.
- **Monitoring** — disk, connections, slow queries.
- **Patching** — Postgres minor updates.
- **Connection limits** — tune `max_connections` (+ PgBouncer if serverless).
- **HA / failover** — Neon handled this transparently; there is none by default on a single VPS.

---

## Rollback

If anything fails after cutover: switch `DATABASE_URL`/`DIRECT_URL` back to the retained Neon strings
and redeploy. Because Neon was kept read-only (step 5.7), it's an instant revert — but any writes
made against Fasthosts post-cutover won't be on Neon, so decide early.
