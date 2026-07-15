# Foundry by Gitwork — Claude Code Guide

> **New session?** Read this file top-to-bottom before doing anything. It has everything
> needed to pick up the project without re-exploring the codebase.

> **Doing any mobile / responsive / layout work?** Read [`docs/mobile-playbook.md`](docs/mobile-playbook.md)
> first — it is the mandatory operating standard for responsive fixes (breakpoints, shared
> primitives, blast-radius discipline, and how to verify). Don't silo a fix to one screen.

---

## 1. Project Overview

**Foundry by Gitwork** is a design-and-build agency SaaS platform for the Gitwork team.
It serves two audiences simultaneously:

- **Public** — a Foundry marketing homepage at `/` (Gitwork branding, cream/Foundry design)
- **Internal** — a full platform app at `/app` for the Gitwork team to manage proposals,
  clients, developer hiring, AI project validation, user research, and client support

**Owner:** Dan Lindsay (dan@gitwork.co.uk) — Gitwork founder  
**Agency:** Gitwork (gitwork.co.uk)

---

## 2. Repo & Deployment

> **⚠️ INFRASTRUCTURE MIGRATED — July 2026.** Production **no longer runs on Vercel/Neon**. It now
> runs on a **Fasthosts VPS** (`194.164.127.222`) via **Docker Compose** — the Next.js app container
> + a self-hosted **PostgreSQL** container (with pgvector), behind a reverse proxy with a **Let's
> Encrypt** cert. `foundry.gitwork.co.uk` points at the VPS by an **A record** (managed in
> **Squarespace** DNS). **Push to `main` auto-deploys to the VPS** via GitHub Actions
> (`.github/workflows/deploy.yml`): build image → GHCR → SSH to VPS → `docker compose pull` +
> `prisma db push` + restart (~6 min). Vercel is still Git-connected and builds in parallel, but
> that's **vestigial** (DNS no longer points at it). The Vercel-specific details in this section
> (`vercel.json` build, Neon URLs) are **historical/rollback context** — Vercel + Neon are kept live
> as a fallback until decommissioned. **See §23 for the current setup.**

| Item | Value |
|---|---|
| GitHub repo | `Git-Dann/docs-by-gitwork` |
| Production host | **Fasthosts VPS `194.164.127.222`** — Docker Compose (app + Postgres). See §23 |
| Production branch | `main` — **auto-deploys to the VPS** via GitHub Actions (`deploy.yml`) on push, ~6 min. (Vercel still builds in parallel — vestigial, §23) |
| Merge policy | **Squash-merge only** · merge & rebase-merge disabled · branches auto-delete on merge |
| Production URL | `foundry.gitwork.co.uk` |
| Vercel team | `dans-projects-7462374f` |
| Vercel project ID | `prj_u7FhnIWLk1xj5pHtAaApEnshLZfS` |
| Vercel project name | `foundry-by-gitwork` |
| Also aliases | `foundry-by-gitwork.vercel.app`, `docs-by-gitwork.vercel.app` |
| AI context page | `foundry.gitwork.co.uk/context` (noindex, not in nav) |

### Branch, merge & deploy workflow

**`main` is the production branch — every push auto-deploys**, now to the **Fasthosts VPS** via
GitHub Actions (`.github/workflows/deploy.yml`, ~6 min), not Vercel (§23). The squash-merge
discipline below is still worth keeping for a clean, readable history:

- **Squash-merge only** — merge commits and rebase-merge are disabled. Each PR lands as a
  single commit on `main`, titled with the PR title (which becomes the Vercel deploy label).
- **Auto-delete head branches on merge** — merged branches are removed automatically, so they
  don't accumulate.

Rules of thumb:

