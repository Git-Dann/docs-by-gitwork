FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
# Pin npm to a specific version to ensure consistent lockfile validation across environments
RUN npm install -g npm@10.9.8 --quiet
RUN npm ci --legacy-peer-deps

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client only — db push happens at container start via entrypoint
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1

# Dummy vars so next build doesn't crash without real env at build time
ENV DATABASE_URL="postgresql://dummy:dummy@localhost/dummy"
ENV DIRECT_URL="postgresql://dummy:dummy@localhost/dummy"

# Deploy provenance for the client bundle — the sidebar footer + /context read these to show
# "v{pkg}.{run} · {build-time}". Sourced from the GHA workflow's build metadata
# (deploy.yml → BUILD_TIME, APP_VERSION). APP_VERSION auto-increments the patch segment via
# github.run_number so every push shows a new number without editing package.json.
ARG BUILD_TIME=""
ARG APP_VERSION=""
ENV NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION

# Increase Node memory limit to prevent Next.js from running out of memory during the build
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Native Chromium for the PDF export route (src/app/api/proposals/[id]/pdf).
# @sparticuz/chromium's bundled binary is glibc-linked (built for AWS Lambda's Amazon
# Linux) and CANNOT run on this musl-libc Alpine base — no missing library is
# installable to fix that, the two libc ABIs are incompatible outright ("Error
# loading shared library libnspr4.so / libnss3.so ... needed by /tmp/chromium").
# Installing Alpine's own native Chromium and pointing puppeteer-core at it (see
# PUPPETEER_EXECUTABLE_PATH below, read in the route) is Puppeteer's own documented
# fix for exactly this Alpine case — https://pptr.dev/troubleshooting.
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Deploy provenance (passed by the deploy workflow) — surfaced at /api/health
ARG COMMIT_SHA=""
ARG BUILD_TIME=""
ENV COMMIT_SHA=$COMMIT_SHA
ENV BUILD_TIME=$BUILD_TIME

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Generated Prisma client for runtime queries. The `prisma` CLI is NOT included —
# schema changes are applied manually via `docker exec` (see docker-entrypoint.sh),
# so the deep CLI dep chain (@prisma/config → effect → fast-check) isn't needed.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Entrypoint: run prisma db push then start the app
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
