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

# ClickUp — ONLY for the one-time migration (POST /api/dev/import-clickup).
# A ClickUp personal token (Settings → Apps → API Token, starts "pk_").
# Safe to remove from the env after the import is done.
CLICKUP_TOKEN=""
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
| **Portal** | `/app/clients` | `src/server/clients.ts` · `meetings.ts` | Client management + detail pages, incl. **Scribe** AI meeting notes per-client (no sidebar item — see §14) |
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

4. **Task tracker shipped inside Portal** — a native, ClickUp-style tracker (no ClickUp integration):
   - **Board + list** per client at `/app/portal` (Clients | Tasks tab). Kanban columns Backlog · To Do · Doing · In Review · Done (`@dnd-kit` drag). Compact `TasksSummaryCard` on each client detail page (`16 // TASKS`) deep-links to the filtered board. Server: `src/server/tasks.ts`, hook `src/hooks/use-tasks.ts`, components `src/components/tasks/`, types `src/types/tasks.ts`.
   - **Notes** — append-only `TaskComment` thread in the task detail drawer.
   - **Daily Slack standups** — `src/server/tasks-standup.ts`. Devs push an **AM "Doing"** (+ Monday "This week", pre-filled from tasks due that ISO week) and a **PM "Done"**; each posts (best-effort, via `Workspace.slackBotToken`) to the involved clients' internal `WorkspaceClient.slackChannelId`. The DevOps lead (`tasks.publish` — new default-off `FEATURE_PERMISSIONS` entry; admins bypass via `canPublishTaskRollup`) sees a roster of who's pushed and publishes one consolidated roll-up to `channelRoutes["tasks.rollup"]` (gated on all-pushed, with override).
   - **Developer scoping made real** — `ClientAssignment` is the user↔client link the `developer` preset / `seeAllClients=off` flag always implied. Assigned in Settings → Team (`MemberAccessModal` client picker → `PUT /api/team/members/[id]/clients`). Restricted devs are scoped server-side (task board + `/api/clients` list), the sidebar nav now filters by module permission (`app-shell.tsx`), and `MODULE_PATHS` in `src/middleware.ts` was widened to the canonical routes (`/app/portal`, `/app/care`, `/app/code`, `/app/docs`) so deep-links gate correctly.
   - **Developer dashboard** — `AppOverview` renders a task-focused `DevOverview` (My Day standup + My Clients) for developers; admins/staff keep the bento grid plus a new `06 // TASKS` widget, and `tasks.publish` holders get the roll-up panel atop HQ.

5. **Tasks v2 — feature blocks + Gantt + public client timeline** (moved tasks per-client; ClickUp-style):
   - **Per-client tasks page** at `/app/portal/[slug]/tasks` (`ClientTasksWorkspace`) with **Board · List · Gantt** views. Opened from a small **Tasks →** button in the `06 // DEVS` card on the client detail page — the Portal `Clients | Tasks` tab and the `16 // TASKS` summary card were **removed** (deleted `portal-workspace.tsx`, global `tasks-workspace.tsx`, `tasks-summary-card.tsx`).
   - **Feature blocks ("lists")** — new `FeatureBlock` model (clientId, name, start/end dates, colour, orderKey). Each block is one Gantt bar; tasks optionally belong to a block (`Task.featureBlockId`, nullable → loose tasks stay board-only). Server `src/server/feature-blocks.ts`, routes `/api/feature-blocks(/[id])`, validators, hooks in `use-tasks.ts`.
   - **Gantt** (`src/components/tasks/gantt-chart.tsx`) — dependency-free: blocks as bars on a day-scale axis, **Month/Quarter/6mo/Year** zoom, a **red today line**, sticky left rail listing block + task titles + progress. Shared by the internal page and the public timeline.
   - **Public client timeline** — per-client toggleable share (`WorkspaceClient.timelineShareToken/timelineShareEnabled`). Public no-auth page `/timeline/[token]` (server-rendered via `getPublicTimeline` in `src/server/client-timeline.ts`, `noindex`), showing blocks + task names + progress + today line (no assignees/notes). Enabled from the **Share timeline** control on the per-client tasks page (`/api/clients/[slug]/timeline-share`).

