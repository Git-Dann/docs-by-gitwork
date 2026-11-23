#!/usr/bin/env bash
# Deploy the :staging image to the staging stack on the VPS (docs/staging.md).
#
#   STAGING_DIR=/opt/apps/foundry-staging staging-deploy.sh <release-dir> <commit-sha> [seed 0|1]
#
# Run by .github/workflows/deploy-staging.yml (only when dispatched). <release-dir> holds
# docker-compose-staging.yml and deploy/health-check.sh from the repo.
#
# It can only ever touch staging, and refuses to start otherwise:
#   - the directory must be a `foundry-staging` one, never /opt/apps/foundry;
#   - every Compose command is pinned to project `foundry-staging` and the staging compose file,
#     whose containers, volume, port (127.0.0.1:3001) and image tag (:staging) are checked;
#   - the staging .env must point DATABASE_URL (and DIRECT_URL, if set) at `db:5432/foundry_staging`,
#     the staging stack's own Postgres, so a copied production .env can't reach the real database.
#
# Tests point DOCKER_CMD / CURL_CMD at fakes (src/__tests__/staging-deploy.test.ts).

set -euo pipefail

RELEASE="${1:?usage: staging-deploy.sh <release-dir> <commit-sha> [seed]}"
SHA="${2:?usage: staging-deploy.sh <release-dir> <commit-sha> [seed]}"
SEED="${3:-0}"
STAGING_DIR="${STAGING_DIR:-/opt/apps/foundry-staging}"
DOCKER_CMD="${DOCKER_CMD:-docker}"
CURL_CMD="${CURL_CMD:-curl}"
PROJECT=foundry-staging
PORT=3001

fail() { echo "::error::$*"; exit 1; }

case "$(basename "$STAGING_DIR")" in
  foundry-staging) ;;
  *) fail "Refusing to deploy staging into $STAGING_DIR: the directory must be named foundry-staging." ;;
esac
[ -d "$STAGING_DIR" ] || fail "$STAGING_DIR does not exist. One-time setup: docs/staging.md."
cd "$STAGING_DIR"

# ── The staging .env must name the staging database ────────────────────────────────────────────
[ -f .env ] || fail "$STAGING_DIR/.env does not exist. One-time setup: docs/staging.md."
check_db_var() {
  local name="$1" line value
  line="$(grep -E "^${name}=" .env | tail -n 1 || true)"
  if [ -z "$line" ]; then
    [ "$name" = DATABASE_URL ] && fail "DATABASE_URL is not set in $STAGING_DIR/.env."
    return 0
  fi
  value="${line#*=}"; value="${value#\"}"; value="${value%\"}"; value="${value#\'}"; value="${value%\'}"
  if ! [[ "$value" =~ @db:5432/foundry_staging(\?|$) ]]; then
    fail "$name in $STAGING_DIR/.env must point at the staging database (…@db:5432/foundry_staging). Refusing to deploy, so staging can never write to another database."
  fi
}
check_db_var DATABASE_URL
check_db_var DIRECT_URL

# ── The compose file must be the staging one ───────────────────────────────────────────────────
NEW="$RELEASE/docker-compose-staging.yml"
[ -s "$NEW" ] || fail "The release has no docker-compose-staging.yml."
grep -qE '^name: foundry-staging$' "$NEW" || fail "docker-compose-staging.yml is not pinned to project foundry-staging."
grep -qE 'container_name: foundry-staging$' "$NEW" || fail "docker-compose-staging.yml does not name the foundry-staging container."
grep -qE 'image: ghcr.io/git-dann/docs-by-gitwork:staging$' "$NEW" || fail "docker-compose-staging.yml does not run the :staging image."
grep -qF '"127.0.0.1:3001:3000"' "$NEW" || fail "docker-compose-staging.yml does not bind the app to 127.0.0.1:3001."
if grep -qE 'container_name: foundry(-db)?$|docs-by-gitwork:(latest|previous)$' "$NEW"; then
  fail "docker-compose-staging.yml names a production container or image. Refusing."
fi

cp "$NEW" docker-compose.yml.next
if ! "$DOCKER_CMD" compose -p "$PROJECT" -f docker-compose.yml.next config -q; then
  rm -f docker-compose.yml.next
  fail "docker-compose-staging.yml does not pass docker compose config. Nothing was changed."
fi
[ -f docker-compose.yml ] && cp docker-compose.yml docker-compose.yml.before-deploy
mv docker-compose.yml.next docker-compose.yml
mkdir -p deploy
cp "$RELEASE/deploy/health-check.sh" deploy/health-check.sh
chmod +x deploy/health-check.sh

dc() { "$DOCKER_CMD" compose -p "$PROJECT" -f "$STAGING_DIR/docker-compose.yml" "$@"; }

echo "Deploying $SHA to staging"
dc pull app
dc up -d db
# --accept-data-loss is acceptable HERE ONLY: foundry_staging is staging's own throwaway data
# (its own volume, checked above). Production's deploy never passes it (CLAUDE.md §2).
if ! dc run --rm --no-deps --user root --entrypoint sh app \
  -c "npx --yes prisma@6.19.3 db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss"; then
  fail "prisma db push failed on the staging database. The old staging app is still running."
fi
dc up -d --no-deps --force-recreate app

if ! HEALTH_URL="http://127.0.0.1:${PORT}/api/health?deep=1" CONTAINER=foundry-staging DOCKER_CMD="$DOCKER_CMD" CURL_CMD="$CURL_CMD" \
  bash deploy/health-check.sh "$SHA"; then
  fail "Staging is not healthy after the deploy. Production was not touched. Logs: docker logs foundry-staging --tail 200"
fi

# ── Demo data (optional) ───────────────────────────────────────────────────────────────────────
if [ "$SEED" = "1" ]; then
  key="$(grep -E '^API_KEY=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r')"
  key="${key#\"}"; key="${key%\"}"; key="${key#\'}"; key="${key%\'}"
  if [ -z "$key" ]; then
    echo "::warning::No API_KEY in $STAGING_DIR/.env, so the demo data was not seeded."
  else
    for route in seed-demo seed-study-demo seed-provenance-demo seed-starters-demo seed-devsignal-demo; do
      # The key goes on stdin (--config -), never the command line.
      code="$(printf 'header = "Authorization: Bearer %s"\n' "$key" | \
        "$CURL_CMD" -sS -o /dev/null -w '%{http_code}' --max-time 300 -X POST --config - \
        "http://127.0.0.1:${PORT}/api/dev/${route}" 2>/dev/null || echo 000)"
      case "$code" in
        2??) echo "  seeded: $route" ;;
        *) echo "::warning::Seeding $route answered HTTP $code." ;;
      esac
    done
  fi
fi

# Dangling layers only; every tagged image (production's :latest and :previous included) is kept.
"$DOCKER_CMD" image prune -f >/dev/null || true
echo "Staging is running $SHA on 127.0.0.1:${PORT}"
