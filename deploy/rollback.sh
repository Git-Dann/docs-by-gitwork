#!/usr/bin/env bash
# Put an earlier image back into production.
#
#   rollback.sh [previous | <40-character commit sha>]
#
#   previous  the image that was running before the last deploy (the deploy tags it :previous).
#   <sha>     any commit main has deployed: its image is pulled from GHCR by its :<sha> tag.
#
# Run from /opt/apps/foundry (where docker-compose.yml and .env live), by the `rollback` task in
# .github/workflows/vps-ops.yml. It does NOT touch the database: schema changes are additive, so
# older code runs against the newer schema. If the image it puts back is not healthy, the image
# that was running is put back and the script fails. The next push to main deploys over it.
#
# Tests point DOCKER_CMD at a fake and HEALTH_CHECK at a stub
# (src/app/api/health/__tests__/deploy-scripts.test.ts).

set -euo pipefail

TARGET="${1:-previous}"
IMAGE="${IMAGE:-ghcr.io/git-dann/docs-by-gitwork}"
DOCKER_CMD="${DOCKER_CMD:-docker}"
HEALTH_CHECK="${HEALTH_CHECK:-$(dirname "$0")/health-check.sh}"
CONTAINER="${CONTAINER:-foundry}"

expect=""
if [ "$TARGET" = "previous" ]; then
  if ! "$DOCKER_CMD" image inspect "$IMAGE:previous" >/dev/null 2>&1; then
    echo "::error::No $IMAGE:previous image on this box. The deploy tags it before each release; roll back to a commit sha instead."
    exit 1
  fi
  source_ref="$IMAGE:previous"
elif grep -qE '^[0-9a-f]{40}$' <<<"$TARGET"; then
  "$DOCKER_CMD" pull "$IMAGE:$TARGET"
  source_ref="$IMAGE:$TARGET"
  expect="$TARGET"
else
  echo "::error::Roll back to 'previous' or a full 40-character commit sha, not '$TARGET'."
  exit 1
fi

current="$("$DOCKER_CMD" inspect "$CONTAINER" --format '{{.Image}}' 2>/dev/null || true)"
if [ -n "$current" ]; then
  "$DOCKER_CMD" tag "$current" "$IMAGE:before-rollback"
fi

echo "Rolling back to $source_ref"
"$DOCKER_CMD" tag "$source_ref" "$IMAGE:latest"
"$DOCKER_CMD" compose up -d --no-deps --force-recreate app

if bash "$HEALTH_CHECK" $expect; then
  echo "Rolled back to $source_ref."
  exit 0
fi

echo "::error::$source_ref is not healthy."
if [ -n "$current" ]; then
  echo "Putting back the image that was running before."
  "$DOCKER_CMD" tag "$IMAGE:before-rollback" "$IMAGE:latest"
  "$DOCKER_CMD" compose up -d --no-deps --force-recreate app
  bash "$HEALTH_CHECK" || true
fi
exit 1
