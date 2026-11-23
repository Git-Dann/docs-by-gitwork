# Foundry by Gitwork — Claude Code Guide

## 🛑 STOP — READ THESE FIRST. MANDATORY, NO EXCEPTIONS.

**Read all five of these BEFORE you change, create, refactor or deploy anything.** Not skimmed.
Not assumed from an earlier session. Not inferred from the diff or the file you're about to open.
If you are about to touch this repo and haven't read them, **stop and read them now.**

| File | What it governs |
|---|---|
| **`CLAUDE.md`** (this file) | Project guide, conventions, module map, and the index to the change history |
| **[`docs/history/`](docs/history/)** | The change history itself — one file a month, numbers unchanged |
| **[`DESIGN.md`](DESIGN.md)** | The design system — tokens, type, components, spacing, radius |
| **[`docs/build-checklist.md`](docs/build-checklist.md)** | The quality gate: `npm run verify` and what it checks |
| **[`docs/mobile-playbook.md`](docs/mobile-playbook.md)** | **Mandatory** for any layout / responsive / spacing work |

There is no exemption for a small change. "It's a one-liner", "it's just copy", "it's only a
class name" and a request to move fast are **not** exemptions — most of the defects catalogued in
§30 and §31 arrived in exactly those disguises. This is enforced at session start by
`.claude/hooks/session-start.sh`, which prints these rules into every session (§32).

**Three hard rules that follow from the above:**

- **Name your chat to the convention** — `<Name> {{Product}}` / `{{Feat}}` / `{{Agent}}`. See
  **§32**. This is how work is tracked across the team; an untagged chat is invisible.
- **Run `npm run verify` before any PR**, and report what it actually printed. CI runs the same
  thing on every PR (§31), and a `pre-push` hook runs it for you on a push to `main`. Never call
  something verified that wasn't run. **Only `main` deploys to production** — straight to the
  Fasthosts VPS (§23), not Vercel. There is no staging and there are no branch previews (Vercel
  is retired, §2) — see `docs/build-checklist.md` §4 for what can be verified before merging.
- **Keep [`ONBOARDING.md`](ONBOARDING.md) current — in the same PR as the change.** It's the
  one-page handover new builders actually read, so a stale one actively misleads them. It is **not**
  a summary of this file; it only covers what someone needs in week one. Update it when you change:
  the **workflow or a gate** (`verify`, CI, the hooks), a **canonical route or the module map**, a
  **shared field/layout convention** it names, or when a **trap in its §4 list** is fixed or a new
  one is learned. Adding a feature does *not* require touching it — resist growing it into a second
  `CLAUDE.md`; its value is that it is short enough to be read in full.

---

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

