#!/usr/bin/env bash
# Prepare the throwaway Postgres the browser smoke suite runs against (npm run test:smoke,
# docs/build-checklist.md §4c).
#
# Local: starts the PostgreSQL 16 cluster if it is down and (re)creates `foundry_smoke`. CI points
# SMOKE_DATABASE_URL at its own service container. Both then get the schema and the seed: the two
# isolation-suite businesses (tests/isolation/fixtures.ts), so /app pages have real rows to draw.
#
# It never touches any other database: the URL must name `foundry_smoke`, or it stops.
set -euo pipefail

URL="${SMOKE_DATABASE_URL:-postgresql://foundry:foundry@localhost:5432/foundry_smoke}"
case "$URL" in
  */foundry_smoke|*/foundry_smoke\?*) ;;
  *) echo "smoke-db: refusing to touch '$URL' (the database must be named foundry_smoke)" >&2; exit 1 ;;
esac

if [ -z "${CI:-}" ] && command -v pg_ctlcluster >/dev/null 2>&1; then
  pg_lsclusters 2>/dev/null | grep ' online ' >/dev/null || pg_ctlcluster 16 main start
  sudo -u postgres psql -qc "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='foundry') THEN CREATE ROLE foundry LOGIN PASSWORD 'foundry' CREATEDB; END IF; END \$\$;" >/dev/null
  sudo -u postgres psql -qc "DROP DATABASE IF EXISTS foundry_smoke" >/dev/null
  sudo -u postgres psql -qc "CREATE DATABASE foundry_smoke OWNER foundry" >/dev/null
fi

DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma db push --skip-generate --accept-data-loss >/dev/null
SMOKE_DATABASE_URL="$URL" npx tsx tests/smoke/seed.ts
echo "smoke-db: schema and seed applied to foundry_smoke"
