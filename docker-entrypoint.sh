#!/bin/sh
set -e

# NOTE: `prisma db push` is NOT run here. The prisma CLI is not bundled in this
# image (keeps it lean). Schema changes are applied by the deploy workflow via a
# throwaway container (npx prisma db push) BEFORE the app is brought up — see
# .github/workflows/deploy.yml. This container just runs the server.

echo "Starting Next.js..."
exec node server.js
