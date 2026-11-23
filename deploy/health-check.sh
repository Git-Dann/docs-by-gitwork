#!/usr/bin/env bash
# Wait for the running app to answer /api/health?deep=1 (Node up AND Postgres reachable).
#
#   health-check.sh [expected-commit-sha]
#
# With a sha, the app must also report that exact commit, so a container that failed to start and
# left the old one answering (or an old image under a new tag) is not mistaken for success.
# Exits 0 once healthy, 1 after HEALTH_TIMEOUT seconds (default 120) without a healthy answer.
# Run on the VPS by .github/workflows/deploy.yml and by deploy/rollback.sh.
#
# Tests point CURL_CMD at a fake and shorten HEALTH_TIMEOUT / HEALTH_INTERVAL
# (src/app/api/health/__tests__/deploy-scripts.test.ts).

set -uo pipefail

EXPECTED="${1:-}"
URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health?deep=1}"
TIMEOUT="${HEALTH_TIMEOUT:-120}"
INTERVAL="${HEALTH_INTERVAL:-3}"
CURL_CMD="${CURL_CMD:-curl}"

# No curl on the box? Ask from inside the container instead (node:22-alpine ships busybox wget,
# which exits non-zero on any non-2xx answer, as curl -f does).
fetch() {
  if command -v "$CURL_CMD" >/dev/null 2>&1; then
    "$CURL_CMD" -fsS --max-time 10 "$URL"
  else
    "${DOCKER_CMD:-docker}" exec "${CONTAINER:-foundry}" wget -q -T 10 -O - "http://127.0.0.1:3000/api/health?deep=1"
  fi
}

deadline=$(( $(date +%s) + TIMEOUT ))
last=""
while :; do
  body="$(fetch 2>&1)" && status=0 || status=$?
  if [ "$status" -eq 0 ]; then
    if [ -z "$EXPECTED" ] || grep -q "\"commit\":\"$EXPECTED\"" <<<"$body"; then
      echo "Healthy: $URL${EXPECTED:+ is running $EXPECTED}"
      exit 0
    fi
    last="answering, but not running $EXPECTED yet: $(printf '%s' "$body" | head -c 300)"
  else
    last="no healthy answer: $(printf '%s' "$body" | head -c 300)"
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Not healthy after ${TIMEOUT}s. Last result: $last"
    exit 1
  fi
  sleep "$INTERVAL"
done