- **Small fixes** → commit directly to `main` with a clear [Conventional Commit](https://www.conventionalcommits.org)
  message (`fix:`, `feat:`, `chore:`, `docs:` …). That message is what appears in the Vercel
  deploy feed — make it descriptive.
- **Features** → branch (`feature/...`), open a PR, let it **squash-merge**. One feature →
  one clean deploy line. Vercel builds a preview URL for the branch automatically.
- **Syncing a feature branch with `main`** → **rebase** (`git fetch && git rebase origin/main`).
  Do **not** `git merge main` into the branch and push that merge onto `main` — merge commits
  like *"Merge origin/main into feature/x"* land on production as unreadable deploys. (This was
  the single biggest source of deploy-feed noise before it was cleaned up in June 2026.)
- **Stay tidy** → prune stale worktrees (`git worktree prune`) and don't leave dozens of
  abandoned branches around. Auto-delete handles remote branches post-merge.

### Git hygiene — prevent object store corruption

Claude Code creates a worktree per session. Without maintenance, accumulated worktrees and stale
local `claude/` branches cause pack-file corruption (missing delta bases, orphaned commit objects)
that breaks `git gc`, `git prune`, and `git fsck`. This happened in June 2026 and required a full
mirror clone to repair.

**Run periodically** (every few sessions, or when > ~5 active worktrees):

```bash
# From the MAIN repo directory (not a worktree):
git worktree prune
git branch | grep claude/ | xargs git branch -D 2>/dev/null || true
git gc --prune=now
```

**If `git gc` fails** with "bad tree object" or "unable to read [sha]":
1. **Do NOT use `--depth=20`** for repair — shallow clone packs have their own missing bases.
2. Do a full mirror clone: `git clone --mirror https://github.com/Git-Dann/docs-by-gitwork.git /tmp/repair`
3. Copy ALL pack files: `cp /tmp/repair/objects/pack/*.{pack,idx} .git/objects/pack/`
4. Remove temp: `rm -rf /tmp/repair`
5. Retry `git gc --prune=now`

**Build safety:** `vercel.json` runs `prisma db push` **without** `--accept-data-loss` on every
build. Never re-add it: it let any preview branch silently mutate the shared production database.

⚠️ **Schema-change footgun (learned the hard way, June 2026 — PR #189).** Prisma's safety check
is *all-or-nothing per push*. If your schema diff contains anything Prisma deems potentially
data-losing — even something benign like a removed column on a sibling table — the **whole sync
is skipped, additive parts included**. So a "purely additive" PR (new table, new column with a
default) can still fail to apply to prod if the schema also carries an unrelated pending drop
from an earlier commit. The Prisma client generates fine and TypeScript compiles, but the live
DB never gets the column → `upsert()` calls fail at runtime with *"the column does not exist
in the current database."*

When shipping a schema change, **before merging**:

1. Run `git diff origin/main -- prisma/schema.prisma` and look for anything dropped — columns,
   tables, enum values, indices, FKs. If everything's purely additive *and* main's schema
   matches prod, the build will apply it cleanly.
2. If there's ANY drop/rename in the diff (yours or pending from earlier), it won't apply via
   the build. Two options:
   - **(a)** Apply manually first: pull the prod `DATABASE_URL`, run
     `DATABASE_URL=… DIRECT_URL=… npx prisma db push --accept-data-loss` from your machine.
     Verify before merging.
   - **(b)** Switch this PR to proper Prisma migrations (`prisma migrate dev` locally to
     generate the SQL, commit the migration file, the build runs `migrate deploy`). Heavier
     setup but reproducible. Recommended once schema changes are frequent.

In emergencies (prod broken because a schema-using route is crashing), option (a) is the
fastest fix — it took ~10 seconds during the PR #189 incident.

---

## 3. Environment Variables

> Since the July 2026 migration (§23), production env lives in the **VPS `.env`** (loaded by Docker
> Compose), **not** Vercel. `DATABASE_URL`/`DIRECT_URL` both point at the compose-internal Postgres
> (`…@db:5432/foundry?sslmode=disable`). The **VPS `.env`** is the source of truth for live values;
> `docs/fasthosts-secrets-recovery.md` documents where each secret comes from (no live values). The
> block below is the original per-var reference (Neon URL examples are historical).

For local dev, create `.env.local`:

```bash
# Neon PostgreSQL — two URLs required (Vercel connection pooling)
DATABASE_URL="postgresql://[USER]:[PASSWORD]@ep-[NAME]-pooler.[REGION].aws.neon.tech/[DBNAME]?sslmode=require"
DIRECT_URL="postgresql://[USER]:[PASSWORD]@ep-[NAME].[REGION].aws.neon.tech/[DBNAME]?sslmode=require"

# AI — Anthropic is default, others optional (configurable per workspace in Settings)
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""      # optional
GEMINI_API_KEY=""      # optional

# API auth — gates all /api/ routes (except /api/health)
API_KEY=""             # or NEXT_PUBLIC_API_KEY as fallback

# GitHub — required for Pulse repo scans and fix-agent PR creation
GITHUB_TOKEN=""        # PAT with repo + metadata read permissions

# Encryption — used by the client onboarding flow to encrypt bank details
# at rest (AES-256-GCM via src/lib/encryption.ts). Generate with:
#   openssl rand -base64 32
ENCRYPTION_KEY=""      # 32-byte base64 secret
```

> **Care analytics tokens are NOT env vars.** Each Care client's product-analytics API
> token is stored per-connection (on the `AccountConnection.scraperConfig`), set in the
> Care **Connectors** tab via the "Analytics API" connector — see §15.

---

## 4. Module Map

The sidebar uses different labels from the URL routes — mapping below:

| Sidebar label | Route | Server module | Description |
|---|---|---|---|
| **Foundry HQ** | `/app` | — | Dashboard overview |
| **Pulse** | `/app/pulse` | `src/server/pulse*.ts` + `pulse-agents/` | AI project validation — 150+ automated checks, gap analysis, GitHub fix-agent, continuous monitors. Also hosts the optional **Study** research tool (no longer a top-level module — see §26) |
| **Code** | `/app/codeclear` | `src/server/codeclear*.ts` | Developer hiring pipeline — GitHub analysis, scoring, candidate management |
| **Docs** | `/app/docs` | `src/server/proposals.ts` · `documents.ts` · `document-analytics.ts` | Document builder (proposals + SLA/SOW/MSA/NDA/CO/DSA) — registry-driven sections, costing, timeline, markdown rich text, split-screen live preview, tokenised public share (`/docs/[token]`), e-sign, comments, versions, AI authoring, **link tracking + analytics** (`/app/docs/analytics`). **Canonical route is `/app/docs`**; `/app/proposals/*` are redirect stubs (see §16) |
| **Portal** | `/app/clients` | `src/server/clients.ts` · `meetings.ts` | Client management + detail pages, incl. **Scribe** AI meeting notes per-client (no sidebar item — see §14) |
| **Care** | `/app/support` | `src/server/support.ts` | Client support ops — conversations, tickets, workflow rules, audit log |
| **Study** (tool) | `/app/study` | `src/server/study*.ts` + `study-agents/` | AI user research — multi-agent persona interviews, synthesis, reports. **No sidebar item** — surfaced as an optional tool inside Pulse (see §26). Routes/API/models unchanged at `/app/study` · `/api/study` |
| **Backstage** | `/app/backstage` | `src/server/backstage.ts` + `backstage-holidays.ts` | Internal Gitwork ops umbrella — v1 covers staff leave booking + expenses tracking + staffing alerts on HQ. Future tools slot in as `/app/backstage/<slug>` |
| **Settings** | `/app/settings` | — | AI provider config, rate card, workspace branding |
| **Proof** | `/app/proof` | `src/server/proof.ts` | Document sign-off workflow — currently **hidden from nav** (commented out in app-shell.tsx) |
| **Rate Card** | `/app/settings` (tab) | `src/server/rate-card.ts` | People rates used in proposal costing |

**Public pages (outside /app):**

| Route | Description |
|---|---|
| `/` | Foundry marketing homepage — Gitwork logo in nav/footer, Foundry cream design |
| `/pulse-overview` | Standalone public Pulse product page (not in app nav, shareable URL) |
| `/api-docs` | REST API reference |
| `/context` | AI context page — this project's structured context for AI assistants |
| `/report/[token]` | Shareable public Pulse scan report |
| `/onboarding/[token]` | Public client onboarding flow — tokenised, no auth, autosaves per step |
| `/app/pulse/[scanId]/report` | Printable Pulse report (in-app) |

---

## 5. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, App Router, React 19, TypeScript |
| Styling | Tailwind CSS v4 (CSS-first, no tailwind.config.js) |
| Database | Self-hosted **PostgreSQL** (Docker container, pgvector) · Prisma ORM. *Was Neon — migrated July 2026, §23; Neon kept for rollback* |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) + OpenAI-compatible SDK for multi-provider |
| Data fetching | TanStack React Query v5 — hooks in `src/hooks/` |
| Validation | Zod — all schemas in `src/server/validators.ts` |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| PDF | pdf-lib |
| Deploy | **Docker Compose on a Fasthosts VPS** (§23). *Was Vercel — kept live read-only for rollback* |

---

## 6. File Structure

```
src/
  app/
    page.tsx                      ← PUBLIC: Marketing homepage (Foundry design, Gitwork logo)
    layout.tsx                    ← Root layout (fonts, metadata, providers)
    globals.css                   ← Global styles (Tailwind v4, @layer base/components/utilities)
    (app)/app/                    ← All platform app routes (wrapped in AppShell sidebar)
      page.tsx                    ← Foundry HQ dashboard
      pulse/                      ← Pulse pages
      codeclear/                  ← CodeClear pages
      proposals/                  ← Docs / Proposal builder pages
      clients/                    ← Portal / Client pages
      support/                    ← Care pages
      study/                      ← Study pages
      proof/                      ← Proof pages (built, nav hidden)
      settings/                   ← Settings page
      account-settings/           ← Account settings
    api/                          ← REST API routes (all gated by middleware)
      pulse/scans/                ← Pulse scan CRUD + run/stream/cancel/fix-agent/share
      pulse/monitors/             ← GitHub monitors CRUD
      study/studies/              ← Study CRUD + plan/run/stream
      support/clients/            ← Care client/ticket/conversation CRUD
      codeclear/candidates/       ← CodeClear candidate CRUD + GitHub analysis
      proposals/                  ← Proposal CRUD + costing/timeline/export
      proof/                      ← Proof document CRUD + analyse
      clients/                    ← Client CRUD
      rate-card/                  ← Rate card CRUD
      settings/                   ← AI integrations + model settings
      report/[token]/             ← Public shareable report
      webhooks/github/            ← GitHub webhook for Pulse monitors
      dev/seed-demo/              ← Dev: seed Pulse demo data
      dev/seed-study-demo/        ← Dev: seed Study demo data
      health/                     ← GET /api/health (public, no auth)
    pulse-overview/               ← PUBLIC: standalone Pulse product page
    report/[token]/               ← PUBLIC: shareable scan report
    api-docs/                     ← PUBLIC: REST API reference
    context/                      ← AI context page (this project, not in nav)

  server/                         ← Server-side business logic (imported by API routes)
    bootstrap.ts                  ← ensureBaseRecords() — creates default User/Workspace
    validators.ts                 ← All Zod input schemas
    pulse.ts                      ← Pulse CRUD, getPulseScan, scan management
    pulse-scan.ts                 ← Core scan engine (150+ checks, ~3200 lines — DO NOT split yet)
    pulse-ai.ts                   ← AI model routing, getMockAnalysis fallback
    pulse-agents/
      orchestrator.ts             ← Coordinates scan phases
      browser-agent.ts            ← Headless browser / rendered HTML checks
      code-agent.ts               ← GitHub repo analysis
      deploy-agent.ts             ← Deployment / infra checks
      fix-agent.ts                ← Auto-generates fix PRs on GitHub
      monitor.ts                  ← GitHub webhook monitors, triggerMonitorScan
    study.ts                      ← Study CRUD + runStudy pipeline (uses after() for async)
    study-agents/
      researcher.ts               ← Research plan generation + follow-up questions
      persona.ts                  ← AI persona interview conductor
      synthesizer.ts              ← Turn/session/final report synthesis
      types.ts                    ← Shared agent types (AiConfig etc.)
    support.ts                    ← Care/Support CRUD (clients, tickets, convos, workflow rules)
    codeclear.ts                  ← Candidate management + default payloads
    codeclear-analysis.ts         ← GitHub code analysis runner
    proposals.ts                  ← Proposal CRUD + all default section payloads
    proof.ts                      ← Proof document workflow
    clients.ts                    ← Client CRUD
    meetings.ts                   ← Scribe: ingest/summarise Gemini notes → Meeting records, attribute to client, search
    google-drive-notes.ts         ← Scribe: locate + read Google Meet "Notes by Gemini" docs via the Drive API
    google-auth.ts                ← Per-user Google OAuth client (Calendar/Gmail/Drive) + googleClientForRefreshToken (cron)
    ai-provider.ts                ← Shared AI provider resolver (Anthropic/OpenAI/Gemini/Local) + completeText/parseJsonObject
    rate-card.ts                  ← Rate card people CRUD

  components/
    app-shell.tsx                 ← Sidebar layout (uses /foundry-logo.png — already in public/)
    app-overview.tsx              ← Foundry HQ dashboard component
    pulse/                        ← Pulse UI (overview, scan list, scan results, shared)
    study/                        ← Study UI (list, wizard, detail, report)
    support/                      ← Care UI (support-dashboard.tsx)
    proposals/                    ← Proposal builder (20+ components)
    codeclear/                    ← CodeClear UI
    clients/                      ← Client UI
    proof/                        ← Proof workspace
    settings-panel.tsx            ← Settings page (AI providers, rate card, workspace)
    marketing/
      codeclear-site-demo.tsx     ← Public-facing CodeClear demo widget (used on homepage)
    ui/                           ← Shared primitives (button, tooltip, image-picker)
    providers/                    ← React Query provider, app providers

  hooks/                          ← TanStack React Query hooks
    use-pulse.ts                  ← Pulse scan + monitor hooks
    use-study.ts                  ← Study hooks
    use-support.ts                ← Care/support hooks
    use-codeclear.ts              ← CodeClear hooks
    use-proposals.ts              ← Proposal hooks
    use-proof.ts / use-proof-brief.ts
    use-proposals.ts

  lib/
    prisma.ts                     ← Prisma client singleton (import from here, not direct)
    api.ts                        ← All fetch() helpers for API routes
    api-response.ts               ← apiOk() / apiError() / fromError() helpers
    local-settings.ts             ← localStorage settings via useLocalSettings() hook
    format.ts                     ← cn() class merger + other formatters
    github.ts                     ← GitHub API helpers (used by Pulse agents)
    default-template.ts           ← Default proposal template + section payloads
    proof.ts                      ← Proof-related utilities
    proposal-workflow.ts          ← Proposal state machine helpers
    clients.ts                    ← Client helper utilities

  types/                          ← TypeScript type definitions
    pulse.ts                      ← Pulse scan types
    support.ts                    ← Care/support types
    codeclear.ts                  ← CodeClear types
    proposal.ts                   ← Proposal types
    client.ts                     ← Client types
    rate-card.ts                  ← Rate card types
    proof-brief.ts                ← Proof brief types

  config/
    study-personas.ts             ← 8 built-in research personas (demographics, goals, prompts)

  middleware.ts                   ← CORS + API_KEY auth + gitwork_api_session cookie

public/
  gitwork-logo-home-page.png      ← Gitwork logo used on the marketing homepage
  foundry-logo.png                ← Foundry logo used in the app sidebar
  gitwork-header.png              ← Hero image on marketing homepage

prisma/
  schema.prisma                   ← Full schema (70+ models, 40+ enums)
  seed-demo.ts                    ← Pulse demo seed (called via /api/dev/seed-demo)
```

---

## 7. Prisma Schema — Model Summary

Core domains:

| Domain | Key models |
|---|---|
| Platform | `User`, `Workspace`, `WorkspaceMember`, `WorkspaceClient` |
| Proposals/Docs | `Document`, `DocumentSection`, `DocumentTemplate`, `Asset`, `CTA`, `Link`, `TimelinePhase`, `CostLineItem`, `Export` |
| Docs sharing/tracking | `DocumentView` (+ `visitorId`/`sessionId`/geo/device/`durationMs`), `DocumentViewEvent` (per-section dwell), `DocumentComment`, `DocumentVersion`, `EditorPresence`, `DocumentAiSession`, `SignatureRequest`/`SignatureSigner`/`SignatureEvent`. `Document` carries `shareToken`/`isShared`/`sharedAt`/`firstViewedAt`/`acceptedAt`/`declinedAt`; `DocumentStatus` adds `ACCEPTED`/`DECLINED` |
| Proof | `ProofDocument` |
| Clients | `WorkspaceClient`, `ActivityLog` |
| CodeClear | `Candidate`, `Placement`, `Note`, `GitHubAnalysisRun`, `CodeClearScore`, `CodeClearScoreDraft` |
| Pulse | `PulseScan`, `PulseScanCheck`, `PulseMonitor` |
| Study | `Study`, `StudyResearchPlan`, `StudyPlanQuestion`, `StudySession`, `StudyReport` |
| Care/Support | `SupportClient`, `SupportClientMembership`, `SupportConversation`, `SupportMessage`, `SupportTicket`, `SupportWorkflowRule`, `SupportAuditLog`, `DraftSupportAction`, `AccountConnection`, `ChannelToken` |
| Backstage | `LeaveRequest`, `Expense` (plus `WorkspaceMember.countryCode/annualLeaveDays`, `Workspace.defaultAnnualLeaveDays/expenseCategories`) |
| Tasks | `Task`, `TaskComment`, `DailyUpdate`, `ClientAssignment` (user↔client link backing `seeAllClients`) |
| Scribe | `Meeting`, `MeetingActionItem` (client-scoped Google Meet notes; `MeetingNoteStatus` enum) |
| Rate Card | `RateCardPerson` |
| Identity | `CustomerIdentity` |

---

## 8. Code Conventions

**API routes**
- Always use `apiOk(data)`, `apiError(message, status)`, `fromError(error)` from `src/lib/api-response.ts`
- Validate request bodies with Zod schemas from `src/server/validators.ts`
- Route params come as `Promise<{...}>` in Next.js 15 — always `await params`

**Server modules**
- One file per domain at `src/server/{domain}.ts`
- Agents go in `src/server/{domain}-agents/{agent}.ts` — never at root level

**Auth**
- All `/api/` routes except `/api/health` are gated by `API_KEY` env var
- Browser traffic to `/app/**` gets a `gitwork_api_session` HttpOnly cookie from middleware
- External API calls use `Authorization: Bearer {API_KEY}` header

**CSS / Tailwind v4**
- No `tailwind.config.js` — config is CSS-first in `globals.css`
- Anchor reset MUST be inside `@layer base { a { color: inherit; ... } }` — unlayered CSS
  overrides `text-{color}` utilities in Tailwind v4 (cascade layer priority)
- Use `cn()` from `src/lib/format.ts` for conditional classnames

**Images**
- Use `next/image` (`<Image>`) for all static assets in `public/`
- Raw `<img>` only for dynamic/user-uploaded images (e.g. avatars) — always add
  `{/* eslint-disable-next-line @next/next/no-img-element */}` above

**AI providers**
- Never hardcode a model name — always resolve via workspace settings
- Follow the pattern in existing Pulse/Study route handlers: resolve `aiConfig` from
  `workspace.aiProvider` + `workspace.*ApiKey` + `workspace.*Model`
- `getModelForTask()` in `src/server/pulse-ai.ts` is the canonical resolver

**Pulse checks & categories — SINGLE SOURCE OF TRUTH (mandatory)**
- **Categories live in ONE place: `src/server/pulse-checks/categories.ts`** (`CATEGORIES` +
  `CATEGORY_META`). Everything derives from it — the settings-panel category list
  (`CHECK_CATEGORIES`), scoring/priority weights (`WEIGHTED_CATEGORIES`), both report
  `DOMAIN_DEFS`, and the framework counts (`pulse-framework.ts` reads the registry). Do **not**
  hand-maintain any of those derived lists, and never re-introduce a duplicate category list.
- **`PulseScanCheckInput.category` is the typed union `CheckCategory`** — a check that emits a
  raw/typo'd category is a **compile error**. Always tag checks with `CATEGORIES.<X>`, never a
  string literal. This applies in `pulse-checks/*`, `pulse-agents/*`, and `pulse-scan.ts`.
- **To ADD A CHECK:** emit it with `category: CATEGORIES.<X>` **and** add its `{ key, category,
  label }` row to `src/server/checks-registry.ts`. That's the catalogue the Settings → Checks
  panel + per-workspace `PulseCheckConfig` overrides + framework counts are built from.
- **To ADD A CATEGORY:** add one entry to `CATEGORIES` + one row to `CATEGORY_META` (pick a
  domain + weight + blurb). Nothing else needs editing.
- **Enforced by `src/server/pulse-checks/__tests__/categories.reconcile.test.ts`** (`npm test`):
  every emitted `checkKey` must be in the registry, every category must have metadata + one
  domain, no duplicate keys. If it fails, the catalogue drifted — fix the source, not the test.
- Runtime stats are already automatic: all scan-results UI derives pass/warn/fail, category
  cards, score and priority live from the persisted `scan.checks` — nothing to wire per check.

**Logos**
- Marketing homepage (`src/app/page.tsx`): uses `/gitwork-logo-home-page.png`
- App sidebar (`src/components/app-shell.tsx`): uses `/foundry-logo.png`

**Local settings**
- Account + workspace branding lives in `localStorage` via `useLocalSettings()` hook
- No server-side user accounts yet — auth is coming (see upcoming work)

---

## 9. Development Commands

```bash
npm run dev          # Start local dev server (localhost:3000)
npm run build        # prisma generate → prisma db push → next build
npm run db:generate  # prisma generate only
npm run db:push      # push schema changes to Neon
npm run db:migrate   # create a named migration
npm run lint         # ESLint
```

---

## 10. Upcoming Work (Next Sessions)

### Care vector store
- Add pgvector extension to Neon for semantic search
- Enable `CREATE EXTENSION vector` on the Neon database
- Add vector embedding column to `SupportConversation` and/or `SupportMessage`
- Use Anthropic embeddings API or OpenAI text-embedding-3-small
- Enable semantic search across client conversation history in Care module

### Backstage v2 ideas (post-MVP)
- Per-leave-type allowances (separate sick allowance, etc.) — single annual pool today
- Multi-currency FX conversion for expenses — currently amount + currency stored verbatim
- Leave-balance carryover year-to-year
- APNs push notifications for new leave/expense submissions — schema (`DeviceToken`) supports it, trigger points exist in `src/server/backstage.ts`
- Object-storage migration for receipts — `bytea` is fine while volume is low
- Additional internal tools under `/app/backstage/<slug>` (finance, inventory, vendor admin) — Backstage was named as an umbrella; v1 is single-page only

### Umbrella pattern for internal tools
- Backstage is the convention: ONE sidebar item, ONE module entry, sub-tools added as tabs or `/app/backstage/<slug>` routes when they arrive
- Do not add a second top-level "internal" sidebar item — slot it under Backstage instead

---

## 11. Known Issues / Tech Debt

| Issue | File | Notes |
|---|---|---|
| `pulse-scan.ts` is 3200+ lines | `src/server/pulse-scan.ts` | Works fine — don't split without a clear plan. Future task. |
| ~135 `any` type usages | various | Not breaking. Gradual cleanup is a future task. |
| Proof is built but hidden | `src/components/app-shell.tsx` | Nav item commented out. Can be re-enabled when ready. |
| Library/Templates nav hidden | `src/components/app-shell.tsx` | Same — commented out, works but not exposed. |
| `locals-settings` uses localStorage | `src/lib/local-settings.ts` | Account/workspace settings client-only — pre-auth artifact. |
| Stale `MODULE_PATHS` route names | `src/middleware.ts` | Still references old paths (`/app/support`, `/app/clients`, etc.) — the new routes (`/app/care`, `/app/portal`) aren't permission-gated as a result. Pre-existing bug, separate ticket. |
| Backstage receipts in Postgres `bytea` | `prisma/schema.prisma` (`Expense.receiptImage/Thumb`) | Fine for now. Migrate to Vercel Blob / R2 once volume exceeds ~100 expenses or any receipt routinely > 1MB. Lifecycle: full image dropped on review, ~20KB thumb retained for audit. |

---

## 12. Recent Changes (May 2026)

In the last session, the following was completed:

1. **Marketing homepage fixed** — button text (purple + black CTAs) now white; Gitwork logo image wired up; "Open platform" links go to `/app` not `/app/proposals`. Root cause was Tailwind v4 cascade layer issue — anchor reset now in `@layer base` in `globals.css`.

2. **Codebase cleanup:**
   - Deleted dead pages: `/marketing`, `/preview`, `/app/pulse/all` (pure redirects / orphans)
   - Moved `pulse-fix-agent.ts` → `src/server/pulse-agents/fix-agent.ts`
   - Moved `pulse-monitor.ts` → `src/server/pulse-agents/monitor.ts`
   - Deleted 7 unused public assets (Next.js defaults + old logo SVGs)
   - Deleted `src/lib/support-seed.ts` (never imported)
   - Cleaned personal name/email from default values in `local-settings.ts`, `default-template.ts`, `codeclear.ts`

3. **AI context page** added at `/context` (`src/app/context/page.tsx`) — structured project context for AI assistants to read on session resumption.

4. **This CLAUDE.md** — comprehensive handoff guide.

## 13. Recent Changes (June 2026)

1. **Backstage module shipped** — internal Gitwork ops umbrella at `/app/backstage`:
   - **Leave booking** with allowance tracking (default 25 days/year, per-user override on `WorkspaceMember.annualLeaveDays`). Half-day support. Workspace defaults on `Workspace.defaultAnnualLeaveDays`.
   - **Expenses** with photo-receipt capture. Client-side compression via `browser-image-compression` (web) and native compression (iOS); server transcodes HEIC via `sharp` and generates a 200px thumb on review.
   - **Staffing alerts** on Foundry HQ — combines approved leave + `date-holidays` lookups + conflict detection across the next 30 days. Powers both the web dashboard widget and the iOS dashboard widget.
   - **HR via permission flag** — added `backstage.approve` to `FEATURE_PERMISSIONS` (default-off). Admins bypass automatically. UI toggle lives in Settings → Team's permission editor.
   - **iOS contract** — every endpoint is mobile JWT-aware via `requireAuthedUser()` (bridges `getRequestUser()` headers + NextAuth `auth()`). Single multipart `/api/backstage/expenses/[id]/receipt` works for web + iOS.
   - **Notifications** — submissions email all admins + `backstage.approve` holders via the existing Resend config on `Workspace.emailApiKey/emailFromAddress`. New `src/server/email.ts` helper (fire-and-forget).
   - **Default permission** — newly auto-provisioned users get `backstage` so they can self-serve leave/expenses from day one.

2. **`fromError` honours `error.status`** — `UnauthorizedError` (401) and `ForbiddenError` (403) in `src/server/auth/effective-user.ts` now propagate their HTTP status through the `fromError` helper.

3. **`FEATURE_PERMISSIONS` learned about defaults** — entries now have `defaultOn: boolean`. `DEFAULT_STAFF_PERMISSIONS` filters in only the default-on ones, so adding a new opt-in capability (like `backstage.approve`) doesn't auto-grant it to existing staff presets.

4. **Task tracker shipped inside Portal** — a native, Kanban-style tracker (no external integration):
   - **Board + list** per client at `/app/portal` (Clients | Tasks tab). Kanban columns Backlog · To Do · Doing · In Review · Done (`@dnd-kit` drag). Compact `TasksSummaryCard` on each client detail page (`16 // TASKS`) deep-links to the filtered board. Server: `src/server/tasks.ts`, hook `src/hooks/use-tasks.ts`, components `src/components/tasks/`, types `src/types/tasks.ts`.
   - **Notes** — append-only `TaskComment` thread in the task detail drawer.
   - **Daily Slack standups** — `src/server/tasks-standup.ts`. Devs push an **AM "Doing"** (+ Monday "This week", pre-filled from tasks due that ISO week) and a **PM "Done"**; each posts (best-effort, via `Workspace.slackBotToken`) to the involved clients' internal `WorkspaceClient.slackChannelId`. The DevOps lead (`tasks.publish` — new default-off `FEATURE_PERMISSIONS` entry; admins bypass via `canPublishTaskRollup`) sees a roster of who's pushed and publishes one consolidated roll-up to `channelRoutes["tasks.rollup"]` (gated on all-pushed, with override).
   - **Developer scoping made real** — `ClientAssignment` is the user↔client link the `developer` preset / `seeAllClients=off` flag always implied. Assigned in Settings → Team (`MemberAccessModal` client picker → `PUT /api/team/members/[id]/clients`). Restricted devs are scoped server-side (task board + `/api/clients` list), the sidebar nav now filters by module permission (`app-shell.tsx`), and `MODULE_PATHS` in `src/middleware.ts` was widened to the canonical routes (`/app/portal`, `/app/care`, `/app/code`, `/app/docs`) so deep-links gate correctly.
   - **Developer dashboard** — `AppOverview` renders a task-focused `DevOverview` (My Day standup + My Clients) for developers; admins/staff keep the bento grid plus a new `06 // TASKS` widget, and `tasks.publish` holders get the roll-up panel atop HQ.

5. **Tasks v2 — feature blocks + Gantt + public client timeline** (moved tasks per-client):
   - **Per-client tasks page** at `/app/portal/[slug]/tasks` (`ClientTasksWorkspace`) with **Board · List · Gantt** views. Opened from a small **Tasks →** button in the `06 // DEVS` card on the client detail page — the Portal `Clients | Tasks` tab and the `16 // TASKS` summary card were **removed** (deleted `portal-workspace.tsx`, global `tasks-workspace.tsx`, `tasks-summary-card.tsx`).
   - **Feature blocks ("lists")** — new `FeatureBlock` model (clientId, name, start/end dates, colour, orderKey). Each block is one Gantt bar; tasks optionally belong to a block (`Task.featureBlockId`, nullable → loose tasks stay board-only). Server `src/server/feature-blocks.ts`, routes `/api/feature-blocks(/[id])`, validators, hooks in `use-tasks.ts`.
   - **Gantt** (`src/components/tasks/gantt-chart.tsx`) — dependency-free: blocks as bars on a day-scale axis, **Month/Quarter/6mo/Year** zoom, a **red today line**, sticky left rail listing block + task titles + progress. Shared by the internal page and the public timeline.
   - **Public client timeline** — per-client toggleable share (`WorkspaceClient.timelineShareToken/timelineShareEnabled`). Public no-auth page `/timeline/[token]` (server-rendered via `getPublicTimeline` in `src/server/client-timeline.ts`, `noindex`), showing blocks + task names + progress + today line (no assignees/notes). Enabled from the **Share timeline** control on the per-client tasks page (`/api/clients/[slug]/timeline-share`).

6. **Team roster seed** — `src/server/team-roster.ts` is the canonical name→email→role roster (24 devs + Harry admin, Sian staff, Dan), alias-matched. `seedGitworkTeam()` (admin one-shot `POST /api/dev/seed-team`) upserts `User`+`WorkspaceMember` (developer preset) and backfills `Candidate.email` in Code.

7. **Tasks v3 — multi-assignee, subtasks, acceptance criteria, milestones, optional block dates** (built on v2):
   - **Multi-assignee** — `Task.assignees` (m-n); legacy `Task.assigneeId` kept (not dropped — additive for `prisma db push`) and used as a fallback when the join is empty. DTO is `assignees[]`; UI shows an `AssigneeStack`; standup/roll-up/scoping query `assignees: { some }` (OR legacy). Form uses togglable name chips.
   - **Subtasks** — `Task.parentId` self-relation (one level). Board/list show top-level only (`parentId: null`); subtasks live in the detail drawer (checklist + add), card shows a count.
   - **Acceptance criteria** — `Task.acceptanceCriteria` (optional) in the form + drawer.
   - **Milestones** — new `Milestone` model (single date) + `src/server/milestones.ts`, `/api/milestones(/[id])`, hooks, `milestone-form.tsx`. Render as diamond markers on the Gantt (internal + public) via `GanttChart`'s `milestones` prop.
   - **Optional block dates** — `FeatureBlock.startDate/endDate` now nullable; a block is a Gantt bar only when both are set, else board-only. `Task.metadata` (Json) + `clickupId` (indexed, not unique) on Task/FeatureBlock/Milestone for one-time-import idempotency.
   - **Retainer** (now wired — see §20): `WorkspaceClient.retainerDays` (monthly allowance) persists + renders on the card; additive `retainerDaysUsed` (days used this month, manual) added alongside.

8. **One-time task migration (since removed).** The initial client-task data was imported in July 2026 via a one-time importer (a token-based ClickUp API path and a no-token CSV-export path). **That tooling was deleted once the migration completed** — the import servers, the `/api/dev/import-clickup` + `/api/dev/clickup-audit` routes, `scripts/parse-clickup-csv.mjs` and the committed `src/data/clickup-import.json` are gone. The additive `clickupId` columns (Task/FeatureBlock/Milestone, indexed, not unique) **remain** — they're kept for idempotency/provenance and still back the delivery-plan dedup in `foundry-automation.ts`; dropping them would be a data-losing schema change the guarded `prisma db push` skips.

9. **Bulk task tools** (shipped alongside the migration, still live) — the per-client list view (`/app/portal/[slug]/tasks` → List) has **select / select-all / deselect-all** (checkbox column + tri-state header) and a **batch bar** (`src/components/tasks/task-batch-bar.tsx`): bulk **assign** (replace assignees with any workspace member), set **status**, set **priority**, move to **block**, **delete** (two-click confirm). Server: `batchUpdateTasks` / `batchDeleteTasks` in `tasks.ts` (scoped; block-move requires a single client), `taskBatchUpdateSchema` / `taskBatchDeleteSchema`, `PATCH`/`DELETE /api/tasks/batch` (`maxDuration 300`/`120`), hooks `useBatchUpdateTasks` / `useBatchDeleteTasks`. **Note**: assigning a task ≠ granting client access — dev↔client visibility (`ClientAssignment`) is set in Settings → Team.

## 14. Recent Changes (June 2026) — Scribe (AI meeting notes)

**Scribe** is an in-app AI notetaker surfaced quietly in **Portal** on each client's detail page — the `12 // MEETING NOTES` panel, beside Designs in a 2-col row. It is **not** a sidebar item (placement follows the "no new top-level item" rule).

**No bot, no long-running compute (the core decision).** A bot that joins a live call can't run on Vercel's serverless functions (60–90s cap), so Scribe never joins meetings. Instead it reads Google Meet's own **"Notes by Gemini"** docs (summary + decisions + next-steps) that Meet auto-saves to the organiser's Drive, and normalises them with the workspace AI provider. *(Earlier iterations read Meet **transcripts** via the Meet REST API; repointed to Gemini notes because Gitwork generates notes, not transcripts — `google-meet.ts` was deleted.)*

**Pipeline:** calendar event → find the matching "Notes by Gemini" doc in Drive (title + time) → attribute to a client → AI → `Meeting` record → Portal panel.
- **Capture** — `src/server/google-drive-notes.ts`: `findGeminiNotesForEvent` (Drive `files.list` by title/time + `files.export` to text); `extractMeetingCode`.
- **Domain** — `src/server/meetings.ts`: `ingestMeeting`, `summariseMeeting` (→ structured `{summary, decisions[], actionItems[]}`), `listClientMeetings` (+ `q` search over title/summary/notes), `findPastClientCalls` / `listRecentMeetCalls` (candidate calls), `attributeToClient`.
- **Shared AI resolver** — `src/server/ai-provider.ts`: `resolveAiConfig` + `completeText` + `parseJsonObject` (extracted from the duplicated provider blocks; prefer this for new AI calls).

**Data model:** `Meeting` + `MeetingActionItem` + `MeetingNoteStatus` enum. Relations on `Workspace`, `User` (`@relation("MeetingOwner")`), `WorkspaceClient`. Idempotent upsert on `@@unique([workspaceId, calendarEventId])`; the Drive doc id lives in `conferenceRecordName`; `transcriptText` holds the Gemini-notes text. Purely additive — applies via the build's `prisma db push`.

**Auth / scope:** added `https://www.googleapis.com/auth/drive.readonly` to the Google provider in `src/auth.ts` and bumped `SESSION_VERSION` (forces re-consent). Per-user OAuth via `getUserGoogleAuth()`; the cron uses `googleClientForRefreshToken()` (no session). `drive.readonly` is broad but fine for an internal `@gitwork.co.uk` app.

**API** (per-client, mirrors the slack-activity pattern): `GET/POST /api/clients/[slug]/meetings` (list + `/ingest`), `GET/PATCH /api/clients/[slug]/meetings/[id]`. Hooks (`useClientMeetings`, `useIngestClientMeeting`, …) in `use-proposals.ts`; fetchers in `lib/api.ts`.

**Automation:** `GET /api/cron/meet-transcripts`, registered in `vercel.json` at **daily** `0 9 * * *` — ⚠️ the Hobby plan only allows daily crons, so a sub-daily schedule (`*/30`) fails the Vercel deploy. `CRON_SECRET`-guarded (like `support-sync`). Iterates members' Google tokens, finds recently-ended client calls, prefers the organiser's token, attributes by domain, skips `SUMMARISED`, caps per run, ingests concurrently.

**Attribution:** by **attendee email domain ↔ client `website`/`primaryContactEmail`** (generic + `gitwork.co.uk` domains excluded). The per-client "Recent calls" list ALSO matches **the client name in the meeting title** ("Speakify x Gitwork", "Echo Team") so partner/agency calls (attendees on a different domain) still surface. Manual "Fetch notes" uses the page's client explicitly — no guessing.

**UI** — `MeetingNotesSection` + `MeetingNotesModal` in `src/components/clients/client-detail.tsx`: compact rows (title · date · status) with a **View ↗** button (Retry for no-notes/error). View opens a content-sized, branded 2-col modal (per `DESIGN.md`: mono "Scribe" eyebrow, DM Serif Display title, JetBrains Mono timestamp + labels; non-pill attendee chips) — notes left, decisions + action items right. Each **action item has a "+ Task"** button that creates a `Task` on the client's board via `useCreateTask` (no checkboxes — the task board tracks done-ness).

**Go/no-go:** `GET /api/dev/notes-spike?title=…&start=…` confirms Drive access + that the matching Gemini doc is reachable (`verdict: "GO …"`).

**Prerequisites:** Meet AI ("Take notes for me") enabled on the Workspace tier (Gitwork has it — Gemini notes are already generated); each teammate signs out/in once to grant `drive.readonly`.

## 15. Recent Changes (June 2026) — Care analytics connectors (multi-client reporting)

The monthly Care report's usage section is now **API-driven per client**, replacing the
hard-coded Fellas-only fetch. Each Care client can connect their product-analytics API and
the report auto-fills metrics with **month-over-month trends**.

- **New connector** — "Analytics API" source (`SupportSource.ANALYTICS`, added to the enum).
  Set up in Care → **Connectors** → pick an adapter, paste the API base URL + bearer token.
  Stored on `AccountConnection.scraperConfig` as `{ adapter, baseUrl, apiToken }` (token is
  server-side, no longer in `localStorage`). Editable later via the Edit connector modal.
- **Adapter framework** — `src/server/support-analytics/`: `types.ts` (`AnalyticsMetric`,
  `AnalyticsSnapshot`, `AnalyticsAdapter`, `getJson`), `fellas.ts` (subscription/user metrics —
  ported from the old client-side transform; replaces the deleted `/api/support/fellas-proxy`),
  `bigwedge.ts` (Big Wedge Golf — month-scoped rounds-played via
  `/api/v1/rounds/?date_from&date_to`, plus best-effort flattened `analytics/overall-report` +
  `feedback/stats`), `generic.ts` (`flattenMetrics` helper + a "Generic JSON API" adapter that
  turns any numeric field into a metric), `index.ts` (registry + `runAnalytics()` which fetches
  the target month **and** the previous month, merging previous values by metric `key` for
  trends). **Add a new client = add one adapter + register it.**
- **Route** — `GET /api/support/clients/[clientId]/analytics?month=YYYY-MM` finds the client's
  ANALYTICS connection, runs the adapter (current + previous month), returns a normalised
  snapshot.
- **Report payload** — `SupportReportPayload.metrics: AnalyticsReportMetric[]` (flexible
  `{ key, label, value, previous?, unit?, group? }`) replaced the rigid `usage*` fields. The
  builder's section 06 ("ANALYTICS") renders fetched metrics grouped, editable, with
  `TrendBadge`s, plus manual "Add metric". Month is driven by the existing month picker. The
  printable report (`/app/support/reports/[id]`) renders the metrics array with trend deltas.
  Old reports keep their JSON (payload is loose, un-Zod'd) — just re-fetch to populate metrics.
- **Caveat** — the Big Wedge adapter's `overall-report`/`feedback/stats` shapes are undocumented
  in their OpenAPI spec, so those metrics are flattened best-effort and may want refining once a
  live admin token + sample response are available. Rounds-played is clean and month-scoped.

## 16. Recent Changes (June 2026) — Customisable onboarding (forms ported onto the Docs pattern)

The public onboarding flow (`/onboarding/[token]`) was **fully hardcoded** — 7 steps + every
label/hint/paragraph baked into `onboarding-flow.tsx`, each answer a fixed `ClientOnboarding`
column. It's now **data-driven**, mirroring the Docs Template + JSON + field-registry pattern, so
the copy and fields are editable in-app and there can be multiple named forms.

- **Model:** new `OnboardingForm` (the editable template — `steps` Json holds an
  `OnboardingFormStructure` = `{ welcome, steps[], review }`; `slug` unique; `isDefault`;
  `isArchived`). Additive `ClientOnboarding` columns: `formId`, `formSnapshot` (Json — the frozen
  structure the link renders from), `answers` (Json — custom-field answers). **All additive** → safe
  under the no-`--accept-data-loss` build. The 26 existing system columns + `bankAccount` stay.
- **Snapshot on mint** (like Docs copies template.sections): `createOnboardingLink({ formId })`
  freezes the form's structure onto `formSnapshot`, so editing a form never changes links already
  sent. Legacy rows (null snapshot) fall back to the in-code default form → render unchanged.
- **Field registry + system catalog + default form** in `src/lib/onboarding/`:
  `field-types.ts` (type metadata + `validateAnswer`, framework-free so the server imports it),
  `system-fields.ts` (catalog of built-in client-mapped fields + `SYSTEM_TEXT_COLUMNS` write
  allow-list, replacing the old `AUTOSAVABLE_FIELDS`), `default-form.ts` (today's 7 steps verbatim;
  seeded as the default `OnboardingForm` in `bootstrap.ts`, `update: {}` so edits persist across
  boots), `structure.ts` (pure walkers: `fieldsById`, `isFieldVisible` showIf, `isFormStructure`).
  System-field id === its column name, so columns + answers line up.
- **System vs custom:** system fields persist to their column and map into `WorkspaceClient` on
  submit (unchanged mapping). Custom questions live in `ClientOnboarding.answers` (JSON), surface in
  review/PDF, and are summarised into the new client's `notes`. `autosaveOnboarding` routes each
  answer by its snapshot field def; `submitOnboarding` validates the form's *own* required fields
  (not the old fixed 3-column check).
- **Public flow** (`onboarding-flow.tsx`) is now a generic engine over `session.structure` +
  `session.answers`; one `FieldRenderer` (`src/components/onboarding/field-renderer.tsx`, shared with
  the builder preview) renders any field type and keeps the input guards / UK-bank datalist / iOS
  font sizing / bank sub-form. PDF (`onboarding-pdf.ts`) iterates the structure (custom answers too).
- **Builder UI:** new **Settings → Onboarding** tab → `src/components/settings/onboarding/`
  (`forms-tab` list, `form-builder` 3-pane: outline with `@dnd-kit` step+field reorder, field/step
  copy editors, live preview reusing `FieldRenderer`; `add-field-palette` grouped Client-details vs
  Custom-questions). Server `src/server/onboarding-forms.ts` + `/api/onboarding-forms(/[id])(/duplicate)`
  (writes gated by `canManageClients`); hooks `use-onboarding-forms.ts`; fetchers in `lib/api.ts`.
- **Mint picker:** `NewOnboardingLinkModal` (Portal) gained a form `<select>` → passes `formId`.
- **Deferred / notes:** address fields are individual `short_text` (with `config.width:"half"` for
  the grid) rather than a compound `address_group`, and the billing block uses generic per-field
  `showIf` instead of the old bordered box — faithful, not pixel-identical. Verified via `tsc`,
  `eslint`, and `next build` (clean); `prisma db push` (additive) applies on deploy.
## 17. Recent Changes (June 2026) — Docs audit: security, link tracking, builder

A multi-phase pass to make Docs a best-in-class document builder (benchmarked vs Better
Proposals / Qwilr / Figma). **Note:** much of the "Docs rebuild" surface (the public
`/docs/[token]` share view, `DocumentView` tracking, signatures, comments, versions, AI
authoring) already existed before this pass but was undocumented here — §4/§7 now reflect it.

**Phase 0 — security + cleanup**
- **Gated previously-open mutations.** `/api/proposals/bulk` (mass delete/archive/revoke-share),
  `/[id]/archive`, `/timeline`, `/engagement`, `/export` now `assertCan(canManageDocs)` — closes a
  real hole where any authenticated member (incl. a scoped developer) could bulk-delete every
  document. `SHARE_LINK` export additionally requires `canShareDocs`.
- **Fixed the dead client share link.** `/api/proposals/[id]/export` `SHARE_LINK` now mints the
  real `/docs/[token]` via `enableDocumentShare` (was the deprecated `/preview/[id]` "link
  expired" page). Removed the orphaned `export-toolbar.tsx`.
- **Route consolidation.** `/app/docs` is now canonical (list + editor + preview + print).
  `/app/proposals/*` are `redirect()` stubs for old Slack/email deep links. `middleware.ts`
  `MODULE_PATHS` already mapped both. Validator hardening: non-negative discount, 0–100 tax.

**Phase 1 — link tracking + analytics (`src/server/document-analytics.ts`, `visitor-context.ts`)**
- **Capture** — the public page runs a real tracker (`src/app/docs/[token]/view-beacon.tsx`):
  persistent first-party `visitorId` + per-visit `sessionId`, an IntersectionObserver measuring
  **per-section dwell + scroll depth**, total visible time, flushed to `/api/docs/[token]/events`
  on tab-hide/pagehide/15s. Geo (Vercel `x-vercel-ip-*` headers) + device/browser/OS (UA parse)
  captured server-side on `/api/docs/[token]/view`.
- **First-open + conversion** — first open is detected atomically and fires a distinct
  `DOC_FIRST_VIEWED` Slack alert (vs every-view `DOC_VIEWED`). Clients **accept/decline in-page**
  (`/api/docs/[token]/accept`) → status `ACCEPTED`/`DECLINED` + `DOC_ACCEPTED`/`DOC_DECLINED`. An
  editor autosave can't clobber a client's acceptance (guard in `PATCH /api/proposals/[id]`).
- **Read APIs (web + iOS)** — `GET /api/documents/[id]/analytics` (per-doc: visitors, dwell
  heatmap, time-to-open, device/geo, conversion, recent visits) and `GET /api/documents/analytics`
  (cross-doc: funnel, open/win rate, leaderboards; `documentType`/`days`/`from`/`to` params). Both
  mobile-JWT-aware. **Full contract in `docs/api-link-tracking.md`.** Note `/api/documents/analytics`
  is a static segment that takes routing precedence over `/api/documents/[id]`.
- **UI** — editor right-rail **Insights** tab (`document-analytics-panel.tsx`) + cross-doc
  dashboard at **`/app/docs/analytics`** (`docs-analytics-dashboard.tsx`), reachable from an
  Analytics button on the Docs list.

**Phase 2a — builder feel**
- **Markdown rich text** — `src/lib/markdown.tsx` (dependency-free, XSS-safe renderer: headings,
  bold/italic, links with URL-sanitisation, inline code, lists — no `dangerouslySetInnerHTML`) +
  `markdown-field.tsx` (toolbar + ⌘B/⌘I/⌘K). Wired into the free-prose sections (`prose`,
  `introduction`); stores plain markdown, backward-compatible with existing plain text.
- **Split-screen live preview** — the Builder tab renders the client view beside the editor,
  updating live as you type (toggle, on by default on xl). No more separate preview route.

**Shipped since (Phases 2b + 3):**
- **Phase 2b** — editor **undo/redo** (history-aware `updateDraft`, coalesced text edits, ⌘Z/⌘⇧Z
  that don't hijack native field undo; section delete now undoable); bulk actions invalidate the
  query instead of `window.location.reload()`; **in-section drag** (`src/components/proposals/sortable-list.tsx`
  → objectives/list-items/links); an accessible **`<Modal>` primitive** (`src/components/ui/modal.tsx`
  — focus trap, Escape, scroll-lock, ARIA) adopted by the AI draft modal; approval-popover a11y.
- **Phase 3** — **merge variables** (`src/lib/merge-variables.ts`: `{{client_name}}`/`{{total}}`/…
  resolved at render in preview/public/PDF, never persisted; insert menu in the markdown toolbar);
  **content snippet library** (`ContentSnippet` model + `/api/snippets`; save-as-snippet in the
  builder panel, insert from the Add-block palette); **real server-side PDF**
  (`GET /api/proposals/[id]/pdf` — `@sparticuz/chromium` + `puppeteer-core` render the public
  `/docs/[token]?print=1` page; **requires the doc be shared**; `serverExternalPackages` set in
  `next.config.ts`). ⚠️ The PDF route is serverless Chromium — verify with one live click on prod.

**Still pending / optional:** broad adoption of the `<Modal>`/field primitives across the other
hand-rolled dialogs (create-doc modal, cost budget dialog) — mechanical migration. Stripe
pay-in-page was **dropped** per Dan (web-first; accept/decline-in-page already covers conversion).
## 18. Recent Changes (June 2026) — Pulse: shared lite-scan core, decoupled AI, public embed widget

Pulse was re-architected around **one AI-free deterministic core** (`src/server/pulse-lite/run-lite-scan.ts`)
that powers both the internal full scan and a new public embeddable scanner. The deterministic
checks (`runUrlChecks`/`runGithubChecks`/`runExtendedChecks`/`runDeployAgent`/`runBrowserAgent`)
were already AI-free; the AI (`pulse-ai.ts`) only ever ran on top. This work makes that split
explicit and reuses it three ways.

- **Shared core** — `runLiteScan({ inputType, url|githubRepo, includePageSpeed, skipUrlGuard, onChecks })`
  returns `{ checks, techStack, healthScore, browser/deploy/codeInsights, homepageUrl }`, de-duped by
  `checkKey` + stably ordered. It emits **incremental waves** via `onChecks` — implemented by an
  optional `onWave` threaded into `runUrlChecks` (emits core checks before extended) and
  `runExtendedChecks` (emits each of the 19 category modules as it resolves). No AI imports in
  `pulse-lite/*` — keep it that way.
- **SSRF guard** (`pulse-lite/url-guard.ts`) — `assertScannableUrl()`: http/https only, no creds,
  `dns.lookup` + reject private/reserved/loopback/link-local/metadata ranges. **Mandatory on the
  public path**; applied defensively elsewhere. **Rate limit** (`pulse-lite/rate-limit.ts`) —
  Postgres-backed per-IP (8/hr, 30/day) + per-host (12/hr); no Redis.
- **AI decoupled (internal scan)** — `runAnalysis` (`src/server/pulse.ts`) is now **CHECKS → ANALYSING**:
  the deterministic phase persists each wave incrementally and sets `PulseScan.checksCompletedAt`
  (status stays `RUNNING`); AI/discovery/competitor run *after*. Users see the full checks view +
  a "checks complete, AI running" state in ~15–30s instead of waiting ~2–4 min. AI failure still
  leaves a usable checks-only result.
- **Delta SSE** (`/api/pulse/scans/[scanId]/stream`) — streams only *new* checks (by `checkKey`) +
  scalar state per tick instead of re-sending the whole scan every 2s; `complete` triggers one
  authoritative refetch for the heavy AI payload. Client (`usePulseScanStream`) **merges** deltas
  instead of overwriting → far fewer re-renders. Progress bar is now **real** (persisted/expected
  check count), replacing the time-eased fake.
- **Durability** — `GET /api/cron/pulse-reconcile` (CRON_SECRET, registered in `vercel.json`,
  **daily** — bump to hourly on Pro): scans stuck `RUNNING` past 6 min are *salvaged* to COMPLETED
  if `checksCompletedAt` is set (checks usable), else FAILED. Also **prunes expired** `PulseLiteScan`
  rows (privacy/hygiene).
- **Public report cached** — `/report/[token]` dropped `force-dynamic` for `unstable_cache`
  (tag `pulse-report-<token>`, 5-min TTL); the share/unshare route `revalidateTag`s rotated/removed
  tokens so old links stop resolving. Added `robots: noindex`.
- **Public embed widget** — standalone `/embed/pulse` (client widget, **score free, email-gates the
  detail**), iframe-able anywhere (`frame-ancestors *` for `/embed/*` in `next.config.ts`),
  postMessage auto-resize, snippet at `public/embed/pulse/embed.js`. Public no-auth endpoints
  `POST/GET /api/public/pulse/scan[/id]` + `/unlock` (added `/api/public/pulse` to
  `PUBLIC_API_PATHS`; CORS `*` already applies). `runPublicLiteScan` (`pulse-lite/public-scan.ts`)
  runs with `includePageSpeed:false` and a single throttled JSON flusher (no write races).
- **Foundry funnel** — captured email → `PulseLead` (notifies admins via `src/server/email.ts`).
  `leads-admin.ts` (`importLeadToFoundry`) one-click turns a lead into a full workspace `PulseScan`
  (→ proposal via `generateProposalFromScan`); surfaced by `PulseLeadsPanel` on `/app/pulse`.
  `leads.ts` (public, dependency-light) is kept separate from `leads-admin.ts` (imports the AI
  pipeline) so the public unlock route doesn't bundle `pulse-ai`. Live demo embedded on
  `/pulse-overview`.

**Data model (additive, applies via the build's `prisma db push`):** `PulseScan.checksCompletedAt`;
new isolated `PulseLiteScan` (checks stored inline as JSON; `expiresAt` TTL) + `PulseLead`. Anonymous
public scans never touch the workspace `PulseScan` table.

**Deferred / caveats:** the deep flattening of `runUrlChecks`'s ~9 sequential probe rounds was NOT
done (risky in a 4000-line file; the 19 extended modules + top-level agents already parallelise the
bulk). The embed page inherits the global `SessionProvider` (harmless; a lighter provider tree would
drop an unused `/api/auth/session` call from the iframe). Reconciler is daily on Hobby. Optional env
`GOOGLE_PSI_API_KEY` improves PageSpeed quota (internal scans only; public path skips PSI).

## 19. Recent Changes (June 2026) — Portal: dev count + gated client cost & working days

Portal client cards (`src/components/clients/client-management.tsx`) now surface three figures, all
computed server-side and batched across the whole client set (no N+1) in the new
**`src/server/client-metrics.ts`**:

- **`{{x}} Devs`** (everyone) — count of the client's **active devs** = distinct candidates with an
  open `Placement` (endDate null) via `computeClientDevCounts`. Matches the client detail's "DEVS"
  tile and Code's "current clients" (was a `ClientAssignment.groupBy`, which undercounted vs the detail).
- **Monthly cost** + **working days** (sensitive) — `computeClientFinancials` → `{ monthlyCost, workingDays }`:
  - **Cost path (no schema change):** active `Placement → Candidate → RateCardPerson` rate, normalised
    to monthly via `normalizeToMonthly` (`src/server/rate-card.ts`) — the **same rate Code shows**
    (mirrors `rateCardFields`: pro-bono / archived rate-card / unlinked → no rate; pro-bono devs are free
    and excluded entirely). Distinct candidate per client. Billable devs with no resolvable rate are
    `unpricedDevs` — **excluded from the sum**, surfaced as "(n unpriced)". Shape
    `ClientMonthlyCost { amount, currency, pricedDevs, unpricedDevs }` in `src/types/client.ts`.
    Sourcing from placements (not `ClientAssignment → User.email`) removed the fragile email join that
    left cards reading "rates n/a"; link a dev's rate in Code (Rate Card) and it flows straight through.
  - **Working days** (label `{{x}} days`): inclusive business days (Mon–Fri, UTC; holidays NOT
    excluded) from the project's **Gantt start** — the earliest **dated** `FeatureBlock.startDate` —
    to today (`businessDaysBetween`). **Null → hidden when the client has no dated feature block**
    (no Gantt timeline yet); no fallback to tasks/`createdAt`.

**Permission gate — `clients.viewFinancials`** (new, **default-OFF**, `category: "field"`) in
`PERMISSION_CATALOG` (`src/types/auth.ts`), alongside `docs.viewCosts` / `code.viewRates`. Super Admins
bypass; it is **not** in `DEFAULT_ROLE_PERMISSIONS`, so it stays off for every role until toggled
**per person** in **Settings → Team** (e.g. Syed). Helpers: `canViewClientFinancials(user)`
(`src/server/auth/effective-user.ts`) server-side; `usePermissions().canViewClientFinancials`
(`src/hooks/use-permissions.ts`) client-side.

**Gated server-side, not merely hidden:** `GET /api/clients` (`src/app/api/clients/route.ts`) sets
`includeFinancials = canViewClientFinancials(user)` and attaches `monthlyCost`/`workingDays` to the
client DTO **only when true** — an unauthorised viewer never receives the figures in the payload. The
dev count is always attached. No schema change, no new env. The card renders the strip as mono-caps
`widget-data-label`s per DESIGN.md (`{{x}} Devs · cost · {{x}} days` readout — never plain sans).

## 20. Recent Changes (June 2026) — Portal: per-client retainer (used / allowance)

Wires the **retainer** onto the Portal client cards (closes the §13.7 "deferred" item). Two manual,
gated figures per client:

- **Schema:** `retainerDays` (monthly allowance, pre-existing `Int?`) + new additive **`retainerDaysUsed`**
  (`Int?`, days used this month — manually maintained, **no auto monthly reset yet**). Both validated
  `0–31` in `clientContactFields` (`src/server/validators.ts`). Additive → applies via the build's
  `prisma db push`.
- **Card readout** (`src/components/clients/client-management.tsx`): when a retainer is set, the days
  slot shows **`{used ?? 0} / {allowance} days`** (mono-caps `widget-data-label`), **replacing** the
  plain working-days figure; clients without a retainer keep showing working-days. Gated behind
  `clients.viewFinancials` (Super Admins + toggle) and attached server-side only for authorised viewers
  in `listDerivedClients` — same pattern as cost/working-days.
- **Editable** on the Edit-client modal (`client-detail.tsx`): "Retainer (days/mo)" + "Used this month"
  number inputs. Persistence flows the existing path — `ClientContactInput` → `buildContactData`
  (numeric keys passed through untrimmed; `data` is a mapped type so retainer keys are `number|null`,
  string fields stay `string|null`) → `updateClientRecord`. Surfaced on the detail via
  `contactFieldsFromRecord` (so `ClientDetailFields` carries both).
- **Deferred:** auto monthly reset / per-month history, and a real "days used" source (manual for now).

## 21. Recent Changes (July 2026) — Docs → Google Drive backup (native Google Docs)

Every document in Docs is now auto-mirrored to Google Drive as a **native, editable Google Doc**,
so there's an off-platform copy that's searchable/editable in Drive (not just an opaque PDF).

- **Google Doc conversion (no new deps).** `src/server/document-to-html.ts` (`renderDocumentToHtml`)
  turns a `serializeProposal()` payload into clean semantic HTML (headings, paragraphs, lists,
  tables — cost line items as a table, timeline phases as headed lists, assets/links/CTAs as
  trailing sections). `src/server/google-drive-backup.ts` uploads it via `drive.files.create` with
  `mimeType: "application/vnd.google-apps.document"` (Drive imports+converts HTML → a Doc). It is
  **NOT** the styled `ProposalPreview`/PDF render — plain HTML converts far cleaner and works for
  drafts (no share/token needed). XSS-safe: text is escaped and only the same Markdown subset as
  `src/lib/markdown.tsx` is expanded (shares its `safeUrl`).
- **Idempotent.** Each doc maps to one Google Doc via new **`Document.gdriveFileId`**; presence →
  update in place (`files.update` with fresh HTML media), absence → create. **`Document.gdriveBackedUpAt`**
  stamps the last sync; a doc is re-synced when `updatedAt > gdriveBackedUpAt`. A hand-deleted Doc
  (404) is transparently recreated.
- **Central destination.** All backups land in one **"Foundry Docs Backup"** Drive folder in the
  backup account's Drive (the workspace owner — `owner@gitwork.io`/`dan@gitwork.co.uk` — else the
  first connected member). Folder id cached on **`Workspace.docsBackupFolderId`**; created on first
  run. `resolveBackupAuth()` picks the account via `googleClientForRefreshToken` (same helper Scribe's
  cron uses).
- **Triggers.** Daily cron **`GET /api/cron/docs-gdrive-backup`** (registered in `vercel.json` at
  `0 2 * * *`; **daily** — Hobby-plan limit; `CRON_SECRET`-guarded; `maxDuration 60`) backs up
  never-synced docs first (oldest first, cap 15/run so a backlog drains) then docs changed since
  their last backup. Plus a **best-effort on-share hook** — `backupDocumentBestEffort()` fired
  fire-and-forget from `POST /api/documents/[id]/share` so a *sent* doc lands in Drive immediately;
  swallows errors (cron is the safety net).
- **Master switch — `Workspace.docsBackupEnabled`** (new, **default-OFF**). Both the cron and the
  on-share hook no-op until it's turned on. No Settings UI yet — flip the flag directly to enable
  (the "minimal Settings surface" from the plan was deferred).
- **New Drive write scope.** `src/auth.ts` now also requests **`drive.file`** (least-privilege — the
  app only ever touches files it created: our folder + the docs in it). **`SESSION_VERSION` bumped
  4 → 5** in `src/auth.config.ts` to force re-consent so the new scope is granted (existing refresh
  tokens only carry the read scopes). The backup account must sign out/in once after deploy.
- **Schema (additive → applies via the build's `prisma db push`):** `Document.gdriveFileId`,
  `Document.gdriveBackedUpAt`, `Workspace.docsBackupEnabled`, `Workspace.docsBackupFolderId`.
- **Deferred / caveats:** no Settings UI toggle or "backup account" picker yet (owner-by-default);
  Google Doc conversion simplifies styling (no cream branding — editability/searchability over
  pixel-fidelity; a PDF-snapshot path could be added alongside via `/api/proposals/[id]/pdf`);
  backups live in the backup account's Drive (share the folder with the `gitwork.co.uk` domain if
  the whole team should see them). Cron is daily on Hobby.

## 22. Recent Changes (July 2026) — "On Your Desk" (persistent internal drawer)

A Twilio-Workbench-style pull-up drawer docked at the bottom of the whole `/app` shell
(`DeskDrawer` mounted once in `src/components/app-shell.tsx`), for **internal Gitwork users
only** (not clients). **Pure aggregator — no live AI**: it only reads per-current-user data other
modules already own. Inspired by Dia's daily brief; DESIGN.md-first with editorial liberties
(serif-italic section rails, a hand-lettered `Caveat` "stamp" CTA, mono date/time rails) kept on
brand (blue, never Dia's yellow).

- **Interaction** — collapsed dock shows a mono summary (`N OVERDUE · N DOING · …`); the **grab
  handle** is the click toggle (no chevrons; mobile keeps an ✕). Desktop expands to an inline
  bottom panel; mobile to a full-height `<Modal>` sheet. Open state + last tab persist to
  `localStorage` (`gitwork.desk.v1`). Panel uses warm `--surface-canvas`; z-40 (below modals).
- **Tabs** (`src/components/desk/`): **TODAY** (masthead + standup + focus + next meeting +, for
  financial viewers, a client cash-flow row), **TASKS** (overdue/doing/up-next/done-today),
  **MEETINGS** (today's calendar + my Scribe action items), **INBOX** (Gmail + Slack). Long lists
  are capped with a `RevealList` "Show N more". Editorial layout via `EditorialRow` + `Stamp` in
  `desk-shared.tsx`.
- **Role-aware** — standup (AM/PM) shows only for devs/staff (`!isAdminOrAbove`), never admins/
  super-admins (fixes false "standup pending"). The **cash-flow** row (per-client monthly dev cost
  from `useClientList().monthlyCost`) shows only when `canViewClientFinancials` (Super Admin +
  `clients.viewFinancials` toggle, e.g. Harry). Slack/tasks are scoped exactly like the task board.
- **Reuses** `useMyDay` / `useTaskAttention({mine:true})` / `useClientList` / `getCalendarEvents` /
  `getGmailMessages` / `<Modal>` / `requireAuthedUser`. Hooks in `src/hooks/use-desk.ts`.
- **Net-new backend (2 endpoints, no schema change, no cron, no OAuth re-consent):**
  - `getMyActionItems(user)` in `src/server/meetings.ts` → `GET /api/desk/action-items` — open
    `MeetingActionItem`s where the user attended the meeting (email in `Meeting.attendees`) or the
    item is linked to a task assigned to them.
  - `getMyDeskSlack(user)` in **`src/server/desk.ts`** → `GET /api/desk/slack` — merges recent
    `conversations.history` across the caller's scoped client channels (reuses the workspace bot
    token + the same read as `/api/clients/[slug]/slack-activity`, **minus the AI summary**). No new
    Slack scopes, **no Slack↔Foundry user mapping** — it surfaces channel activity, not @mentions/DMs.
- **Deferred:** true Slack @mentions/DMs (needs user mapping + scopes); revenue/margin cash flow
  (only dev *cost* is wired today); an optional cached morning digest if narrative is ever wanted.

## 23. Recent Changes (July 2026) — Migrated off Vercel/Neon to a Fasthosts VPS

Production was moved from **Vercel** (app) + **Neon** (database) to a **single Fasthosts Cloud VPS**
running **Docker Compose**. **No application code changed** — it was an infrastructure + data move.
This supersedes the Vercel/Neon assumptions throughout §2, §3, §5.

- **Host & DNS** — VPS at `194.164.127.222`. `foundry.gitwork.co.uk` resolves via an **A record →
  `194.164.127.222`** (was a Vercel CNAME `…vercel-dns-017.com`), managed in **Squarespace** DNS
  (`gitwork.co.uk` is Squarespace-managed). **Only the `foundry` host was changed** — root `@`
  (ALIAS → `site-dns.bolt.host`), `www`, email (SendGrid CNAMEs, SPF/DKIM/DMARC TXT), and `docs`
  (→ betterproposals) were left untouched. HTTPS via an auto-renewing **Let's Encrypt** cert.
- **Runtime** — Docker Compose: the Next.js app container + a self-hosted **PostgreSQL** container
  (compose service name **`db`** — hence `DATABASE_URL=postgresql://foundry:…@db:5432/foundry?sslmode=disable`;
  SSL disabled is fine on the compose-internal network), behind a reverse proxy terminating TLS.
- **pgvector is required** — the Postgres image must ship the `vector` extension. `bootstrap.ts`
  runs `CREATE EXTENSION IF NOT EXISTS vector` + the `SupportConversation.embedding vector(1536)`
  column + HNSW index on boot (Care semantic search). Without it, boot/Care search fail.
- **Data** — migrated by `pg_dump`/`pg_restore` from Neon into the VPS Postgres. `DATABASE_URL` and
  `DIRECT_URL` both point at the local `db` container (single long-running server → no PgBouncer).
- **Deploy — auto via GitHub Actions.** `.github/workflows/deploy.yml` runs on push to `main`:
  builds the image → pushes to **GHCR** (`ghcr.io/git-dann/docs-by-gitwork:latest` + `:sha`) → SSHes
  to the VPS (`/opt/apps/foundry`, secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`) and runs
  `docker compose pull app` → `docker compose up -d db` → `prisma db push` (no `--accept-data-loss`)
  → `docker compose up -d --no-deps app` → prune. ~6 min end-to-end. **Vercel is still Git-connected
  and builds every push in parallel, but it's vestigial** — DNS points at the VPS, so those Vercel
  deploys reach nothing live. Disconnect Vercel's Git integration to stop the phantom builds.
- **Secrets / env** — production secrets live in the **VPS `.env`** (loaded by Compose), not Vercel.
  All Vercel "Sensitive" vars were **write-only and could not be exported** (`vercel env pull`
  returns them blank), so each was re-sourced: Google OAuth from Cloud Console (two web clients —
  "Foundry Login" → `AUTH_GOOGLE_*`, "Foundry Care" → `GOOGLE_CLIENT_*`; iOS server client →
  `GOOGLE_IOS_SERVER_CLIENT_ID`), APNs `.p8` from the Apple key, `ENCRYPTION_KEY` recovered from a
  local worktree `.env.local` (confirmed matching prod — **must** match or encrypted onboarding bank
  data is unreadable), Anthropic key regenerated. Live values live only in the VPS `.env`. Docs:
  `docs/neon-to-fasthosts-migration.md` (DB runbook) + `docs/fasthosts-secrets-recovery.md`.
- **Now self-managed (Vercel/Neon did these before):**
  - **Crons** — Vercel cron jobs do NOT run on the VPS. `/api/cron/*` (`meet-transcripts`,
    `pulse-reconcile`, `support-sync`, `docs-gdrive-backup`) must be triggered by host cron/systemd
    timers hitting them with the `CRON_SECRET` header.
  - **DB backups** — schedule `pg_dump` off-box (Neon auto-backed-up before).
  - **Cert renewal** — ensure the Let's Encrypt renewer is in place (~90-day cert).
- **Rollback** — **Vercel + Neon are kept live, read-only**, as a fallback until the VPS is proven,
  then decommissioned. To roll back: repoint the `foundry` A record to the Vercel CNAME and switch
  `DATABASE_URL`/`DIRECT_URL` back to the Neon URLs.
- **Post-cutover follow-ups:** rotate the DB password (the initial one was weak and passed through
  Slack) + other Slack-exposed secrets; verify Google login (redirect URI added for the domain),
  Care semantic search (pgvector canary), AI (`ANTHROPIC_ADMIN_KEY` or the workspace DB key), and an
  onboarding bank-detail decrypt.

## 26. Recent Changes (July 2026) — Study demoted from a top-level module to an admin-only Pulse tool

**Study** (AI user research — multi-agent persona interviews) was a first-class module: its own
sidebar item, its own permission product, an (unused) HQ widget, and a `/context` module-map row.
It's now an **optional, admin-only tool inside Pulse** — "one you *could* reach for", not automatic.
**No routes/files were moved** — the change is UX re-parenting + permission tightening + a scan↔study
link. Everything Study did still works.

- **Removed from the top level:** deleted the Study **sidebar item** (`app-shell.tsx`), the **dead**
  `src/components/dashboard/study-widget.tsx` (imported nowhere), and reframed the `/context`
  module-map row under Pulse. `FOUNDRY_MODULE_KEYS` still lists `"study"` — that's the **demo/mock**
  workspace-model typing, not nav/permissions, so it was left untouched.
- **Permissions — admin/super-admin only:** the old `study` **module** id + `study.manage` **action**
  were removed and replaced with a single **admin-only `feature`** perm `study` in `PERMISSION_CATALOG`
  (`src/types/auth.ts`) — the studio pattern (default-off, `category: "feature"` so STAFF doesn't
  auto-inherit it; ADMIN holds all ids, SUPER_ADMIN bypasses). The stray `"study"` id was removed from
  the view-as STAFF preset (`src/lib/view-as.ts`). `canManageStudy()` (server `effective-user.ts` +
  client `use-permissions.ts`) now checks **`study`** — view and manage collapse to one admin-only
  gate. Middleware `MODULE_PATHS` gates `/app/study` on **`study`**. **Result: only Admin + Super Admin
  see or use Study.** Grantable to Staff/Developers later via the Settings → Team matrix.
- **Gated at every layer** (not just hidden): middleware blocks the `/app/study` pages; the
  `PulseStudiesPanel` + the scan `AgentPanel` "Research study" slot render only when `canManageStudy`
  (and `useStudyList(enabled)` skips the fetch for non-admins); and **every `/api/study/studies*`
  route** asserts `canManageStudy` (GET/POST/PATCH/DELETE + plan + run + stream — the SSE route returns
  a clean 403). Only `/api/study/personas` (static built-in persona catalog, no workspace data) is open.
- **Surfaced inside Pulse (2 entry points, admin-only):** a new **`PulseStudiesPanel`**
  (`src/components/pulse/pulse-studies-panel.tsx`) on the Pulse landing page (`/app/pulse`) lists
  studies + a "New research study" button; and a **"Research study" slot** in the scan-results
  **AgentPanel** (`pulse-scan-results.tsx`) — "Start research study" → `/app/study/new?scanId=…`
  when unlinked, "View study" when linked.
- **Scan ↔ Study link (additive schema → applies via the build's `prisma db push`):**
  `Study.linkedScanId` (+ `@@index`) and `PulseScan.linkedStudyId`, both nullable loose ids (no FK,
  matching the cross-module convention). `createStudy()` validates the scan is in-workspace, persists
  the link, and **mirrors `linkedStudyId` back onto the scan**. `serializePulseScan` + `PulseScanRecord`
  carry `linkedStudyId`; `StudyRecord` carries `linkedScanId`. The wizard (`study-wizard.tsx`) reads
  `?scanId=` (mirrors the existing `?clientId=`), **pre-fills** the brief from the scan's `projectName`
  + top `criticalGaps`/`buildOpportunities` (soft defaults, never clobbers edits), and passes
  `linkedScanId` through the create hook/route.
- **Deferred:** Study code/routes/API were deliberately **not** relocated under `/app/pulse/*` (kept
  at `/app/study`, no redirect stubs); no back-link chip rendered *on* the study detail page yet
  (the link is stored + surfaced from the Pulse side). Verified via `tsc` + `eslint`.

## 27. Recent Changes (July 2026) — "The Monday Brief" (daily editorial digest, peeks from the Desk)

A faithful rebuild of **Dia's morning brief**, wrapped in `DESIGN.md` and wired to **live data**.
It's a **pure aggregator view** (like §22 On Your Desk — no live AI, no new persistence): it maps
data other modules already own into one narrative shape. Surfaced as a **peek** at the top of the
Desk **TODAY** tab that opens a **full-page overlay**; dismissable from **both** levels.

- **Peek** — `src/components/brief/brief-peek.tsx`, mounted at the top of `desk-today.tsx`. A framed
  card: painting thumbnail + mono eyebrow (`MON 13 JUL // THE BRIEF`) + DM Serif title + a live
  one-line readout (overdue / in-flight / due-soon, from `useTaskAttention`). Click → full page. Its
  **✕ dismisses it for the day** (`localStorage` `gitwork.brief.peek-dismissed.<date>`; returns
  tomorrow). Cheap — only light reads run until the brief is opened.
- **Full page** — `src/components/brief/morning-brief.tsx`. A `z-[200]` overlay, dismissable via **✕
  (fixed top-right), Esc**, or the peek. Sections mirror Dia but on brand: **painting hero** (kept,
  approved) with `The {Weekday} Brief` in **DM Serif Display**, accent in **Gitwork Blue (never
  yellow)**, vertical **JetBrains Mono** date/time rails; **Push your work forward** (blue scalloped
  `Stamp` CTA → board); **Top to-dos** (checkable, `localStorage` ticks keyed by date + todo id, with
  an **all-done card + blue confetti** — WebAudio chime dropped on purpose); **New updates** (numbered
  `01/02/03`); **Your day** (two-column schedule + hover/click detail panel, a "Join" stamp for Meet
  links). Reuses the Desk's `EditorialRow` + `Stamp` primitives so it reads as part of the platform.
- **Data** — `useBrief(enabled)` (`src/hooks/use-brief.ts`) composes `useMyDay` + `useTaskAttention`
  (push-forward + to-dos), `useDeskCalendar` (schedule), `useDeskSlack` → `useDeskActionItems`
  fallback (updates). The Google/Slack reads are **gated on `enabled`** so opening the brief is what
  triggers them, not mounting the peek. `buildBrief` (`src/lib/brief/build-brief.ts`) is a **pure**
  DTO→`Brief` mapper (`src/types/brief.ts`); `dia-report://` chat deep-links became board/Meet links
  (Foundry has no generic chat surface).
- **Paintings** — `src/lib/brief/paintings.ts`: curated public-domain works (one per day,
  deterministic) hotlinked via **direct `upload.wikimedia.org` thumbnail URLs** (the earlier
  `Special:FilePath` form 404'd on any filename mismatch → always fell back). **Blue→navy gradient
  fallback** if an image ever fails. To pin exact art, drop files in `public/brief/` and point `src`
  at `/brief/<name>.jpg`.
- **Hero contrast + logos (Jul 14 pass).** The painting hero carries a **soft dark scrim** (even
  darken + centre vignette) so the **white** title (with a Gitwork-Blue accent bar) reads on any
  artwork. Real **source brand marks** (`src/components/brief/source-icons.tsx` — Slack/Gmail/Google
  Calendar/Drive + Tasks/Scribe glyphs) sit beside each update and inline in the footer credit
  ("using your [Slack] Slack, [cal] Google Calendar and [tasks] Tasks"), mirroring Dia. **Updates are
  collated** by client (grouped, de-noised — drops "thanks"/"on it" acks — leading with client +
  message count + the most substantive recent line) rather than a raw last-N dump (`collateSlack` in
  `build-brief.ts`).
- **Timezone globe (Jul 14).** `src/components/desk/desk-globe.tsx` replaced the Desk's flat
  `TeamOverlap` bars in "Around the team": a **dependency-free SVG orthographic globe** — graticule,
  **real continents** (Natural Earth 110m, public-domain, simplified to `src/lib/desk/world-land.ts`
  ~28KB) rendered timezoneglobe.com-style as a **dot-matrix stipple + crisp coastline outlines** (the
  **live day/night terminator** is encoded into dot brightness, from the computed sub-solar point),
  plus a **dot per city** with a local-time legend. Land/coast/graticule paint in **`currentColor`**
  so it reads on cream **and** navy (light/dark) with no branching. Centred on the viewer's home hub,
  **drag to spin**, **Add city** from a global preset set (`localStorage` `gitwork.desk.globe.cities.v1`).
  Keeps the "your 9am is their 1pm" readout + overlap window. `TeamOverlap` stays exported in
  `desk-time.tsx` (now unused). All pure `Intl`/trig — no globe lib.
- **Editorial craft pass (Jul 14).** Borrowed the blueprint/drafting language (oryzo.ai / Lusion) on
  Foundry's terms via `src/components/brief/brief-ornaments.tsx`: an **oryzo-style hero** — a one-line
  masthead just above the art card (`The Foundry Brief` eyebrow left + `N° {day-of-year} · {day}`
  right), vertical date/time rails centred on the painting, and a **cutting-mat ruler** (0–100 ticks)
  along the bottom edge, **drafting corner-ticks** + a mono kicker + serif title
  on the "Push your work forward" card (a subtle brand→canvas gradient panel, **not** a flat colour
  block), **mono section index labels** (`Focus` / `To-do` / `Signals` / `Agenda` — via a new optional
  `index` prop on the shared `EditorialRow`), a **slow painting zoom** + overlay fade-in (reduced-motion
  safe), and a Dia-style **footer**: "Made for you by [mark] Foundry using your [Slack]…[cal]…. **With
  love from** [G][I][T][W][O][R][K]" — circle-letter seal that waves on hover.
- **Weather instrument (Jul 14).** A **one-line** weather readout (`WeatherLine` in `morning-brief.tsx`)
  in the hero — below the masthead, above the art card, aligned to the art width: a small
  **dependency-free procedural SVG** glyph (`src/components/brief/weather-scene.tsx` — amber sun rays,
  drifting clouds, rain/snow drops, fog, lightning; reduced-motion safe, token-based for light/dark) +
  `{temp}° {condition} · {city}` and a mono `H/L · wind · humidity`. Data from **Open-Meteo**
  (`src/hooks/use-weather.ts` — free, no API key, no attribution, CORS; home hub by timezone →
  Manchester/Islamabad). Ambient: renders nothing until data arrives, and a failed fetch just drops
  it. Deliberately **not** the three.js procedural-weather approach (~600KB + WebGL, off-ethos).
  Verified live via `/demo/dev`.
- **No schema change, no new env, no cron.** Ticks + peek-dismissal are `localStorage` only. Verified
  via `tsc` + `eslint` (app is auth-gated with no local DB — no browser verification). **Deferred:**
  no re-open entry point once dismissed (returns next day); wiring to a server-composed brief; an
  optional dedicated route.

## 28. Recent Changes (July 2026) — The Curator (weekly library-maintenance agent)

A native background maintenance agent (inspired by Hermes' Curator) that keeps two libraries
healthy: the **Starters** library and the **Pulse-check** catalogue. Runs **weekly** on the VPS
job/cron spine. **Autonomy = deterministic-auto + LLM-proposes:** safe reversible transitions apply
automatically; everything the LLM suggests is a proposal a Super-Admin approves. **Never deletes.**

- **Engine** — `src/server/curator/`: `starters-pass.ts` (deterministic Starter lifecycle
  `ACTIVE→STALE→ARCHIVED` by inactivity — pure `decideStarterTransition` + DB apply; built-ins/pinned
  exempt, never fights `seedBuiltInStarters`), `checks-pass.ts` (aggregates `PulseScanCheck` rows over
  a 180-day window into `PulseCheckStat`; pure `classifyCheck` tags `dead`/`always_pass`/`noisy` — a
  SKIP-only check is legitimately filtered, not dead), `consolidate.ts` (**opt-in** LLM pass), `run.ts`
  (orchestrator), `apply.ts` (approve/dismiss proposals via existing `updateStarter`/`saveCheckConfig`),
  `restore.ts` (reverse a run's transitions — DB-native rollback), `queries.ts` (status/runs/config +
  `getCheckStatMap`), `config.ts`/`types.ts`.
- **AI cost discipline** — deterministic passes are free and always run; the LLM is only the
  consolidation pass, which **defaults OFF**, is **skipped when there's nothing to review** (£0 on a
  quiet library), and when it runs is **one batched `tier:"light"` (Haiku) call** with the stable
  framing in the cached system prompt + the whole call wrapped in `AiResponseCache`
  (`getCachedAiResponse`) keyed on the candidate-set hash — an unchanged library re-uses cached
  proposals for free. Output is validated against the real candidate set (hallucinated targets dropped).
- **Telemetry hook** — `recordStarterUsage()` (the single choke point, called from download / MCP
  `prompts/get` / scan-adopt) now also stamps `Starter.lastUsedAt` and revives `STALE→ACTIVE`.
- **Schema (additive → applies via the guarded `prisma db push`):** `Starter.lastUsedAt/pinned/
  curatorState` (+ enum `StarterCuratorState`), new `PulseCheckStat` (per-check rolling aggregate,
  refreshed by the curator — NOT on the scan hot path) + `CuratorRun` (run report: stats/transitions/
  proposals JSON), `Workspace.curatorConfig` (`{enabled, staleAfterDays 30, archiveAfterDays 90,
  consolidate false, intervalDays 7}`). `curatorState=ARCHIVED` also flips the pre-existing `isArchived`
  so the existing library-list filter keeps working unchanged.
- **Job + cron** — `JobType "CURATOR_RUN"` (`src/server/jobs/types.ts`+`handlers.ts`); new weekly
  `GET /api/cron/curator` (`0 1 * * 1`; enqueues a deduped `CURATOR_RUN` per due+enabled workspace, the
  `jobs` worker drains it — both wired in `docs/vps-crons.md`). Manual "Run now"/"Dry run" execute
  **inline** via `POST /api/curator/runs` (no serverless cap on the VPS).
- **API** (`src/app/api/curator/*`, all `canManageStarters` = Super-Admin, except `check-stats` which
  is admin-or-above to feed the Checks panel): `status`, `runs` (GET list + POST run), `config` (PATCH),
  `proposals` (POST apply/dismiss), `restore` (POST), `check-stats` (GET).
- **UI** — Super-Admin **Settings → Curator** tab (`src/components/settings/curator/curator-panel.tsx`,
  hook `src/hooks/use-curator.ts`): status + Run-now/Dry-run/Consolidate, proposals with Apply/Dismiss,
  LRU starters, config knobs, run history with Restore. Plus telemetry surfaced where each subject
  lives — a `STALE` badge in `StarterList` and a dead/always-pass/noisy **signal chip** in the Settings
  → Checks panel (`useCheckStats`).
- **Verified:** `tsc` + `eslint` clean; `npm test` (104 tests, incl. the checks-registry reconcile
  guard + 18 new curator unit tests for the pure lifecycle/classifier/config fns). App is auth-gated
  with no local DB → **post-deploy**: Settings → Curator → Dry run (nothing mutated), Run now, apply a
  proposal, Restore; hit `GET /api/cron/curator` with `CRON_SECRET`. **Deferred:** idle-gate (interval
  only), one-click starter *consolidation* (advisory — merge manually), auto-tar backups (transitions
  are reversible via Restore).
