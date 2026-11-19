#!/usr/bin/env bash
# Install Foundry's managed cron block into the current user's crontab.
#
#   install-crontab.sh <managed-file>
#
# Run by .github/workflows/deploy.yml as the `deploy` user after every deploy; the managed file is
# deploy/crontab from the commit being deployed. Idempotent:
#
#   1. The previous managed block (between the markers) is replaced.
#   2. Any UN-marked line that runs `run-cron.sh <name>` for a job the managed file schedules is
#      removed, with the comment lines directly above it, and printed. Those are the hand-installed
#      copies from before the repo owned the schedule; left in place they would run the job twice.
#   3. Every other line is kept exactly as it is (the weekly db-backup.sh line, anything else).
#   4. The result is read back with `crontab -l` and every managed line must be present, or the
#      script exits non-zero and the deploy fails with the reason.
#
# Prints the crontab before and after. Crontab lines carry no secrets: run-cron.sh reads
# CRON_SECRET from the app .env itself.
#
# Tests point CRONTAB_CMD at a fake and RUN_CRON at a temp file
# (src/app/api/cron/__tests__/install-crontab.test.ts).

set -euo pipefail

MANAGED="${1:?usage: install-crontab.sh <managed-file>}"
CRONTAB_CMD="${CRONTAB_CMD:-crontab}"
RUN_CRON="${RUN_CRON:-/opt/apps/foundry/run-cron.sh}"
BEGIN_MARK="# BEGIN foundry-managed"
END_MARK="# END foundry-managed"

if [ ! -s "$MANAGED" ]; then
  echo "::error::Managed crontab $MANAGED is missing or empty. Nothing installed."
  exit 1
fi
if [ ! -x "$RUN_CRON" ]; then
  echo "::error::$RUN_CRON is missing or not executable, so no scheduled job could run. Nothing installed."
  exit 1
fi

# Job names the managed file schedules.
NAMES="$(grep -v '^[[:space:]]*#' "$MANAGED" | grep -oE 'run-cron\.sh[[:space:]]+[a-z0-9-]+' | awk '{print $2}' | sort -u)"
if [ -z "$NAMES" ]; then
  echo "::error::$MANAGED schedules no run-cron.sh jobs. Refusing to install an empty schedule."
  exit 1
fi

CURRENT="$("$CRONTAB_CMD" -l 2>/dev/null || true)"
echo "--- crontab before"
if [ -n "$CURRENT" ]; then printf '%s\n' "$CURRENT" | sed 's/^/    /'; else echo "    (empty)"; fi

# Keep everything except the old managed block and un-marked duplicates of managed jobs. A run of
# comment lines is held back and printed only if the line after it is kept, so a removed job takes
# its own explanatory comment with it.
REMOVED_FILE="$(mktemp)"
trap 'rm -f "$REMOVED_FILE"' EXIT
KEPT="$(printf '%s\n' "$CURRENT" | awk -v removed="$REMOVED_FILE" -v names="$(printf '%s ' $NAMES)" -v begin="$BEGIN_MARK" -v end="$END_MARK" '
  BEGIN { n = split(names, list, " "); for (i = 1; i <= n; i++) managed[list[i]] = 1 }
  function flush() { for (i = 1; i <= held; i++) print hold[i]; held = 0 }
  function drop()  { for (i = 1; i <= held; i++) print hold[i] > removed; held = 0 }
  $0 == begin { flush(); inblock = 1; next }
  $0 == end   { inblock = 0; next }
  inblock     { next }
  /^[[:space:]]*#/ { hold[++held] = $0; next }
  {
    job = ""
    if (match($0, /run-cron\.sh[[:space:]]+[a-z0-9-]+/)) {
      split(substr($0, RSTART, RLENGTH), parts, /[[:space:]]+/)
      job = parts[2]
    }
    if (job != "" && (job in managed)) { drop(); print $0 > removed; next }
    flush(); print
  }
  END { flush() }
')"
if [ -s "$REMOVED_FILE" ]; then
  echo "--- removed un-marked duplicates of managed jobs"
  sed 's/^/    /' "$REMOVED_FILE"
fi

# Collapse runs of blank lines left behind by removals, and trim trailing blanks.
KEPT="$(printf '%s\n' "$KEPT" | cat -s | awk '{ line[NR] = $0; if ($0 ~ /[^[:space:]]/) last = NR } END { for (i = 1; i <= last; i++) print line[i] }')"

{
  if [ -n "$KEPT" ]; then printf '%s\n\n' "$KEPT"; fi
  echo "$BEGIN_MARK"
  echo "# Installed by .github/workflows/deploy.yml from deploy/crontab. Edit the repo, not this block."
  grep -v '^[[:space:]]*$' "$MANAGED" | grep -v '^#' || true
  echo "$END_MARK"
} | "$CRONTAB_CMD" -

AFTER="$("$CRONTAB_CMD" -l 2>/dev/null || true)"
echo "--- crontab after"
printf '%s\n' "$AFTER" | sed 's/^/    /'

MISSING=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  if ! printf '%s\n' "$AFTER" | grep -qxF -- "$line"; then
    echo "::error::Managed line not in the installed crontab: $line"
    MISSING=1
  fi
done < <(grep -v '^[[:space:]]*$' "$MANAGED" | grep -v '^#')

for name in $NAMES; do
  count="$(printf '%s\n' "$AFTER" | grep -v '^[[:space:]]*#' | grep -cE "run-cron\.sh[[:space:]]+${name}([[:space:]]|$)" || true)"
  if [ "$count" != "1" ]; then
    echo "::error::$name is scheduled $count times in the installed crontab (want exactly 1)."
    MISSING=1
  fi
done

if [ "$(printf '%s\n' "$AFTER" | grep -cxF "$BEGIN_MARK" || true)" != "1" ]; then
  echo "::error::The managed block markers are not present exactly once."
  MISSING=1
fi

if [ "$MISSING" != "0" ]; then
  echo "::error::The scheduled jobs were NOT installed correctly; see above."
  exit 1
fi

if ! printf '%s\n' "$AFTER" | grep -q 'db-backup\.sh'; then
  echo "::warning::No db-backup.sh line in the crontab. The weekly database backup is not scheduled on this box."
fi

echo "Scheduled jobs installed: $(printf '%s\n' "$NAMES" | wc -l | tr -d ' ') managed jobs."
