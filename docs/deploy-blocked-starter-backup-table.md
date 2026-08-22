# Deploys were blocked by `_StarterBackup_20260822` — RESOLVED

**Status: RESOLVED 2026-08-22 12:21 UTC.** The fix shipped in `abd627a7` and ran on the
next deploy — the log reads `Relocating unmanaged table _StarterBackup_20260822 out of
public (moving, NOT dropping)` then `ALTER TABLE`, the `prisma db push` then succeeded,
and `https://foundry.gitwork.co.uk/production-ready` returned 200. The 438 rows are
intact at `scratch."_StarterBackup_20260822"`.

Kept because the mistake is repeatable and the rule below is the point. The one-shot
block in `deploy.yml` has now run and can be deleted.

## What is happening

Every push to `main` now fails at the `Deploy to VPS` step with:

```
⚠️  There might be data loss when applying the changes:
  • You are about to drop the `_StarterBackup_20260822` table, which is not empty (438 rows).
Error: Use the --accept-data-loss flag to ignore the data loss warnings
::error::prisma db push failed — leaving the running app on the previous image rather
         than restarting it against an unmigrated database.
```

Run 32566488844 (commit `7180a327`) is the first one it hit. **It is not caused by that
commit** — it will fail identically for any commit until the table is dealt with.

## Production is fine, and that is the guard working

`deploy.yml` runs `prisma db push` **without** `--accept-data-loss` (CLAUDE.md §2), and the
step is ordered *before* the app restart. So the failure left the previous image running
rather than restarting it against an unmigrated database. Verified at the time:

| Check | Result |
|---|---|
| `GET /api/health` | `200` |
| `GET /embed/pulse` | `200` |
| `GET /production-ready` | `404` — the new image never deployed |

So: nothing is broken, the newest commit simply is not live.

## Why the table exists

It is a belt-and-braces copy of `Starter` (`CREATE TABLE … AS SELECT * FROM "Starter"`,
438 rows) taken in this session before a planned Starter-row cleanup — alongside the
primary backup, a `pg_dump` at
`/opt/apps/foundry/backups/pre-starter-cleanup-20260822-092427.dump`. The cleanup itself
never ran (it was blocked at the tool layer and still needs a human), so the table is
still sitting there.

## The mistake worth not repeating

**Creating any table in the `public` schema of this database blocks every subsequent
deploy.** Prisma's `db push` reconciles the whole schema: a table it does not know about
is drift it wants to drop, and a non-empty table it wants to drop trips the guard, which
by §2's all-or-nothing behaviour aborts the *entire* sync. A scratch table is therefore
not a local, private thing here — it is a production deploy blocker with a delay fuse,
and it will not surface until the next person pushes.

If a temporary copy is ever needed again, put it somewhere Prisma does not manage:

```sql
CREATE SCHEMA IF NOT EXISTS scratch;
CREATE TABLE scratch.starter_backup_20260822 AS SELECT * FROM "Starter";
```

`db push` only reconciles the schemas in the datasource (`public`), so a table in
`scratch` is invisible to it and blocks nothing.

## FIXED IN CODE — `deploy.yml` now relocates it on the next deploy

**Status update.** Rather than leave production undeployable, `.github/workflows/deploy.yml`
gained a guarded one-shot step, immediately after `docker compose up -d db` and before the
`prisma db push`:

```
CREATE SCHEMA IF NOT EXISTS scratch;
ALTER TABLE public."_StarterBackup_20260822" SET SCHEMA scratch;
```

It **moves** the table; it does not drop it. All 438 rows survive verbatim at
`scratch."_StarterBackup_20260822"`, and `db push` stops seeing it because the datasource
only manages `public`. It is idempotent (guarded on `information_schema`) and reversible
with the inverse `SET SCHEMA public`.

Delete that block from `deploy.yml` once it has run — it is marked as one-shot in place.

The two manual routes below are kept as the fallback, and as the record of what the fix
does. Both need SSH, which was not available in the session that created the table.

**Option A — move it out of Prisma's way (preferred: loses nothing, reversible).**

```bash
ssh deploy@194.164.127.222
cd /opt/apps/foundry
docker compose exec -T db psql -U foundry -d foundry -c \
  'CREATE SCHEMA IF NOT EXISTS scratch; ALTER TABLE "_StarterBackup_20260822" SET SCHEMA scratch;'
```

**Option B — drop it, once you are satisfied the `pg_dump` is good.**

```bash
ssh deploy@194.164.127.222
cd /opt/apps/foundry
ls -la backups/pre-starter-cleanup-20260822-092427.dump      # confirm it exists and is non-trivial
docker compose exec -T db psql -U foundry -d foundry -c 'DROP TABLE "_StarterBackup_20260822";'
```

Then re-run the deploy — no code change and nothing to push, because `deploy.yml` accepts
`workflow_dispatch` (CLAUDE.md §35):

```bash
gh workflow run deploy.yml --ref main
```

Confirm it worked:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://foundry.gitwork.co.uk/production-ready   # expect 200
```

## Still outstanding after that

The Starter cleanup this table was protecting has **not** run. Its safety work is done —
`pg_dump` taken, a dry run showing 13 candidate rows all with 0 references, all 12 slugs
confirmed code-seeded, and every duplicate group proved byte-identical by content hash —
but the `DELETE` + `REINDEX TABLE "Starter"` itself was refused at the tool layer and
needs a human to run it. Do that **before** Option B, or keep the copy under `scratch`
until it is done.
