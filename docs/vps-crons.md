# VPS cron jobs

**The schedule is [`deploy/crontab`](../deploy/crontab). That file is the source of truth.**

Every deploy (`.github/workflows/deploy.yml`, step "Install scheduled jobs on the VPS") installs
it into the `deploy` user's crontab between two markers:

```
# BEGIN foundry-managed
…every line of deploy/crontab…
# END foundry-managed
```

using [`deploy/install-crontab.sh`](../deploy/install-crontab.sh). The install:

1. replaces the previous managed block;
2. removes any line **outside** the markers that runs `run-cron.sh <name>` for a job the managed
   file schedules (the hand-installed copies from before the repo owned the schedule), with the
   comment lines directly above it, and prints each one it removed;
3. keeps every other line exactly as it is, including the weekly `db-backup.sh` line;
4. reads the result back with `crontab -l` and **fails the deploy** if any managed line is
   missing, a job is scheduled more than once, or the markers are not there exactly once.

It prints the crontab before and after into the deploy log. Crontab lines carry no secrets:
`run-cron.sh` reads `CRON_SECRET` from the app `.env` itself. A copy of the crontab as it was is
left at `~deploy/crontab.before-deploy` on the box.

## Changing the schedule

Edit `deploy/crontab` and merge. Never use `crontab -e` on the box for a managed job: the next
deploy replaces a hand-edited managed line and removes an un-marked duplicate.

`src/app/api/cron/__tests__/crontab.test.ts` fails when:

- a route under `src/app/api/cron/` is neither in `deploy/crontab` nor in `UNSCHEDULED_CRONS`
  (with a reason);
- `deploy/crontab` names a route that does not exist, or schedules a job twice;
- `vercel.json` grows a `crons` block again.

**Adding a cron route means adding its line to `deploy/crontab` in the same PR**, or listing it in
`UNSCHEDULED_CRONS` on purpose.

## What is deliberately not scheduled

| Route | Why |
|---|---|
| _(none)_ | Every cron route is scheduled. `retention` was held back until Nov 2026; it only tiers Docs view events older than 60 days to cold storage, 200 a run, and never deletes for good. |

## Auth

Every cron route is guarded by `CRON_SECRET` and must be called with
`Authorization: Bearer $CRON_SECRET`. `run-cron.sh` does that and logs each endpoint's JSON result
to `/tmp/foundry-cron.log`. Its source is `deploy/run-cron.sh`. Every deploy runs the new copy once
against `jobs` and only then installs it at `/opt/apps/foundry/run-cron.sh` (the old one is kept
as `run-cron.sh.before-deploy`); if that call fails, the box keeps the copy it had. The call only passes when the runner prints its own
`jobs HTTP 2xx` line: an empty runner also exits 0, and that is how a 0-byte copy ran every job for two
days in Nov 2026 (CLAUDE.md §145). It passes the
secret to curl on stdin, so it never shows in `ps`.

## Noticing a job that stopped

Every authorised call to `/api/cron/<name>` records when it happened. The `jobs` worker compares
that with each job's longest allowed gap (`CRON_MAX_GAP`, `src/lib/cron-watch.ts`) and alerts
Gitwork's admins once when a job stops and once when it runs again (`system.ops_alert`, plus
Slack when `SLACK_OPS_WEBHOOK_URL` is set). The `jobs` worker itself is watched from outside:
`foundry-watchdog.yml` probes `/api/health?cron=1`, which answers 503 naming any stopped job.
A new line in `deploy/crontab` needs a `CRON_MAX_GAP` entry; `crontab.test.ts` fails without one.

## Vercel

`vercel.json` has no `crons` block. Vercel is kept only as a rollback target against the stale
Neon database, and its crons would have run there (posting to Slack and spending on AI) as well
as on the VPS. Don't add one back.

## Root's crontab

Before the repo owned the schedule, `wedge-keepwarm` was also installed in **root's** crontab
(every 5 minutes). The deploy runs as `deploy` and cannot see or change root's crontab, so that
line may still be there and the route may run twice. That is safe: the keep-warm ping is a read,
and the course-feed watchdog it carries runs under a Postgres advisory lock
(`src/server/cron-single-run.ts`), so a second concurrent run skips it. To remove the root copy,
as root on the VPS:

```bash
crontab -l | grep -v 'run-cron.sh wedge-keepwarm' | crontab -
```

## Seeing what ran

```bash
crontab -l                       # as deploy: the managed block and anything else
tail -200 /tmp/foundry-cron.log  # each line is an endpoint's JSON result
```

The read-only `inspect` task of `.github/workflows/vps-ops.yml` (Actions → "VPS ops (manual)")
prints the same without shell access.

## Notes on individual jobs

- **`jobs`** (every minute) drains the BackgroundJob queue: Curator and Foreman runs, client
  archives. It also runs the uptime-monitor watchdog, SSL/domain expiry, the running-month metrics
  refresh, the Monday HR digest, AI-search buyer questions and commitment reads, so those need no
  lines of their own. `curator` and `foreman` only enqueue; without `jobs` their runs sit PENDING.
- **`wiki-monitors`** (every minute). Healthy monitors self-throttle to their own interval; a
  failing one is re-checked every minute (CLAUDE.md §78).
- **`wedge-course-feed`** (hourly) is the only route for Big Wedge course requests (§60). If it
  stops, the Course Requests page goes red after 6 hours and the watchdog in `wedge-keepwarm`
  tells the client channel.
- **`pulse-reconcile`** (every 15 minutes) and **`pulse-run-monitors`** (hourly) were daily only
  because of Vercel Hobby. Monitors self-throttle to their own frequency, so hourly runs re-scan
  only what is due.
- **`member-purge`** (03:30) deletes memberships archived more than 30 days ago, never Users
  (§57.3). Fail-safe if it doesn't run.
- **`crm-sync`** (hourly, working hours) covers leads nobody opens (§59.8).
- The weekly **`db-backup.sh`** line (Sunday 01:30, its own log under
  `/opt/apps/foundry/backups/`) lives outside the managed block and is left alone by the install.
  The deploy warns if no such line exists.
