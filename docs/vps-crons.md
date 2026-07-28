# VPS cron jobs

Production runs on the Fasthosts VPS (see CLAUDE.md §23). Every `/api/cron/*` endpoint
must be triggered by the VPS's own crontab (or a systemd timer) — **this file is the
authoritative list**, and the schedules below are what the host executes.

> ### ⚠️ `vercel.json`'s crons may still be firing — verify before trusting either list
>
> This file used to open by asserting "Vercel cron jobs do NOT run there". That is not a
> safe assumption. **Vercel crons run against the Vercel deployment, not against whatever
> DNS points at** — and the Vercel project is still Git-connected and still builds `main`
> as a production deployment (CLAUDE.md §23). So the 14 jobs listed in `vercel.json` may
> be running *in addition to* the crontab below.
>
> That matters because several are not idempotent in a harmless way: `docs-gdrive-backup`
> writes to Drive, `support-sync` and `care-digest` post to Slack, and `foreman` /
> `curator` spend on Anthropic. Double-running means duplicate posts and double AI cost.
>
> **To settle it**, on the VPS as the `deploy` user:
>
> ```bash
> crontab -l                       # what the host actually runs
> tail -200 /tmp/foundry-cron.log  # confirm those jobs are landing
> ```
>
> If the crontab matches this file and the log shows the jobs running, the correct end
> state is to **delete the `crons` block from `vercel.json`** — the VPS is authoritative
> and the Vercel copy is pure duplication. Do NOT delete it before confirming, or you may
> remove the only thing actually running a job. Either way it is one or the other, never
> both.
>
> **Where the two lists disagree today** (compared line by line, July 2026). If Vercel is
> still firing, these three run twice a day at *different* times, which is why the
> duplication is not harmless:
>
> | Route | `vercel.json` | this file (the box) |
> |---|---|---|
> | `support-sync` | `0 9 * * *` | `0 8 * * *` |
> | `absence-cover-reconcile` | `0 8 * * *` | `0 11 * * *` |
> | `meet-transcripts` | `0 9 * * *` | `0 9,13 * * *` (extra afternoon pass) |
>
> Three more are **VPS-only** and absent from `vercel.json` — `jobs`, `retention` and
> `wedge-keepwarm` — so Vercel was never running the job worker at all. And
> `wiki-monitors` is the reverse: in `vercel.json`, not on the box.

## Auth

Every cron route is guarded by the `CRON_SECRET` env var and must be called with:

```
Authorization: Bearer $CRON_SECRET
```

## ⛔ Four documented jobs are NOT installed (verified 2026-07-28)

`crontab -l` was finally read off the box, via the `inspect` task of
`.github/workflows/vps-ops.yml` (run it yourself: Actions → "VPS ops (manual)" →
`inspect`; it is read-only). The list below in this file was **wrong in both
directions**. Against the 17 `/api/cron/*` routes the app ships:

| Route | This file claimed | Actually installed |
|---|---|---|
| **`foreman`** | `0 9 * * *` | **NOTHING — never runs** |
| **`curator`** | `0 1 * * 1` | **NOTHING — never runs** |
| **`retention`** | `0 0 * * *` | **NOTHING — never runs** |
| **`wedge-keepwarm`** | `*/5 * * * *` | **NOTHING — never runs** |
| `support-sync` | `0 8 * * *` | `0 8` **and** `0 13` — the "optional" twice-daily variant below is installed |

Everything else matches exactly.

**What that means, and it is not cosmetic:**

- **Foreman (§29) has never run in production.** The daily delivery-risk digest
  that is supposed to land on admins' Desk at 09:00 has never fired. The Desk
  panel reads the *latest persisted run*, so it has simply been empty rather than
  visibly broken — which is why nobody noticed.
- **The Curator (§28) has never run.** No Starter has ever been aged
  `ACTIVE→STALE→ARCHIVED` by schedule, and `PulseCheckStat` has never been
  refreshed, so the dead/always-pass/noisy chips in Settings → Checks have no data
  behind them.
- **The retention policy has never executed.** Nothing else enqueues a
  `RETENTION_SWEEP`, so retention is not merely late, it has never happened.
  ⚠️ **Installing this cron is therefore NOT a no-op** — the first run will sweep
  the entire accumulated backlog in one pass. Decide the policy is right *before*
  scheduling it.
- The `jobs` worker IS installed and running every minute, and the cron log shows
  it reporting `"claimed":0` every time — consistent with nothing ever being
  enqueued for it, since `curator` and `foreman` are the two things that enqueue.

**Do not "fix" this file by trusting it.** Run `inspect` and compare.

## Crontab

Edit with `crontab -e` on the VPS **as the `deploy` user** (`sudo crontab -l` as root
is empty — that's a false alarm; the jobs live in `deploy`'s crontab). The jobs do
**not** call `curl` directly — they go through the `run-cron.sh` wrapper, which reads
`CRON_SECRET` from the app `.env` and hits the endpoint on the internal host, logging
to `/tmp/foundry-cron.log`.

⚠️ **The block below is the INTENDED set, not a transcript of the box.** It used to
claim it was "what's actually installed", and that was disproved on 2026-07-28 — the
four jobs called out above (`foreman`, `curator`, `retention`, `wedge-keepwarm`) are in
this block and are **not** in the real crontab, and the real crontab has a second
`support-sync` at `0 13` that this block does not. Treat it as the target state to
reconcile *towards*, and run the `inspect` workflow for ground truth.

