#!/usr/bin/env bash
# npm run test:smoke — the browser smoke suite (scripts/smoke.mjs, docs/build-checklist.md §4c).
#
# Starts `next start` (needs a prior `npx next build`) on port 3200 against the seeded
# foundry_smoke database, waits for it, runs the suite, and stops the server. With SMOKE_URL set
# it uses a server that is already running instead (e.g. `next dev` while working):
#
#   SMOKE_URL=http://localhost:3200 AUTH_SECRET=<the server's> npm run test:smoke
set -euo pipefail

: "${AUTH_SECRET:?AUTH_SECRET must be set (the same value the server runs with)}"

if [ -n "${SMOKE_URL:-}" ]; then
  exec node scripts/smoke.mjs --url="$SMOKE_URL" "$@"
fi

URL="${SMOKE_DATABASE_URL:-postgresql://foundry:foundry@localhost:5432/foundry_smoke}"
case "$URL" in
  */foundry_smoke|*/foundry_smoke\?*) ;;
  *) echo "smoke: refusing to start against '$URL' (the database must be named foundry_smoke)" >&2; exit 1 ;;
esac
[ -d .next ] || { echo "smoke: no .next build; run npx next build first" >&2; exit 1; }

PORT=3200
LOG="$(mktemp)"
DATABASE_URL="$URL" DIRECT_URL="$URL" API_KEY="${API_KEY:-smoke-only-api-key}" \
  npx next start -p "$PORT" > "$LOG" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true; wait "$SERVER" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:$PORT/api/health?deep=1" > /dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER" 2>/dev/null; then echo "smoke: the server exited:" >&2; tail -40 "$LOG" >&2; exit 1; fi
  sleep 2
done
curl -fsS "http://localhost:$PORT/api/health?deep=1" > /dev/null || { echo "smoke: the server never became healthy:" >&2; tail -40 "$LOG" >&2; exit 1; }

status=0
node scripts/smoke.mjs --url="http://localhost:$PORT" "$@" || status=$?
if [ "$status" -ne 0 ]; then
  echo "--- server log (last 60 lines) ---"
  tail -60 "$LOG"
fi
exit "$status"
