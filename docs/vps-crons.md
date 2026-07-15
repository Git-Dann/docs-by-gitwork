# VPS cron jobs

Production runs on the Fasthosts VPS (see CLAUDE.md §23). **Vercel cron jobs do
NOT run there** — every `/api/cron/*` endpoint must be triggered by the VPS's own
crontab (or a systemd timer). `vercel.json`'s `crons` block is now just the
source-of-truth *list* of what should run; the schedules below are what the host
actually executes.

## Auth

Every cron route is guarded by the `CRON_SECRET` env var and must be called with:

```
Authorization: Bearer $CRON_SECRET
```

## Crontab

Edit with `crontab -e` on the VPS **as the `deploy` user** (`sudo crontab -l` as root
is empty — that's a false alarm; the jobs live in `deploy`'s crontab). The jobs do
**not** call `curl` directly — they go through the `run-cron.sh` wrapper, which reads
`CRON_SECRET` from the app `.env` and hits the endpoint on the internal host, logging
to `/tmp/foundry-cron.log`. This is what's actually installed on the box:

```cron
0 2 * * *  /opt/apps/foundry/run-cron.sh docs-gdrive-backup   >> /tmp/foundry-cron.log 2>&1
0 3 * * *  /opt/apps/foundry/run-cron.sh auto-archive-tasks   >> /tmp/foundry-cron.log 2>&1
0 4 * * *  /opt/apps/foundry/run-cron.sh pulse-reconcile      >> /tmp/foundry-cron.log 2>&1
0 5 * * *  /opt/apps/foundry/run-cron.sh pulse-run-monitors   >> /tmp/foundry-cron.log 2>&1
0 6 * * *  /opt/apps/foundry/run-cron.sh analytics-snapshot   >> /tmp/foundry-cron.log 2>&1
0 7 * * *  /opt/apps/foundry/run-cron.sh embed-conversations  >> /tmp/foundry-cron.log 2>&1
0 8 * * *  /opt/apps/foundry/run-cron.sh support-sync         >> /tmp/foundry-cron.log 2>&1
0 9 * * *  /opt/apps/foundry/run-cron.sh meet-transcripts     >> /tmp/foundry-cron.log 2>&1
0 10 * * * /opt/apps/foundry/run-cron.sh care-digest          >> /tmp/foundry-cron.log 2>&1

# Curator — weekly library maintenance (Monday 01:00). Enqueues a CURATOR_RUN job per due
# workspace; the `jobs` worker below actually runs it, so both must be installed.
0 1 * * 1  /opt/apps/foundry/run-cron.sh curator              >> /tmp/foundry-cron.log 2>&1

# Background-job worker — drains the BackgroundJob queue (curator runs, client archives, retention).
# Idempotent + deduped, safe every minute.
* * * * *  /opt/apps/foundry/run-cron.sh jobs                 >> /tmp/foundry-cron.log 2>&1

# Weekly DB backup (Sunday 01:30) — separate script, its own log
30 1 * * 0 /opt/apps/foundry/deploy/db-backup.sh >> /opt/apps/foundry/backups/backup.log 2>&1
```

> **Note** — the `curator` cron only *enqueues*; the durable `jobs` worker is what executes the
> run. If `jobs` isn't installed the CURATOR_RUN sits PENDING forever. (`jobs` also drains client
> archives + retention sweeps, so it's worth having regardless.)

### Optional: twice-daily Care sync (per PR #351)

`support-sync` runs once daily above. PR #351 wanted it **twice** (09:00 + 13:00 GMT)
for fresher Care reports. To adopt, replace the `0 8` line with:

```cron
0 9  * * * /opt/apps/foundry/run-cron.sh support-sync >> /tmp/foundry-cron.log 2>&1
0 13 * * * /opt/apps/foundry/run-cron.sh support-sync >> /tmp/foundry-cron.log 2>&1
```

(`support-sync` self-throttles per connector via `scraperConfig.syncIntervalMinutes`,
so running it more often is safe. Note 09:00 collides with `meet-transcripts` — fine,
they're independent, but the crontab otherwise staggers one job per hour.)

## Notes

- All app jobs are **daily** — the VPS has no sub-daily cron installed. (`vercel.json`
  is the vestigial source-of-truth *list* of jobs and may list finer schedules, e.g.
  `wiki-monitors` at `*/5`; those only mattered on Vercel and are **not** wired on the
  box. Add a `*/5 * * * * /opt/apps/foundry/run-cron.sh wiki-monitors …` line here if
  uptime monitoring is wanted.)
- The **DB backup** is the weekly `db-backup.sh` above; the Fasthosts panel also runs a
  VM-level backup. The Let's Encrypt renewer is a separate host concern — see CLAUDE.md §23.
- Tail `/tmp/foundry-cron.log` to see recent runs (each line is the endpoint's JSON result).
