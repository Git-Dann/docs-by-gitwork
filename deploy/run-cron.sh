#!/usr/bin/env bash
# Calls one scheduled job: run-cron.sh <name>  →  GET http://127.0.0.1:3000/api/cron/<name>
#
# Installed at /opt/apps/foundry/run-cron.sh by the deploy, which first runs this copy once
# against `jobs` and only replaces the box's copy when that works (CLAUDE.md §144). Every line
# of deploy/crontab runs it, appending its output to /tmp/foundry-cron.log.
#
# Reads CRON_SECRET from the app's .env each time, so the crontab carries no secret and a
# rotated secret takes effect without touching the schedule. Never prints the secret.
# Exits non-zero when the job could not be called or did not answer 2xx (cron ignores the
# code; the deploy's smoke test relies on it).
set -u

name="${1:-}"
if ! [[ "$name" =~ ^[a-z0-9-]+$ ]]; then
  echo "$(date -u +%FT%TZ) run-cron: bad job name '${name}'" >&2
  exit 2
fi

ENV_FILE="${FOUNDRY_ENV_FILE:-/opt/apps/foundry/.env}"
BASE_URL="${FOUNDRY_CRON_BASE_URL:-http://127.0.0.1:3000}"

secret="$(grep -E '^CRON_SECRET=' "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r')"
# Strip one pair of surrounding quotes, as Docker Compose does.
secret="${secret#\"}"; secret="${secret%\"}"
secret="${secret#\'}"; secret="${secret%\'}"
if [ -z "$secret" ]; then
  echo "$(date -u +%FT%TZ) $name: no CRON_SECRET in $ENV_FILE" >&2
  exit 3
fi

# Long jobs (curator, support-sync) can take minutes; the routes cap themselves at 300s.
# The header goes in on stdin (--config -), not the command line, so `ps` never shows it.
body="$(printf 'header = "Authorization: Bearer %s"\n' "$secret" | \
  curl -sS --max-time 330 -w $'\n%{http_code}' --config - \
  "${BASE_URL}/api/cron/${name}" 2>&1)"
code="$(printf '%s' "$body" | tail -n 1)"
body="$(printf '%s' "$body" | sed '$d')"

echo "$(date -u +%FT%TZ) $name HTTP ${code}: ${body}"
case "$code" in
  2??) exit 0 ;;
  *) exit 1 ;;
esac