6. **Team roster seed (ClickUp-migration prep)** — `src/server/team-roster.ts` is the canonical name→email→role roster (24 devs + Harry admin, Sian staff, Dan), alias-matched. `seedGitworkTeam()` (admin one-shot `POST /api/dev/seed-team`) upserts `User`+`WorkspaceMember` (developer preset) and backfills `Candidate.email` in Code. Reused by the importer for assignee resolution. Migration plan in `docs/clickup-import-plan.md`.

7. **Tasks v3 — multi-assignee, subtasks, acceptance criteria, milestones, optional block dates** (Phase 1 of the ClickUp migration; built on v2):
   - **Multi-assignee** — `Task.assignees` (m-n); legacy `Task.assigneeId` kept (not dropped — additive for `prisma db push`) and used as a fallback when the join is empty. DTO is `assignees[]`; UI shows an `AssigneeStack`; standup/roll-up/scoping query `assignees: { some }` (OR legacy). Form uses togglable name chips.
   - **Subtasks** — `Task.parentId` self-relation (one level). Board/list show top-level only (`parentId: null`); subtasks live in the detail drawer (checklist + add), card shows a count.
   - **Acceptance criteria** — `Task.acceptanceCriteria` (optional) in the form + drawer.
   - **Milestones** — new `Milestone` model (single date) + `src/server/milestones.ts`, `/api/milestones(/[id])`, hooks, `milestone-form.tsx`. Render as diamond markers on the Gantt (internal + public) via `GanttChart`'s `milestones` prop.
   - **Optional block dates** — `FeatureBlock.startDate/endDate` now nullable; a block is a Gantt bar only when both are set, else board-only. `Task.metadata` (Json) + `clickupId` (indexed, not unique) on Task/FeatureBlock/Milestone for the importer.
   - **Deferred**: `WorkspaceClient.retainerDays` exists (schema + validator) but its display/persistence through the verbose clients aggregate module isn't wired yet — small follow-up.

8. **Tasks v3 — Phase 2: the ClickUp importer** (`src/server/clickup-import.ts` + `POST /api/dev/import-clickup`):
   - **Token-based, server-side, idempotent.** Self-discovers the ClickUp tree from just `CLICKUP_TOKEN` (env): team → "Clients" space → folders → lists → tasks. Subtasks, custom fields and markdown descriptions arrive **inline** on the Get-Tasks endpoint, so there are **no per-task fetches** (stays inside the rate limit; one pass, paginated, with 429/5xx backoff).
   - **Why a token** (vs the no-token MCP path): the live ClickUp connector handles per-list reads but **times out on bulk pulls**, and the list summaries omit descriptions/subtasks/the custom 28-name "Assignee" field — a faithful, reproducible migration needs server-side detail fetches. Dan provided a token. The token is migration-only and safe to delete from the env afterwards.
   - **Mapping** (per `docs/clickup-import-plan.md`): folder→`WorkspaceClient` (normalized-name match + `FOLDER_ALIASES`), list→`FeatureBlock` (undated), `Milestones` list→`Milestone` (all, dated only), task→`Task` (**active only**), subtask→`Task.parentId` (one level, deeper flattened), urgent→HIGH, multi-assignee via native assignees + custom "Assignee" label resolved through `team-roster`, custom fields→`Task.metadata`, and `ClientAssignment` derived where a dev holds ≥1 task. Skips Support/Feedback/Course-request/`{{Legacy}}` lists; **keeps** Retainer lists (surfaced in the dry-run).
   - **"Active" is status-based, not `include_closed`** — ClickUp's "complete" is a *custom* status (`type !== "closed"`), so `include_closed=false` still returns finished work. The importer fetches everything and excludes any status that maps to DONE (`done/complete/closed/archived/cancelled/live/shipped/merged` + structural closed/done type).
   - **How to run**: set `CLICKUP_TOKEN` in Vercel env → `POST /api/dev/import-clickup` (admin only) defaults to **`dryRun: true`** and returns per-client counts (blocks / milestones / active tasks / subtasks) + `unmatchedFolders` / `unmatchedAssignees` / `knownButMissingUsers`, writing nothing. Review, optionally pilot one client with `{"clientSlug":"…"}`, then re-POST `{"dryRun": false}` to commit. Re-runnable (keyed on `clickupId`). **Prerequisite**: run `POST /api/dev/seed-team` first so the dev roster exists as Foundry Users (else assignees land in `knownButMissingUsers`).

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
