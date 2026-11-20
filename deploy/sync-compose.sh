#!/usr/bin/env bash
# Bring the VPS's docker-compose.yml in line with the repo's.
#
#   sync-compose.sh <new-compose-file> <compose-history-file>
#
# Run from /opt/apps/foundry by .github/workflows/deploy.yml, before the images are pulled.
# Until Nov 2026 CI never copied this file up, so a change to it in the repo never reached the box.
#
# The box file is only replaced when it is one the repo has shipped (its sha256 is listed in
# deploy/compose-history.sha256). A file someone edited by hand on the box is left alone, with a
# warning and a diff, so a local change is never silently thrown away. The old file is kept as
# docker-compose.yml.before-deploy. The new one must pass `docker compose config` first.
#
# Exit 0 in every case except a new file that fails validation (the deploy must not run with it).
#
# Tests point DOCKER_CMD at a fake (src/app/api/health/__tests__/deploy-scripts.test.ts).

set -euo pipefail

NEW="${1:?usage: sync-compose.sh <new-compose-file> <compose-history-file>}"
HISTORY="${2:?usage: sync-compose.sh <new-compose-file> <compose-history-file>}"
DOCKER_CMD="${DOCKER_CMD:-docker}"
LIVE="docker-compose.yml"

if [ -f "$LIVE" ] && cmp -s "$NEW" "$LIVE"; then
  echo "docker-compose.yml: already the repo's version"
  exit 0
fi

if [ -f "$LIVE" ]; then
  live_hash="$(sha256sum "$LIVE" | cut -d' ' -f1)"
  if ! grep -q "^$live_hash " "$HISTORY"; then
    echo "::warning::docker-compose.yml on the box has been edited by hand (sha256 $live_hash is not a version the repo has shipped), so it was NOT replaced. Copy the change into the repo's docker-compose.yml, or replace the box file with the repo's, then deploy again. Difference (box → repo):"
    diff -u "$LIVE" "$NEW" || true
    exit 0
  fi
fi

cp "$NEW" "$LIVE.next"
if ! "$DOCKER_CMD" compose -f "$LIVE.next" config -q; then
  rm -f "$LIVE.next"
  echo "::error::The repo's docker-compose.yml does not pass docker compose config. Nothing was changed."
  exit 1
fi

if [ -f "$LIVE" ]; then
  echo "docker-compose.yml: replacing with the repo's version. Difference:"
  diff -u "$LIVE" "$LIVE.next" || true
  cp "$LIVE" "$LIVE.before-deploy"
fi
mv "$LIVE.next" "$LIVE"