```cron
0 2 * * *  /opt/apps/foundry/run-cron.sh docs-gdrive-backup   >> /tmp/foundry-cron.log 2>&1
0 3 * * *  /opt/apps/foundry/run-cron.sh auto-archive-tasks   >> /tmp/foundry-cron.log 2>&1
0 4 * * *  /opt/apps/foundry/run-cron.sh pulse-reconcile      >> /tmp/foundry-cron.log 2>&1
0 5 * * *  /opt/apps/foundry/run-cron.sh pulse-run-monitors   >> /tmp/foundry-cron.log 2>&1
0 6 * * *  /opt/apps/foundry/run-cron.sh analytics-snapshot   >> /tmp/foundry-cron.log 2>&1
0 7 * * *  /opt/apps/foundry/run-cron.sh embed-conversations  >> /tmp/foundry-cron.log 2>&1
0 8 * * *  /opt/apps/foundry/run-cron.sh support-sync         >> /tmp/foundry-cron.log 2>&1
# Scribe runs TWICE a day (09:00 + 13:00) so an afternoon client call lands the same
# day instead of waiting for the next morning. Re-scans are cheap — the run skips
# meetings already SUMMARISED, so the second pass is a calendar read for most rows.
0 9,13 * * * /opt/apps/foundry/run-cron.sh meet-transcripts   >> /tmp/foundry-cron.log 2>&1
# Foreman — daily delivery-risk digest (09:00). Enqueues a FOREMAN_RUN per enabled workspace
# that hasn't run today; the `jobs` worker runs it and pushes the digest to admins' Desks just
# after 09:00. (This file listed foreman TWICE until July 2026 — one instance, here.)
0 9 * * *  /opt/apps/foundry/run-cron.sh foreman              >> /tmp/foundry-cron.log 2>&1
0 10 * * * /opt/apps/foundry/run-cron.sh care-digest          >> /tmp/foundry-cron.log 2>&1

# Backstage availability — ONE combined leave + absence Slack digest each weekday
# morning (08:30; Mon posts a week roll-up, Tue–Fri "out today"; silent when nobody's
# off, needs a digest channel set in the Absences modal). Plus the cover-reconcile
# that ends absence covers whose return date has passed (daily 11:00; manual "End
# cover" does the same on demand).
30 8 * * 1-5 /opt/apps/foundry/run-cron.sh availability-digest      >> /tmp/foundry-cron.log 2>&1
0 11 * * *   /opt/apps/foundry/run-cron.sh absence-cover-reconcile  >> /tmp/foundry-cron.log 2>&1

# Curator — weekly library maintenance (Monday 01:00). Enqueues a CURATOR_RUN job per due
# workspace; the `jobs` worker below actually runs it, so both must be installed.
0 1 * * 1  /opt/apps/foundry/run-cron.sh curator              >> /tmp/foundry-cron.log 2>&1

# Retention — enqueues a deduped RETENTION_SWEEP; the `jobs` worker runs it. NOTHING ELSE
# enqueues a sweep, so without this line the retention policy never executes at all. Was
# missing from this file until July 2026 despite the route's own docstring naming host cron
# as its trigger — check `crontab -l` before assuming it is installed.
0 0 * * *  /opt/apps/foundry/run-cron.sh retention            >> /tmp/foundry-cron.log 2>&1

# Big Wedge keep-warm — a tiny authed read so their CockroachDB free tier doesn't idle into
# a cold start (which makes the console's first load spin). Its docstring asks for ~5 min;
# this is the one job here that is genuinely sub-daily, and it is cheap.
*/5 * * * * /opt/apps/foundry/run-cron.sh wedge-keepwarm      >> /tmp/foundry-cron.log 2>&1

# Background-job worker — drains the BackgroundJob queue (curator runs, foreman runs, client
# archives, retention sweeps). Idempotent + deduped, safe every minute.
* * * * *  /opt/apps/foundry/run-cron.sh jobs                 >> /tmp/foundry-cron.log 2>&1

# Weekly DB backup (Sunday 01:30) — separate script, its own log
30 1 * * 0 /opt/apps/foundry/deploy/db-backup.sh >> /opt/apps/foundry/backups/backup.log 2>&1
```

> **Note** — the `curator` and `foreman` crons only *enqueue*; the durable `jobs` worker is what
> executes the run. If `jobs` isn't installed the CURATOR_RUN / FOREMAN_RUN sits PENDING forever.
> (`jobs` also drains client archives + retention sweeps, so it's worth having regardless.)

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

- **All 17 `/api/cron/*` routes are accounted for above**, and that is the property to
  preserve — if you add a route, add a line here in the same PR. Two were missing until
  July 2026 (`retention`, `wedge-keepwarm`) and `foreman` was listed twice.
- **`wiki-monitors` is the one deliberate omission.** It exists in `vercel.json` at
  `0 1 * * *` (daily 01:00 — this file used to describe it as "sub-daily", which was
  simply wrong) and it is not wired on the box — so client uptime monitoring is **not
  currently running** from the crontab. Note that if the Vercel crons *are* still firing,
  it is the one job Vercel is running that the box is not. That is a decision, not
  an oversight: adopt it by adding
  `*/5 * * * * /opt/apps/foundry/run-cron.sh wiki-monitors >> /tmp/foundry-cron.log 2>&1`,
  or drop the route. Leaving it half-configured is the one option to avoid, because the
  Wiki UI implies monitoring is active.
- Apart from `wedge-keepwarm` (5-minutely) and `jobs` (every minute), everything is daily
  or weekly — the box staggers roughly one job per hour so no two heavy runs collide.
- The **DB backup** is the weekly `db-backup.sh` above; the Fasthosts panel also runs a
  VM-level backup. The Let's Encrypt renewer is a separate host concern — see CLAUDE.md §23.
- Tail `/tmp/foundry-cron.log` to see recent runs (each line is the endpoint's JSON result).