> **Vercel retired (Nov 2026).** `vercel.json` is gone, the middleware no longer treats
> `*.vercel.app` as a Foundry host, and there are no branch previews. Its builds had started running
> out of memory, it was wired to the stale Neon database, and nothing served production from it.
> The Vercel project was **paused and disconnected from GitHub on 20 Nov 2026**, so no push or PR
> builds there or gets a Vercel comment; it can be deleted when convenient. Neon is to be backed up
> once and deleted. Read every Vercel/Neon mention below as
> history. (`wedge-course-backend.vercel.app` is Big Wedge's own service, not ours: leave it.)
>
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
| Production branch | `main` — **auto-deploys to the VPS** via GitHub Actions (`deploy.yml`) on push, ~6 min. (Vercel retired Nov 2026) |
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
  one clean deploy line.
- **Syncing a feature branch with `main`** → **rebase** (`git fetch && git rebase origin/main`).
  Do **not** `git merge main` into the branch and push that merge onto `main` — merge commits
  like *"Merge origin/main into feature/x"* land on production as unreadable deploys. (This was
  the single biggest source of deploy-feed noise before it was cleaned up in June 2026.)
- **Stay tidy** → prune stale worktrees (`git worktree prune`) and don't leave dozens of
  abandoned branches around. Auto-delete handles remote branches post-merge.

### Branch history (resolved Nov 2026)

`main`'s history was re-rooted in July 2026 and then reattached (§33): its root is `bd8d7145`
(2026-03-11), so the old lineage is in `main` again. On 19 Nov 2026 every old branch was cleaned
up: each one was either already in `main` or had its tip tagged first (`archive/branch/<name>` for
GitHub branches, `archive/local/<name>` for local ones), and each tag was checked against the
branch's commit before the branch was deleted. To bring one back:
`git push origin archive/branch/<name>^{commit}:refs/heads/<name>`.

⚠️ Before deleting a branch, check `git merge-base --is-ancestor <branch> main`. A squash-merged
PR's branch is NOT an ancestor (its commits differ from the squash), so tag it first.

### Git hygiene — prevent object store corruption

Claude Code creates a worktree per session. Without maintenance, accumulated worktrees and stale
local `claude/` branches cause pack-file corruption (missing delta bases, orphaned commit objects)
that breaks `git gc`, `git prune`, and `git fsck`. This happened in June 2026 and required a full
mirror clone to repair — and that repair is what orphaned the history described above, so treat
the recipe below as a last resort, not routine maintenance.

**Run periodically** (every few sessions, or when > ~5 active worktrees):

```bash
# From the MAIN repo directory (not a worktree):
git worktree prune
git branch | grep claude/ | xargs git branch -D 2>/dev/null || true
git gc --prune=now
```

> ⚠️ That `git branch -D` line deletes `claude/` branches with no check. Before deleting any other
> branch, local or remote, tag it unless it is already in `main` (see "Branch history" above).

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

⚠️ **A new `@unique` is refused even on a brand-new, all-null column** (Oct 2026, §87). Prisma
counts any added unique constraint as possible data loss, so `Candidate.memberId @unique` blocked
the whole deploy of #739 while the old image kept serving. Enforce one-per-parent in code and use
`@@index` instead, or add the constraint by hand first. A scratch Postgres loaded with production's
schema reproduces the refusal exactly; run `prisma db push` against it before merging.

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

The sidebar uses different labels from the URL routes — mapping below.

> **Use the canonical route in anything new.** Four modules have both a canonical short path and a
> legacy one, and `MODULE_PATHS` in **`src/server/auth/module-gate.ts`** is the source of truth — it
> labels them exactly that way (it moved out of `src/middleware.ts` in July 2026 so it could be
> unit-tested; see §33). Both resolve, so the legacy paths are safe in old links, but new code, new nav
> entries and new deep links use the canonical column.
>
> | Canonical | Legacy (still resolves) |
> |---|---|
> | `/app/portal` | `/app/clients` → `redirect()` stubs |
> | `/app/care` | `/app/support` → query-preserving `redirect()` stub (§42.16) |
> | `/app/staff` | `/app/code` and `/app/codeclear/**` → query-preserving `redirect()` stubs (§87.1) |
> | `/app/docs` | `/app/proposals` → `redirect()` stubs |
>
> Note the **server module name is a third thing again** and doesn't match either: Portal →
> `clients`, Care → `support`, Code → `codeclear`, Docs → `proposals`. The `Server module` column
> below is the one to trust for imports.

| Sidebar label | Route | Server module | Description |
|---|---|---|---|
| **Foundry HQ** | `/app` | — | Dashboard overview. `/app/projects/[slug]` hangs off it (project detail; `app-shell.tsx` deliberately highlights HQ for it) |
| **Pulse** | `/app/pulse` | `src/server/pulse*.ts` + `pulse-agents/` | AI project validation — ~600 checks in `checks-registry.ts`, gap analysis, GitHub fix-agent, continuous monitors. Also hosts the optional **Study** research tool (no longer a top-level module — see §26) |
| **Provenance** (lab) | `/app/provenance` | `src/server/provenance/` | Attestation layer — strikes a **Countermark** from a completed Pulse scan: a frozen, digest-and-seal-verified certificate of what a piece of software was found to be, what could **not** be established, and how long the mark is valid for. Public certificate at `/countermark/[token]` (no auth, noindex). **No sidebar item** — entry point is Settings → Labs (§4a) while it's an experiment. Gated by the **admin-only `provenance` feature perm** (default-off, NOT a module id — see §38); issuing/revoking is the separate high-risk `provenance.issue`. See §38 + `docs/provenance.md` |
| **Staff** (was Code) | `/app/staff` · Developers `/app/staff/developers` · Hiring `/app/staff/hiring/**` (legacy `/app/code`, `/app/codeclear/**` redirect) | `src/server/codeclear*.ts` | People, developers, and Hiring (overview, pipeline, DevSignal). See §87.1 for the path map. ⚠️ `/app/staff/hiring/devsignal` must stay ahead of `/app/staff` in `MODULE_PATHS`, or admin-only DevSignal regates onto the staff-inherited `codeclear` module |
| **Studio** | `/app/studio` | — (client-side only, no `/api/studio`) | Brand asset studio — design on-brand social assets and App Store / Play Store screenshots, then batch-export at the exact size each platform needs. ~30 components under `src/components/studio/` (`studio-root.tsx` entry, plus `templates/`, `screenshots/`, `costing/`, `brand.tsx`, `export.ts`). Also now hosts the **Demo builder** (`demo-builder.tsx`), moved out of Settings in July 2026 — this is the `Demo {{Feat}}` workstream in §32. Module permission id `studio`. **No sidebar item since Aug 2026** — reached from **Settings → Labs**, which is Super-Admin-gated, so this narrows it from the `studio` module perm (§4a) |
| **Docs** | `/app/docs` | `src/server/proposals.ts` · `documents.ts` · `document-analytics.ts` | Document builder (proposals + SLA/SOW/MSA/NDA/CO/DSA) — registry-driven sections, costing, timeline, markdown rich text, split-screen live preview, tokenised public share (`/docs/[token]`), e-sign, comments, versions, AI authoring, **link tracking + analytics** (`/app/docs/analytics`). `/app/proposals/*` are redirect stubs (see §16) |
| **Portal** | `/app/portal` (legacy `/app/clients`) | `src/server/clients.ts` · `meetings.ts` | Client management + detail pages, incl. **Scribe** AI meeting notes per-client (no sidebar item — see §14). `/app/clients(/[slug])` are redirect stubs — they were a live, degraded second copy missing the tasks/wiki/design-system children |
| **Care** | `/app/care` (legacy `/app/support` → redirect stub) | `src/server/support.ts` | Client support ops: one UI since Nov 2026 (§42.16). Conversations · Reports · Automation · Channels & settings per client. Operator runbook: `docs/care.md` |
| **Analytics** | `/app/analytics` | `src/server/analytics/` | Delivery, output & AI usage. Super Admin — gated by the page itself (`notFound()` on a live DB role read), not by `MODULE_PATHS`. **No sidebar item since Aug 2026** — a mono `· ANALYTICS` link in the HQ context strip |
| **Money** | `/app/money` | `src/server/money.ts` · `money-deals.ts` | Revenue under contract, still to bill, won, pipeline, recorded deals (§141). **Super Admins + `clients.viewFinancials` only**, checked by the page (404) and `/api/money` (403); in `UNGATED_APP_PREFIXES` because Siân holds the permission without Portal. **No sidebar item** — a mono `· MONEY` link in the HQ context strip |
| **Starters** | `/app/starters` | `src/server/starters*.ts` | Prompt→production library. **Super Admin only**, enforced by a dedicated check in `middleware.ts` ahead of the module gate. **No sidebar item since Aug 2026** — a mono `· STARTERS` link in the HQ context strip |
| **Handbook** | `/app/handbook` | — | Internal developer knowledgebase. Deliberately readable by every internal user (no module gate); writes are Admin+ (enforced in `/api/handbook`) |
| **Templates** | `/app/templates` | `src/server/proposals.ts` | Document templates. Linked from the Docs workspace; gated on `proposals` since July 2026 |
| **Study** (tool) | `/app/study` | `src/server/study*.ts` + `study-agents/` | AI user research — multi-agent persona interviews, synthesis, reports. **No sidebar item** — surfaced as an optional tool inside Pulse (see §26). Routes/API/models unchanged at `/app/study` · `/api/study` |
| **Monitors** | `/app/monitors` | `src/server/wiki-monitor-board.ts` (`loadMonitorBoard`) | Every client's uptime monitors and open incidents on one page. The monitors themselves still live in each client's wiki. Gated by the `monitors` module perm: Staff + Admin by default, granted per developer. Internal-only (no guests). See §108 |
| **Backstage** | `/app/backstage` | `src/server/backstage.ts` + `backstage-holidays.ts` | Internal Gitwork ops umbrella — v1 covers staff leave booking + expenses tracking + staffing alerts on HQ. Future tools slot in as `/app/backstage/<slug>` |
| **Settings** | `/app/settings` | — | AI provider config, rate card, workspace branding |
| **Proof** | `/app/proof` | `src/server/proof.ts` | Document sign-off workflow — currently **hidden from nav** (commented out in app-shell.tsx) |
| **Rate Card** | `/app/settings` (tab) | `src/server/rate-card.ts` | People rates used in proposal costing |

**Public pages (outside /app):**

> **The agency marketing pages are gone (July 2026).** `/products`, `/products/[slug]`,
> `/pricing`, `/company` and `/customers` duplicated gitwork.co.uk — which is the site that
> links *here* — and were removed along with the whole of `src/components/marketing/`, their
> only consumer. All five 308 to gitwork.co.uk. `/design-system` went too: a stale, indexable
> HTML mirror of `DESIGN.md` with zero inbound links.

| Route | Description |
|---|---|
| `/` | **307 → `/portal/login`.** A platform landing page briefly lived here to win the ~49 SEO/AEO/Trust checks that parse `/`'s HTML, but the portal login is the intended front door, so it was reverted. Because a scan FOLLOWS the redirect, `/portal/login` is the page that gets graded — which is why it carries a footer, `<main>`, Organization/WebSite JSON-LD and the company/VAT disclosure. Put scan-facing scaffolding THERE, not here |
| `/legal` · `/privacy` · `/terms` · `/cookies` · `/security` | **308 → the gitwork.co.uk equivalent** (`next.config.ts`). One set of company policies, owned where the rest of the public content is owned — Foundry hosted its own briefly in July 2026 and they were removed pending legal review. The login footer links these relatively and should keep doing so, but **the trap this note used to describe is gone (Aug 2026)**: `privacy_policy`/`terms_of_service` no longer demand a literal `href="/privacy"` with the closing quote. They now match the path segment anywhere inside an href, so a locale prefix (`/gb/privacy`), a trailing slash, an absolute URL, a query/fragment and non-English paths all count. The old exact match falsely accused **every internationalised site** of having no privacy policy — it was Pulse's top finding on stripe.com, which links `href="/gb/privacy"`. The 65-point hard cap also no longer exists: score v3 (`score-breakdown.ts`) caps only on `target_content_accessible`. See `pulse-checks/__tests__/legal-link-detection.test.ts`. |
| `/pulse-overview` | Standalone public Pulse product page (not in app nav, shareable URL). Self-embeds `/embed/pulse`, which is why `'self'` is in that route's `frame-ancestors` |
| `/embed/pulse` | Embeddable scanner widget. **External contract** — allow-listed for gitwork.co.uk in `next.config.ts` and the only route exempt from the baseline security headers. Do not touch without checking the live embed |
| `/api-docs` | REST API reference. Linked in-app from Settings → Developer |
| `/context` | AI context page — noindex, no inbound links, and self-reports "May 2026". Stale; either refresh or drop it |
| `/report/[token]` · `/docs/[token]` · `/sign/[token]` · `/onboarding/[token]` · `/timeline/[token]` · `/brand/[token]` · `/wiki/[slug]` · `/vet/[token]` | Client & candidate deliverables — the URL token is the credential. All noindex, all disallowed in `robots.ts` |
| `/demo/**` | 16 white-labelled sales demos. Public by design, noindex, **fully mock** — no demo page imports Prisma or any server module |
| `/edge` | Corsair Xeneon kiosk board. Session-gated, chrome-free, dark-forced. Entry point now lives in **Settings → Labs** (§4a) rather than a top-level route, per the rule below |
| `/guidelines` | The Gitwork brand guidelines as a 16:9 deck (§91). Session-gated like `/deck`, forced light, reached from Settings → Labs |
| `/deck` | Deck slide editor shell (static, `public/deck/index.html`, rewritten in `next.config.ts`). Session-gated. **Do not move it** — four vendored files test `location.pathname.startsWith('/deck')` and a Next rewrite does not change `location.pathname`; `foundry-doc.ts` uses that test to select DOCUMENT MODE, so `/app/deck?doc=` would boot an empty file-mode deck and stop saving |
| `/canvas` | Canvas artwork tools shell (static, `public/canvas/index.html`, rewritten in `next.config.ts`). Session-gated like `/deck`. Built from `Git-Dann/canvas` — see §63. Reached from Settings → Labs |
| `/app/pulse/[scanId]/report` | Printable Pulse report (in-app) |

### 4a. Where a surface belongs

`/app/<name>` is for a **main product** — its own sidebar item and module permission.
Anything else gets an entry point, not a namespace:

- **A feature of a product** → surfaced inside that product. Decks are made in Docs
  (+ New → Deck); Study sits inside Pulse; Scribe is a panel on the client detail page.
- **An experiment or internal-only surface** → **Settings → Labs**
  (`src/components/settings/labs-panel.tsx`, Super Admin). `/edge` is the first entry.
- **A second internal tool** → under Backstage, never a new top-level item (§10).

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
      badge/pulse/[token]/        ← Public Pulse-score badge SVG (same shareToken; §38)
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
    dispatch/                     ← Dispatch: the Slack-resident coordinator (§36)
      resolve.ts                  ← PURE question → subject (client/person/workspace) resolution
      evidence.ts                 ← Deterministic bounded evidence pack + deriveBlindSpots (no AI)
      answer.ts                   ← Pure no-AI floor + ONE cached light-tier phrasing call
      respond.ts                  ← Orchestrator: gates → resolve → gather → answer
      config.ts / types.ts        ← resolveDispatchConfig + DISPATCH_DEFAULTS
    slack/
      events.ts                   ← Events API handler (loop guard, dedupe, external-channel gate)
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
- Browser traffic is authorised by the NextAuth session (the old `gitwork_api_session` cookie carrying `API_KEY` was removed, §88)
- External API calls use `Authorization: Bearer <key>`: a workspace key from Settings → Developer, or the env `API_KEY` (Gitwork only)

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
- **To ADD A CHECK:** emit it with `category: CATEGORIES.<X>`, add its `{ key, category,
  label }` row to `src/server/checks-registry.ts`, then run **`npm run pulse:catalogue`** to record
  the new key. The registry is the catalogue the Settings → Checks panel + per-workspace
  `PulseCheckConfig` overrides + framework counts are built from.
- **To ADD A CATEGORY:** add one entry to `CATEGORIES` + one row to `CATEGORY_META` (pick a
  domain + weight + blurb). Nothing else needs editing.
- ⚠️ **To REMOVE A CHECK: you don't — you retire it.** A `checkKey` is a **public identifier**,
  not an internal name: it keys every historical `PulseScanCheck` row *and* every
  `PulseCheckConfig` row a workspace has set (`@@unique([workspaceId, checkKey])`). Deleting or
  renaming one orphans a customer's own enable/label/severity decisions and makes the matching
  rows in their stored scans unreadable — silently, because nothing recomputes an old scan. Add a
  `RETIRED_CHECKS` entry in **`src/server/pulse-checks/catalogue-compat.ts`** naming the successor
  and the relationship (`SUPERSEDED_BY` · `MERGED_INTO` · `SPLIT_INTO` · `ALIAS_OF` ·
  `WITHDRAWN`), *then* run `npm run pulse:catalogue`. The key stays readable; only its
  implementation goes.
- **Enforced by two tests** (`npm test`), which cover opposite directions and neither is
  sufficient alone:
  - `pulse-checks/__tests__/categories.reconcile.test.ts` — every **emitted** `checkKey` is in the
    registry, every category has metadata + exactly one domain, no duplicate keys.
  - `pulse-checks/__tests__/catalogue-compat.test.ts` — every **registered** key is backed by an
    implementation (so the Settings panel can't advertise a control that never runs), every key in
    `catalogue-baseline.json` is still registered or explicitly retired, and every retirement names
    a live successor. Baseline out of date? `npm run pulse:catalogue`.

  If either fails, the catalogue drifted — fix the source, not the test.
- Runtime stats are already automatic: all scan-results UI derives pass/warn/fail, category
  cards, score and priority live from the persisted `scan.checks` — nothing to wire per check.

**Starters catalog — prompt depth standard (mandatory)**
- Every prompt/skill/kit committed to `CORE_BUILT_INS` (`src/server/starters-catalog.ts`) or
  `PROMPT_STARTERS` (`src/data/prompt-starters.json`) must hit the depth bar Dan set in July 2026
  by sharing his own hand-written "Proposal Builder" prompt as the baseline — a lightweight
  "Anthropic best-practices" pass (light XML tagging, no real substance) is **not sufficient** and
  has already been rejected once. A shallow `promptText` is a defect, not a stylistic choice.
- **The 5-part structure every text/reasoning prompt's `promptText` must contain:**
  1. `<role>` — a specific expert persona, not "a helpful assistant."
  2. A **reference/domain-knowledge section** (tag name can vary — `<reference_data>`,
     `<domain_knowledge>`, whatever fits) — a real, substantive framework, checklist, or table a
     genuine expert would use (named frameworks, industry-standard checklists, real
     numbers/ranges). Never vague paragraphs, never fabricated fake "our own data."
  3. A **house_rules section** — 5-9 explicit, numbered, specific heuristics, each with a real
     reason, not a generic virtue ("be helpful").
  4. A **structured input template** — 5-8 labeled fill-in-the-blank fields, not one generic
     bracket.
  5. A **detailed output spec** — numbered deliverable sections (4-8), each described precisely,
     with mode-switching guidance where relevant.
- **Image-generation prompts get the medium-appropriate equivalent, not the business template
  forced on top:** a tight role/framing line if useful; real camera/lens/lighting/composition
  technique and actual platform parameters (Midjourney `--ar`/`--v`/`--style raw`/`--no`; Google
  Imagen/Nano Banana's Shot-type→Subject→Setting→Lighting→Camera→Lens template; Ideogram/gpt-image
  notes on text-rendering reliability) in place of `<reference_data>`/`<house_rules>`; the "input
  template" is the actual structured shot-construction fields; the "output spec" is simply the
  final ready-to-paste prompt plus a one-line platform note. Depth here means technical precision,
  not sheer word count — don't pad an image prompt into an unusable wall of prose.
- **Deliberately exempt:** the 10 `claude-design-2-0`-tagged entries (a sequential Daybreak-brand
  tutorial) and any future entry that is genuinely one step in a fixed sequence, not a standalone
  prompt — forcing the full structure onto a sequential-tutorial fragment breaks its intended
  nature. Don't invent new exemptions casually; this one was a deliberate, discussed call.
- Only `promptText` is in scope for a depth pass — `name`/`summary`/`description`/`type`/`tags`/
  `whatYouGet`/`install`/`techStack`/`_buildRef` are a separate concern and shouldn't be touched
  just because `promptText` is being deepened.
- Precedent / reference material: PR #420 (July 2026) deep-rewrote all 33 `CORE_BUILT_INS` +
  143 of 155 `PROMPT_STARTERS` to this bar in two phases — read a few of those entries as the
  concrete standard before writing a new one from scratch.

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
                     #   ⚠️ pushes schema to whatever DATABASE_URL points at — never run in CI
npm run db:generate  # prisma generate only
npm run db:push      # push schema changes to the database
npm run db:migrate   # create a named migration
npm run lint         # ESLint
npm test             # vitest (unit tests)

# Quality gate — run before every PR (§31, docs/build-checklist.md)
npm run verify       # db:generate → tsc --noEmit → lint → test → audit:ui   (no DB needed)
npm run audit:ui     # static field/layout/AI-cost standards audit (add -- --self-test first)
npm run audit:clipping <url>   # runtime clipping audit, needs a reachable page
npm run deck:verify  # Deck's own regression gate (see §30)
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

> Audited July 2026. Rows that were **fixed or simply wrong** have been removed rather than
> left to mislead: the `MODULE_PATHS` row (fixed long ago, and it contradicted §13.4 in this
> same file), the "Library/Templates nav hidden" row (Templates is linked from the Docs
> workspace and now gated), and the `any`-usage count, which was ~135 and is actually **26**.

| Issue | File | Notes |
|---|---|---|
| ~~Cron scheduling has drifted~~ | `deploy/crontab` | **Fixed Nov 2026 (§132):** the repo owns the VPS crontab and every deploy installs it; `vercel.json` has no crons. Every cron route is scheduled. |
| `pulse-scan.ts` is 4000+ lines | `src/server/pulse-scan.ts` | Works fine — don't split without a clear plan. Future task. |
| 26 `any` type usages | various | Not breaking. Gradual cleanup is a future task. |
| Proof is built but hidden | `src/components/app-shell.tsx` | Nav item commented out. Now gated on `proposals`. `src/server/proof.ts` hands out absolute `/app/proof?…` share URLs, so any relocation needs a query-preserving stub. |
| `locals-settings` uses localStorage | `src/lib/local-settings.ts` | Account/workspace settings client-only — pre-auth artifact. |
| Backstage receipts in Postgres `bytea` | `prisma/schema.prisma` (`Expense.receiptImage/Thumb`) | Fine for now. Migrate to object storage once volume exceeds ~100 expenses or any receipt routinely > 1MB. Lifecycle: full image dropped on review, ~20KB thumb retained for audit. |
| Deleting a route is invisible to the gate | — | `npm run verify` and `next build` cannot see a removed API route: `audit:ui` walks `src/` dynamically, no test references `api/dev` or `api/cron`, and the "101 static pages" line in `checks.yml` is a comment, not an assertion. **Grep for callers by hand before deleting a route.** |

---

## 32. Chat / session naming convention — REQUIRED for every Gitwork session

**Every chat or Claude Code session started by anyone at Gitwork must be titled to this
convention.** It is how work is tracked, triaged and monitored across the team — an untagged or
free-form chat title is effectively invisible in the session list, so this is not cosmetic.

### The format

```
<Name> {{Tag}}
```

The name first, then a single space, then the tag **verbatim including the double braces**. Three
tags exist. Do not invent a fourth.

| Tag | Means | Current members |
|---|---|---|
| `{{Product}}` | A top-level module — its own sidebar item and route | **Pulse · Care · Docs · Code · Studio · Portal · Provenance · Monitors** |
| `{{Feat}}` | A feature inside, or spanning, the products | **Dispatch · Deck · Canvas · Starters · Wiki · DevSignal · RoundUp · Demo · On Your Desk · Settings · MCP · Calendar · Dashboard · Handbooks · Analytics · Notifications · Launchpad · CRM · Sheets · Multi-tenant · Brand Guidelines · AI search · Commitments · Money** |
| `{{Agent}}` | A scheduled / background agent | **Curator · Foreman** |

Examples: `Pulse {{Product}}` · `On Your Desk {{Feat}}` · `Foreman {{Agent}}`.

### Rules

1. **`{{Feat}}` is spelled `{{Feat}}`** — never `{{Feature}}`, `{{feat}}` or `{{FEAT}}`. The tags
   are matched literally.
2. **Use the established name exactly** as it appears above — `On Your Desk`, not `Desk`;
   `DevSignal`, not `Dev Signal`; `RoundUp`, not `Round Up`.
3. **New workstream not on the list?** Use its real name plus the tag that fits what it is
   (module → `{{Product}}`, feature → `{{Feat}}`, scheduled agent → `{{Agent}}`), and add it to
   the table above in the same PR so the registry stays the source of truth.
4. **Standing intake threads are the only untagged exception** — the long-lived, cross-cutting
   ones: `SOUNDING BOARD`, `SUGGESTIONS`, and named feedback threads such as
   `Developer feedback: bugs and improvements`. Everything else gets a tag.
5. **One workstream per chat.** The convention only buys visibility if a chat titled
   `Care {{Product}}` is actually about Care. Spin up a new correctly-named chat rather than
   letting one drift across three modules.

### Registry vs. the module map — known drift (do not silently "fix" either)

The `{{Product}}` list above is **Dan's tracking taxonomy**, and it is deliberately recorded here
as given. It does not currently line up 1:1 with the §4 module map, and that's worth knowing
before you reconcile anything:

- **`Studio`** — resolved (July 2026, Dan confirmed it's real and belongs): it now has a §4 row.
  Live at `/app/studio`, in the sidebar, module permission id `studio`, client-side only.
- **`Study`, `Backstage` and `Proof`** have §4 rows but no entry in this taxonomy. Study was
  demoted to an admin-only tool inside Pulse (§26) and Proof is nav-hidden (§11), so their absence
  is probably intentional; Backstage's is less clear.
- **`Dispatch` and `RoundUp`** are tracked as `{{Feat}}` but have no module/route in the codebase
  yet — they are in-flight workstreams, which is exactly what the taxonomy is for. It tracks
  **work**, not only shipped surfaces.

Ask before reconciling the two lists in either direction — deciding whether `Backstage` needs a
tracking tag is Dan's call, still open.

---

## Change history — the index

Every `§N` in this codebase resolves here. The bodies live under `docs/history/`, one file a
month, numbers unchanged: a section is cited from the code that it explains, so renumbering
would break the one thing an index exists to preserve.

⚠️ **Seven numbers are used twice** (§38, §39, §58, §60, §61, §62, §116), from the months they were written in.
Both are listed below, with their titles, so a citation that is already ambiguous can at least
be resolved by reading. Do not renumber either one.

### May 2026 — [`docs/history/2026-05-may.md`](docs/history/2026-05-may.md)

- **§12** — Recent Changes (May 2026)

### June 2026 — [`docs/history/2026-06-june.md`](docs/history/2026-06-june.md)

- **§13** — Recent Changes (June 2026)
- **§14** — Scribe (AI meeting notes)
- **§15** — Care analytics connectors (multi-client reporting)
- **§16** — Customisable onboarding (forms ported onto the Docs pattern)
- **§17** — Docs audit: security, link tracking, builder
- **§18** — Pulse: shared lite-scan core, decoupled AI, public embed widget
- **§19** — Portal: dev count + gated client cost & working days
- **§20** — Portal: per-client retainer (used / allowance)

### July 2026 — [`docs/history/2026-07-july.md`](docs/history/2026-07-july.md)

- **§21** — Docs → Google Drive backup (native Google Docs)
- **§22** — "On Your Desk" (persistent internal drawer)
- **§23** — Migrated off Vercel/Neon to a Fasthosts VPS
- **§26** — Study demoted from a top-level module to an admin-only Pulse tool
- **§27** — "The Monday Brief" (daily editorial digest, peeks from the Desk)
- **§28** — The Curator (weekly library-maintenance agent)
- **§29** — Foreman (daily delivery-risk watchdog on the Desk)
- **§30** — Deck (the slide editor, forked from bento/slides)
- **§31** — The build gate: CI on PRs + a static UI-standards audit
- **§33** — Backend cleanup: the /app gate defaults to deny, Care clears unread
- **§34** — Pulse learns to read a native iOS repo
- **§35** — Secrets sync from CI, and the token that was never set
- **§36** — Dispatch (the Slack-resident coordinator)
- **§37** — Pulse: the scan dropdown gets check families behind it
- **§38** — Provenance: the attestation layer (new product) ⚠️ *(one of two §38)*
- **§39** — Badges: "Foundry Approved" + an embeddable Pulse score ⚠️ *(one of two §39)*
- **§38** — Pulse reads the source of a WEB repo (the blind spot at the centre) ⚠️ *(one of two §38)*
- **§39** — Pillars, a real benchmark, and cleanliness that measures code ⚠️ *(one of two §39)*

### August 2026 — [`docs/history/2026-08-august.md`](docs/history/2026-08-august.md)

- **§40** — Client intake API, and the sidebar is products only
- **§41** — The Docs architecture review (Routes A–C) + the renderer's ceiling
- **§42** — Care tells you whether a reply was actually sent
- **§43** — Launchpad (what we need FROM the client)
- **§44** — A second door to the free scanner, and the scanner told the truth about six real sites

### September 2026 — [`docs/history/2026-09-september.md`](docs/history/2026-09-september.md)

- **§45** — Course requests: a forgiving search, and 200px of the table was unreachable on a phone
- **§46** — The standup review dialog resized with its content
- **§47** — Requests became a tracker, and the client's sheet follows the board
- **§48** — Insights: charts and diagrams in a client's wiki
- **§49** — Delivery and Support: two client-portal pages over data we already held
- **§50** — Incident: every client's wiki 500'd, and `tsc` could not have caught it
- **§51** — Two controls nobody could reach
- **§52** — The recorded debt, cleared
- **§53** — Incident: 389 "Untitled Course" rows on a client's wiki
- **§54** — The gate could not pass, and the iOS app could not authenticate
- **§55** — Messages: one recipient field, and the audit the feature never had

### October 2026 — [`docs/history/2026-10-october.md`](docs/history/2026-10-october.md)

- **§56** — An iOS link is reported as an iOS app
- **§57** — User management: archive, not delete, and the hole that made it urgent
- **§58** — Pulse shows only the checks that apply to the product ⚠️ *(one of two §58)*
- **§59** — CRM: a lead pipeline that moves itself
- **§58** — Estimates: how long with 1, 2, 3… developers ⚠️ *(one of two §58)*
- **§60** — Incident: Wedge's course requests stopped, for the third time ⚠️ *(one of two §60)*
- **§60** — Pulse: choose what the free scan shows in full ⚠️ *(one of two §60)*
- **§61** — Pulse audit: what it says when it cannot look ⚠️ *(one of two §61)*
- **§62** — Pulse: every finding from 170 real scans checked against the live site ⚠️ *(one of two §62)*
- **§61** — The daily Slack updates report subtasks and ongoing work ⚠️ *(one of two §61)*
- **§62** — Undated phases get an estimated bar, drawn as one ⚠️ *(one of two §62)*
- **§63** — Canvas: artwork tools at `/canvas`, beside Deck
- **§64** — Settings rail halved, Labs as a grid, Deck in Labs
- **§65** — Wiki: Metrics, Meetings and Platforms
- **§66** — The wiki dashboard is arrangeable, per person
- **§67** — Plan-first tasks: pick up the plan before adding to it
- **§68** — Big Wedge user analytics, and platforms the client can open
- **§69** — Requests: a proper conversation, and @mentions to Slack
- **§70** — Wiki follow-ups: replies, a real XSS, Launchpad, course requests
- **§71** — Wiki follow-ups, round two
- **§72** — Comparison tables in the wiki
- **§73** — Sheets: a client-editable spreadsheet linked to the task board
- **§74** — Big Wedge revenue on Metrics, and "so far this month"
- **§75** — The wiki sidebar is grouped
- **§76** — Wiki: one Docs row, EMPTY markers, a phone picker, numbering
- **§77** — Wiki Settings, simplified, with copy-paste sign-in details
- **§78** — Uptime monitors alert, and say when they've stopped
- **§79** — One changelog ping per version; Metrics gets a headline row
- **§80** — Pulse measures code health from a full checkout
- **§81** — A shareable "What Pulse checks" page
- **§82** — The platform families checked against 18 real projects
- **§83** — Code portfolio, import graph, OSV library audit, framework benchmarks
- **§84** — Pulse checks bolstered; projects, history and compare
- **§85** — A client's Google Drive folder in Portal and the wiki
- **§86** — Foundry for other businesses: the baseline and Phase 0
- **§87** — Code becomes Staff (Phase 1, web)
- **§88** — Phase 2 begins in shadow mode
- **§89** — A client's own board columns, and a one-line plan strip
- **§90** — A Halloween theme
- **§91** — Brand guidelines at /guidelines (Labs)
- **§92** — ⌘K command menu, and the EasyUI tracker
- **§93** — Undo toasts (EasyUI, vendored)
- **§94** — People & HR, Phase 1a: profiles, personal details, suppliers
- **§95** — Roles and permissions, tidied
- **§96** — Staff: grouped cards, org chart, HR reminders, a fuller profile
- **§97** — HR documents, with Google Drive copies
- **§98** — Backstage → Me
- **§99** — A Staff tour for HR, and a Monday HR digest
- **§100** — One page per developer
- **§101** — A motion library, Lottie bats and a spider that drops
- **§102** — Staff: a real org chart, leads' clients, and a steadier toolbar
- **§103** — Clients approve releases from their own Changelog
- **§104** — Every client's monitors on the Gitwork wiki
- **§105** — Live figures stay live: Metrics and the monitor board
- **§106** — Monitors: expiry, heartbeats, maintenance
- **§107** — Monitors: request headers, a second location, incidents

### November 2026 — [`docs/history/2026-11-november.md`](docs/history/2026-11-november.md)

- **§108** — Monitors is its own page
- **§109** — Seasonal themes are a workspace setting
- **§110** — MCP access re-checked on every call
- **§111** — Pulse → AI search (stage 1: Google positions + AI visits)
- **§112** — Code Handover: compare versions
- **§113** — Who is a developer is a fact on their Staff record
- **§114** — Code Handover: edit, uploads, file viewer
- **§115** — Commitments: the promises you've made, in one list
- **§116** — People & office: Staff + Backstage only, for Siân ⚠️ *(one of two §116)*
- **§116** — A scan with no AI write-up says so plainly, once ⚠️ *(one of two §116)*
- **§118** — Who counts as Gitwork, and leave that doesn't use allowance
- **§117** — Uptime alerts only for what's on fire
- **§119** — The free scan's score errs low
- **§120** — A clearer "who's off" Slack post
- **§121** — Two Staff records for one person: "Same person as…"
- **§122** — Clients stay signed in for 30 days, renewed as they use it
- **§123** — Releases: the version a task ships in
- **§124** — Product cards, linked dev tasks, default board columns
- **§125** — Importing a client's plan from their planning tool
- **§126** — The client's Board: move, add and sign off cards in their wiki
- **§127** — Sheets is retired: its rows become Board cards
- **§128** — The Board's Schedule replaces the calendar
- **§129** — A refreshed Portal client page, and a Slack digest that says why
- **§130** — HQ: a today band, tidier tiles, quick actions, motion
- **§131** — The demo follows the theme, so dark mode can be checked
- **§132** — The repo owns the VPS crontab
- **§133** — A client's default dashboard (wiki Decision E)
- **§134** — A client's bug or feedback goes to Requests (wiki Decision B)
- **§135** — Client write routes check the caller can work on that client
- **§136** — Every wiki page opens on the same header
- **§137** — Wiki motion: cards stagger in, figures count up
- **§138** — The wiki page-actions standard
- **§139** — Public profiles, and a Staff audit
- **§140** — The wiki got fast: course requests load on their own
- **§141** — Needs you, and Money
- **§142** — The client timeline, the weekly update, and ⌘K across records
- **§143** — Deploys check themselves, and can be undone
- **§144** — The platform tells us when it needs a look
- **§145** — Every scheduled job ran an empty script for two days
- **§146** — The course backend logged in at the wrong server
