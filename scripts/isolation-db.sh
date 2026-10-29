#!/usr/bin/env bash
# Prepare the throwaway Postgres the isolation suite runs against (npm run test:isolation).
#
# Local: starts the PostgreSQL 16 cluster if it is down, (re)creates `foundry_isolation`,
# and applies prisma/schema.prisma to it. CI points ISOLATION_DATABASE_URL at its own service
# container and only needs the `db push` step, which this script also does.
#
# It never touches any other database: the URL must name `foundry_isolation`, or it stops.
set -euo pipefail

URL="${ISOLATION_DATABASE_URL:-postgresql://foundry:foundry@localhost:5432/foundry_isolation}"
case "$URL" in
  */foundry_isolation|*/foundry_isolation\?*) ;;
  *) echo "isolation-db: refusing to touch '$URL' (the database must be named foundry_isolation)" >&2; exit 1 ;;
esac

if [ -z "${CI:-}" ] && command -v pg_ctlcluster >/dev/null 2>&1; then
  pg_lsclusters 2>/dev/null | grep -q ' online ' || pg_ctlcluster 16 main start
  sudo -u postgres psql -qc "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='foundry') THEN CREATE ROLE foundry LOGIN PASSWORD 'foundry' CREATEDB; END IF; END \$\$;" >/dev/null
  sudo -u postgres psql -qc "DROP DATABASE IF EXISTS foundry_isolation" >/dev/null
  sudo -u postgres psql -qc "CREATE DATABASE foundry_isolation OWNER foundry" >/dev/null
fi

DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma db push --skip-generate --accept-data-loss >/dev/null
echo "isolation-db: schema applied to foundry_isolation"
