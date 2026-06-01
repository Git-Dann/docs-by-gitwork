# Foundry by Gitwork — Claude Code Guide

> **New session?** Read this file top-to-bottom before doing anything. It has everything
> needed to pick up the project without re-exploring the codebase.

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

| Item | Value |
|---|---|
| GitHub repo | `Git-Dann/docs-by-gitwork` |
| Production branch | `main` — Vercel auto-deploys on every push |
| Merge policy | **Squash-merge only** · merge & rebase-merge disabled · branches auto-delete on merge |
| Production URL | `foundry.gitwork.co.uk` |
| Vercel team | `dans-projects-7462374f` |
| Vercel project ID | `prj_u7FhnIWLk1xj5pHtAaApEnshLZfS` |
| Vercel project name | `foundry-by-gitwork` |
| Also aliases | `foundry-by-gitwork.vercel.app`, `docs-by-gitwork.vercel.app` |
| AI context page | `foundry.gitwork.co.uk/context` (noindex, not in nav) |

### Branch, merge & deploy workflow

**`main` is the production branch — every push auto-deploys to production.** The goal is that
**one merge = one clear, readable production deploy.** GitHub is configured to enforce this:

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

**Build safety:** `vercel.json` runs `prisma db push` **without** `--accept-data-loss` on every
build. Additive schema changes apply automatically; **destructive** changes (dropped
columns/data) are skipped rather than applied — run those manually against Neon when intended.
Never re-add `--accept-data-loss`: it let any preview branch silently mutate the shared
production database.

---

## 3. Environment Variables

Set in Vercel project settings. For local dev, create `.env.local`:

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

---

## 4. Module Map

The sidebar uses different labels from the URL routes — mapping below:

| Sidebar label | Route | Server module | Description |
|---|---|---|---|
| **Foundry HQ** | `/app` | — | Dashboard overview |
| **Pulse** | `/app/pulse` | `src/server/pulse*.ts` + `pulse-agents/` | AI project validation — 150+ automated checks, gap analysis, GitHub fix-agent, continuous monitors |
| **Code** | `/app/codeclear` | `src/server/codeclear*.ts` | Developer hiring pipeline — GitHub analysis, scoring, candidate management |
| **Docs** | `/app/proposals` | `src/server/proposals.ts` | Proposal builder — sections, costing, timeline, PDF/export |
| **Portal** | `/app/clients` | `src/server/clients.ts` | Client management and detail pages |
| **Care** | `/app/support` | `src/server/support.ts` | Client support ops — conversations, tickets, workflow rules, audit log |
| **Study** | `/app/study` | `src/server/study*.ts` + `study-agents/` | AI-powered user research — multi-agent persona interviews, synthesis, reports |
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
| Database | Neon PostgreSQL · Prisma ORM (pooled + direct URL) |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) + OpenAI-compatible SDK for multi-provider |
| Data fetching | TanStack React Query v5 — hooks in `src/hooks/` |
| Validation | Zod — all schemas in `src/server/validators.ts` |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| PDF | pdf-lib |
| Deploy | Vercel (Next.js preset, buildCommand in vercel.json) |

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
| Proof | `ProofDocument` |
| Clients | `WorkspaceClient`, `ActivityLog` |
| CodeClear | `Candidate`, `Placement`, `Note`, `GitHubAnalysisRun`, `CodeClearScore`, `CodeClearScoreDraft` |
| Pulse | `PulseScan`, `PulseScanCheck`, `PulseMonitor` |
| Study | `Study`, `StudyResearchPlan`, `StudyPlanQuestion`, `StudySession`, `StudyReport` |
| Care/Support | `SupportClient`, `SupportClientMembership`, `SupportConversation`, `SupportMessage`, `SupportTicket`, `SupportWorkflowRule`, `SupportAuditLog`, `DraftSupportAction`, `AccountConnection`, `ChannelToken` |
| Backstage | `LeaveRequest`, `Expense` (plus `WorkspaceMember.countryCode/annualLeaveDays`, `Workspace.defaultAnnualLeaveDays/expenseCategories`) |
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
