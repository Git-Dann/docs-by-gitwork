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

Install with `crontab -e` on the VPS (as the deploy user). `BASE` is the app's
internal URL (localhost inside the compose network, or the public host).

```cron
CRON_SECRET=<same value as the app .env>
BASE=https://foundry.gitwork.co.uk

# Uptime monitors — probe due wiki monitors + prune old history. Runs often;
# each monitor self-throttles to its own intervalMinutes.
*/5 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/wiki-monitors >/dev/null

# Daily jobs
0 2 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/docs-gdrive-backup >/dev/null
0 3 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/auto-archive-tasks >/dev/null
0 4 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/pulse-reconcile >/dev/null
0 5 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/pulse-run-monitors >/dev/null
0 6 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/analytics-snapshot >/dev/null
0 7 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/embed-conversations >/dev/null
0 8 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/support-sync >/dev/null
0 9 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/meet-transcripts >/dev/null
0 10 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/care-digest >/dev/null
```

## Notes

- **Wiki monitors** (`/api/cron/wiki-monitors`) is the only sub-daily job — uptime
  needs frequent probing. It reads every enabled `WikiMonitor`, runs the ones whose
  interval has elapsed (HTTP/TCP connectors, SSRF-guarded), records a
  `WikiMonitorCheck`, and prunes checks older than 30 days. "Check now" in the wiki
  workspace and the probe on monitor creation work without the cron; only the
  rolling history/uptime needs it.
- Other backups (DB `pg_dump`) and the Let's Encrypt renewer are separate host
  concerns — see CLAUDE.md §23.
- `vercel.json` lists `wiki-monitors` at `*/5` too; that entry only matters to the
  vestigial Vercel deploy (Hobby caps crons at daily, so it may warn there — the
  VPS crontab above is authoritative).
