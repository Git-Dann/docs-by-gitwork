# Foundry by Gitwork — Claude Code Guide

## 🛑 STOP — READ THESE FIRST. MANDATORY, NO EXCEPTIONS.

**Read all four of these BEFORE you change, create, refactor or deploy anything.** Not skimmed.
Not assumed from an earlier session. Not inferred from the diff or the file you're about to open.
If you are about to touch this repo and haven't read them, **stop and read them now.**

| File | What it governs |
|---|---|
| **`CLAUDE.md`** (this file) | Project guide, conventions, module map, history |
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
  something verified that wasn't run. There is **no staging and no branch previews** — only `main`
  deploys, straight to the Fasthosts VPS (§23), not Vercel.
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

### ⛔ `main`'s history was re-rooted — DO NOT prune remote branches

**Read this before deleting any branch.** `main` currently holds **55 commits and its root commit
is `3242110b`, dated 2026-07-17**. It contains nothing older. **43 of the 45 remote branches share
a completely different root** (`bd8d7145`, the repo's initial commit, 2026-03-11) and have **no
merge base with `main` at all**.

Those branches are the **only** copy of **1,365 commits** — the project's entire history from
March to July 2026. Deleting them destroys it permanently. Almost certainly fallout from the June
mirror-clone repair described below, where a rebuilt `main` was force-pushed.

Three consequences that will bite you:

1. **`git branch --merged` and three-dot diffs are useless here.** With no merge base,
   `git diff main...branch` returns **empty** — which reads as "this branch adds nothing, safe to
   delete". It is the exact opposite. An audit built that test in July 2026 and it reported all 33
   unreferenced branches as safe; checking one by hand (`homepage-redesign`: 108 commits ahead,
   23,112 files differing) caught it before anything was deleted. **Use
   `git merge-base --is-ancestor <branch> main` and treat an empty `git merge-base` output as
   "orphaned, do not touch".**
2. **`git log` / `git blame` lie about anything before 17 July.** `3242110b` is a root commit, so
   it appears to *add* every file in the repo — it will show as the last-touch commit for most of
   the tree and as the origin of files it never touched.
3. **Nine of the eleven open PRs are built on the orphaned lineage** (e.g. #37's base is
   `ddf707d7`, not on `main`), which is why they report `mergeable_state: unknown` and why some
   have sat since May. They cannot be merged normally — they need re-creating from current `main`.

**To make the branches safe to delete**, first anchor the history with tags, then prune:

```bash
# Tag every orphaned tip (annotated, namespaced) — objects stay reachable via the tag.
for b in $(git ls-remote --heads origin | sed 's|.*refs/heads/||' | grep -v '^main$'); do
  git merge-base --is-ancestor "origin/$b" origin/main 2>/dev/null && continue
  [ -n "$(git merge-base origin/main "origin/$b" 2>/dev/null)" ] && continue   # based on main, skip
  git tag -a "archive/pre-reroot/$b" "origin/$b" -m "Archived tip of $b (pre-2026-07-17 re-root)."
done
git push origin --tags     # ⚠️ blocked by the sandbox git proxy (403) — run this locally
# Verify BEFORE deleting anything: expect 1365
git rev-list --count $(git tag -l 'archive/pre-reroot/*' | tr '\n' ' ') --not origin/main
```

The better long-term fix is to reattach the history to `main` so it stops depending on loose refs:
`git merge -s ours --allow-unrelated-histories <orphan-tip>` records the old lineage as a second
parent **without changing a single file**. It needs a merge commit on `main`, which this repo
otherwise forbids (§2), so it is Dan's call.

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

> ⚠️ That `git branch -D` line is **local-only and must stay that way**. Do not adapt it to
> `git push origin --delete` — see the re-root warning above; the remote branches are load-bearing
> until the archive tags are pushed.

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
> | `/app/care` | `/app/support` — ⚠️ still a **live, different** UI, not a stub |
> | `/app/code` | `/app/codeclear` — ⚠️ its `candidates/`, `pipeline/`, `devsignal/**` subtrees live **only** here |
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
| **Code** | `/app/code` (legacy `/app/codeclear`) | `src/server/codeclear*.ts` | Developer hiring pipeline — GitHub analysis, scoring, candidate management. ⚠️ `candidates/`, `pipeline/` and `devsignal/**` still live ONLY under the legacy `/app/codeclear/*` prefix — moving them is a separate PR, and the `/app/codeclear/devsignal` `MODULE_PATHS` entry must be renamed **in place** or admin-only DevSignal silently regates onto the staff-inherited `codeclear` module |
| **Studio** | `/app/studio` | — (client-side only, no `/api/studio`) | Brand asset studio — design on-brand social assets and App Store / Play Store screenshots, then batch-export at the exact size each platform needs. ~30 components under `src/components/studio/` (`studio-root.tsx` entry, plus `templates/`, `screenshots/`, `costing/`, `brand.tsx`, `export.ts`). Also now hosts the **Demo builder** (`demo-builder.tsx`), moved out of Settings in July 2026 — this is the `Demo {{Feat}}` workstream in §32. Module permission id `studio`. **No sidebar item since Aug 2026** — reached from **Settings → Labs**, which is Super-Admin-gated, so this narrows it from the `studio` module perm (§4a) |
| **Docs** | `/app/docs` | `src/server/proposals.ts` · `documents.ts` · `document-analytics.ts` | Document builder (proposals + SLA/SOW/MSA/NDA/CO/DSA) — registry-driven sections, costing, timeline, markdown rich text, split-screen live preview, tokenised public share (`/docs/[token]`), e-sign, comments, versions, AI authoring, **link tracking + analytics** (`/app/docs/analytics`). `/app/proposals/*` are redirect stubs (see §16) |
| **Portal** | `/app/portal` (legacy `/app/clients`) | `src/server/clients.ts` · `meetings.ts` | Client management + detail pages, incl. **Scribe** AI meeting notes per-client (no sidebar item — see §14). `/app/clients(/[slug])` are redirect stubs — they were a live, degraded second copy missing the tasks/wiki/design-system children |
| **Care** | `/app/care` (legacy `/app/support`) | `src/server/support.ts` | Client support ops. ⚠️ **Two UIs are live.** `/app/care` is the rebuilt cockpit; `/app/support` still serves the 5,535-line legacy dashboard and exclusively owns add-client, Tickets, monthly Reports, health scoring, AI search and workflow rules. `client-cockpit.tsx` imports `ConnectorsView` *out of* the legacy file, so it cannot be deleted yet. Finishing the port is a two-way merge, not a cutover |
| **Analytics** | `/app/analytics` | `src/server/analytics/` | Delivery, output & AI usage. Super Admin — gated by the page itself (`notFound()` on a live DB role read), not by `MODULE_PATHS`. **No sidebar item since Aug 2026** — a mono `· ANALYTICS` link in the HQ context strip beside Decks |
| **Starters** | `/app/starters` | `src/server/starters*.ts` | Prompt→production library. **Super Admin only**, enforced by a dedicated check in `middleware.ts` ahead of the module gate. **No sidebar item since Aug 2026** — a mono `· STARTERS` link in the HQ context strip |
| **Handbook** | `/app/handbook` | — | Internal developer knowledgebase. Deliberately readable by every internal user (no module gate); writes are Admin+ (enforced in `/api/handbook`) |
| **Templates** | `/app/templates` | `src/server/proposals.ts` | Document templates. Linked from the Docs workspace; gated on `proposals` since July 2026 |
| **Study** (tool) | `/app/study` | `src/server/study*.ts` + `study-agents/` | AI user research — multi-agent persona interviews, synthesis, reports. **No sidebar item** — surfaced as an optional tool inside Pulse (see §26). Routes/API/models unchanged at `/app/study` · `/api/study` |
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
| `/legal` · `/privacy` · `/terms` · `/cookies` · `/security` | **308 → the gitwork.co.uk equivalent** (`next.config.ts`). One set of company policies, owned where the rest of the public content is owned — Foundry hosted its own briefly in July 2026 and they were removed pending legal review. ⚠️ The login footer must link these **relatively**: `privacy_policy` + `terms_of_service` hard-cap the Pulse score at 65 (`score-breakdown.ts`) and match a literal `href="/privacy"` in the SCANNED page's HTML (i.e. `/portal/login`, since `/` redirects there) — closing quote included, so a trailing slash does not count and an absolute `https://gitwork.co.uk/privacy` does not count either. Relative href satisfies the check; the redirect serves the content. |
| `/pulse-overview` | Standalone public Pulse product page (not in app nav, shareable URL). Self-embeds `/embed/pulse`, which is why `'self'` is in that route's `frame-ancestors` |
| `/embed/pulse` | Embeddable scanner widget. **External contract** — allow-listed for gitwork.co.uk in `next.config.ts` and the only route exempt from the baseline security headers. Do not touch without checking the live embed |
| `/api-docs` | REST API reference. Linked in-app from Settings → Developer |
| `/context` | AI context page — noindex, no inbound links, and self-reports "May 2026". Stale; either refresh or drop it |
| `/report/[token]` · `/docs/[token]` · `/sign/[token]` · `/onboarding/[token]` · `/timeline/[token]` · `/brand/[token]` · `/wiki/[slug]` · `/vet/[token]` | Client & candidate deliverables — the URL token is the credential. All noindex, all disallowed in `robots.ts` |
| `/demo/**` | 16 white-labelled sales demos. Public by design, noindex, **fully mock** — no demo page imports Prisma or any server module |
| `/edge` | Corsair Xeneon kiosk board. Session-gated, chrome-free, dark-forced. Entry point now lives in **Settings → Labs** (§4a) rather than a top-level route, per the rule below |
| `/deck` | Deck slide editor shell (static, `public/deck/index.html`, rewritten in `next.config.ts`). Session-gated. **Do not move it** — four vendored files test `location.pathname.startsWith('/deck')` and a Next rewrite does not change `location.pathname`; `foundry-doc.ts` uses that test to select DOCUMENT MODE, so `/app/deck?doc=` would boot an empty file-mode deck and stop saving |
| `/app/pulse/[scanId]/report` | Printable Pulse report (in-app) |

### 4a. Where a surface belongs

`/app/<name>` is for a **main product** — its own sidebar item and module permission.
Anything else gets an entry point, not a namespace:

- **A feature of a product** → surfaced inside that product. Deck sits on the Docs
  toolbar; Study sits inside Pulse; Scribe is a panel on the client detail page.
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
| **Care runs two UIs at once** | `src/components/care/` + `src/components/support/support-dashboard.tsx` | `/app/care` is the rebuilt cockpit; `/app/support` is the 5,535-line legacy dashboard. Each holds capabilities the other lacks, so it is a **two-way merge**. Legacy exclusively owns add-client, Tickets, monthly Reports (~815 lines), health scoring, AI semantic search and workflow rules; the cockpit owns triage, snooze, notes and batch actions. `client-cockpit.tsx` imports `ConnectorsView` from the legacy file, so it cannot be deleted today. (The "Care never clears `unread`" bug listed here was fixed in July 2026 — see §33.) |
| **`/app/codeclear/*` subtrees not yet moved** | `src/app/(app)/app/codeclear/` | `candidates/`, `pipeline/` and `devsignal/**` exist only under the legacy prefix; 33 refs across 10 files. When moving, rename the `/app/codeclear/devsignal` `MODULE_PATHS` entry **in place** — appending it after `/app/code` regates admin-only DevSignal onto `codeclear`, which STAFF auto-inherits. Silent privilege escalation, no compile error. |
| Cron scheduling has drifted | `vercel.json` · `docs/vps-crons.md` | `wedge-keepwarm` and `retention` are scheduled **nowhere**; `wiki-monitors` is only in `vercel.json`; the critical `jobs` worker is **missing** from `vercel.json`; three schedules disagree between the two; `foreman` is listed twice in the doc. And `vercel.json` crons are **not** necessarily inert — Vercel crons hit the deployment directly regardless of DNS, so some may be double-running. Reconcile against the live `crontab -l` before changing either. |
| `pulse-scan.ts` is 4000+ lines | `src/server/pulse-scan.ts` | Works fine — don't split without a clear plan. Future task. |
| 26 `any` type usages | various | Not breaking. Gradual cleanup is a future task. |
| Proof is built but hidden | `src/components/app-shell.tsx` | Nav item commented out. Now gated on `proposals`. `src/server/proof.ts` hands out absolute `/app/proof?…` share URLs, so any relocation needs a query-preserving stub. |
| `locals-settings` uses localStorage | `src/lib/local-settings.ts` | Account/workspace settings client-only — pre-auth artifact. |
| Backstage receipts in Postgres `bytea` | `prisma/schema.prisma` (`Expense.receiptImage/Thumb`) | Fine for now. Migrate to object storage once volume exceeds ~100 expenses or any receipt routinely > 1MB. Lifecycle: full image dropped on review, ~20KB thumb retained for audit. |
| Deleting a route is invisible to the gate | — | `npm run verify` and `next build` cannot see a removed API route: `audit:ui` walks `src/` dynamically, no test references `api/dev` or `api/cron`, and the "101 static pages" line in `checks.yml` is a comment, not an assertion. **Grep for callers by hand before deleting a route.** |

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

**Go/no-go:** was `GET /api/dev/notes-spike` — **removed July 2026** along with the other eight spent one-shot `/api/dev/*` routes, since the spike it de-risked shipped. If Drive access ever needs re-proving, the reachability logic lives in `findGeminiNotesForEvent` (`src/server/google-drive-notes.ts`).

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
  **Since July 2026 a managed subset is synced from GitHub Actions secrets by `deploy.yml`** (see §35),
  so adding or rotating those needs no SSH.
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

## 29. Recent Changes (July 2026) — Foreman (daily delivery-risk watchdog on the Desk)

A native scheduled agent that audits delivery every morning and pushes overdue / at-risk projects and
developers to admins' **On Your Desk** drawer. Modelled on the Curator (§28) — same durable-job +
cron + run-report spine — but it **only reads/aggregates** (never mutates client data), so it's safe
by construction. **Deterministic-first, anti-false-flag by design:** every flag uses the app's own
authoritative overdue rule, carries the evidence that triggered it + a concrete suggested fix, and the
agent **calls out its own blind spots** (missing due dates/timelines) as info rather than guessing.

- **Engine** — `src/server/foreman/`: `scan.ts` (batched `gatherWorkspace` + a **pure** `detectFindings`
  over clients/tasks/feature-blocks/milestones/assignees — unit-testable, no DB), `recommend.ts` (pure
  deterministic "ways it might improve" per finding kind), `narrate.ts` (**opt-in** one-shot Haiku
  narrative, cached via `getCachedAiResponse`, £0 when off/quiet), `run.ts` (orchestrator: gather →
  detect → **trend-diff vs the previous run** → optional AI → persist `ForemanRun` → dispatch digest →
  audit), `queries.ts` (status/runs/report/config + `isForemanDue`), `config.ts`/`types.ts`.
- **Detection rules** (all consistent with `getTaskAttention` / `computeClientOverdueTaskCounts`):
  overdue tasks (warn, → critical at `criticalOverdue`), slipping dated feature blocks (endDate past +
  progress<100 + has tasks; critical ≥7d), missed/imminent milestones (only when work outstanding),
  due-soon clusters ("about to be late"), unowned time-critical work; developer overdue/stalled/
  overloaded. **Never** flags an undated task, an empty client, a completed/undated/task-less block.
  Blind spots (NO_TIMELINE / NO_DUE_DATES / BLOCK_NO_DATES) are surfaced separately as info.
- **Push to the Desk** — `dispatchNotification({ event: "foreman.digest", target: {kind:"admins"} })`
  fires **only when there are real (warn/critical) risks** and it's a live run — all-clear mornings are
  silent (no false pings). New notification event + `["inApp","push"]` routing + `event-map` entry.
  Plus a dedicated **"Delivery watch"** panel on the Desk TODAY tab (`desk-foreman.tsx`, admin-only) that
  renders the frozen latest report: each risk with severity chip, evidence, suggested fix + a trend
  badge (`↑ 3→5` / `New`), and a "Blind spots" reveal. Developers are unaffected (they keep the TASKS tab).
- **Schedule** — `JobType "FOREMAN_RUN"` + handler; new **daily 09:00** cron `GET /api/cron/foreman`
  (`0 9 * * *` in `vercel.json` + `docs/vps-crons.md`) that *enqueues* a deduped job per enabled
  workspace that **hasn't run today**; the every-minute `jobs` worker drains it, so the digest lands
  just after 09:00. Manual "Run now"/"Dry run"/"Run with AI summary" execute inline via `POST /api/foreman/runs`.
- **API** (`src/app/api/foreman/*`, all `assertAtLeastAdmin` = Admins & Super Admins): `status`, `runs`
  (GET list + POST run), `config` (PATCH), `report` (GET — the Desk panel's frozen report).
- **UI** — Admin **Settings → Foreman** tab (`src/components/settings/foreman/foreman-panel.tsx`, hook
  `src/hooks/use-foreman.ts`): status + Run/Dry-run/AI-summary, latest findings, config knobs
  (`enabled`, `dueSoonDays`, `criticalOverdue`, `staleDoingDays`, AI toggle), run history.
- **Schema (additive → applies via the guarded `prisma db push`):** `ForemanRun` (per-run report:
  `findings`/`stats`/`narrative` JSON), `Workspace.foremanConfig` (+ `foremanRuns` relation), `AiModule
  FOREMAN`. No new env, no OAuth re-consent.
- **Verified:** `tsc` + `eslint` clean; `npm test` (135 tests, incl. 14 new Foreman unit tests for the
  pure detection/recommendation/config/sort logic). App is auth-gated with no local DB → **post-deploy**:
  Settings → Foreman → Dry run, Run now (check the digest lands on the Desk + ALERTS), hit
  `GET /api/cron/foreman` with `CRON_SECRET`. **Deferred:** per-developer digests (management-only for
  now), configurable notification recipients, a "why not flagged" explain view.
- **Finding resolution — dismiss / mute / bulk (follow-up).** Findings are managed rather than a fixed
  wall: new `ForemanFindingAction` model (one row per `findingKey` = `${kind}:${subjectId}`; additive →
  guarded `prisma db push`). Two actions, both reversible via "clear": **mute** hides a finding until
  un-muted (for stale/known noise — e.g. ancient imported milestones); **dismiss** hides it while its
  metric stays ≤ the value it had when dismissed, and **resurfaces if it worsens** so a real escalation
  is never lost. Applied at **read time** (`src/server/foreman/actions.ts` — pure `findingState` /
  `visibleFindings`, unit-tested), so it takes effect immediately without a re-run: the Desk report,
  the Settings findings list, the digest notification and the AI narrative all filter through it (raw
  findings are still persisted on the run so un-muting reveals them). API `GET/POST /api/foreman/findings`
  (admin; bulk `{ findingKeys[], action }`); hooks `useForemanFindings` / `useForemanFindingAction`.
  UI: per-finding Dismiss/Mute on the Desk "Delivery watch" cards, and a Settings → Foreman **Findings**
  manager (select-all + bulk Dismiss/Mute, per-row actions, and a "Muted & dismissed" reveal to Restore).

## 30. Recent Changes (July 2026) — Deck (the slide editor, forked from bento/slides)

**Deck** is Foundry's own slide editor, opened in its own window from a small link on HQ and the
Docs toolbar. It is a **fork of the MIT [`nyblnet/bento`](https://github.com/nyblnet/bento)
slides app** (vendored at commit `f871720`, *Release v1.0.9*), wrapped in `DESIGN.md` and given
the Foundry · Gitwork brand switch. **No Foundry data touches it** — it's a local editor.

- **Why a separate window, not a Docs route.** A Bento file *is* the app: the built HTML carries
  the runtime **and** the document in one file, and ⌘S rewrites that file in place (no server, no
  DB row, no export step). There's nothing to render inside the `/app` shell, so Deck is a
  standalone shell served from `public/deck/index.html`, linked with `target="_blank"`. This is
  distinct from **Presentation Mode** (§17 / DESIGN.md), which presents an existing *document*.
- **Vendored source — `vendor/bento/`** (`slides/` + the `kernel/` it imports + one build script;
  upstream's site/server/spaces/plugins are not vendored). `vendor/bento/README.md` is the
  provenance + re-sync runbook. **All Foundry code is additive in `slides/src/foundry/`**
  (`brand.ts` · `theme.css` · `boot.ts` · `starter.ts` · generated `fontdata.ts`); every edit
  inside an upstream file is a marked one-liner — `grep -rn "FOUNDRY:" vendor/bento/slides`.
  `vendor/**` is excluded from the root `tsconfig`/`eslint` (it has upstream's own toolchain) and
  `vendor/**/node_modules` is gitignored.
- **Build + serve.** `npm run deck:install` once, then **`npm run deck:build`** → a single-file
  Vite build (compressed self-extracting shell, ~725KB) written straight to
  **`public/deck/index.html`, which IS committed**. Next serves it from `public/`, so shipping
  Deck needed **no Docker, CI or schema change**. ⚠️ Change anything under `vendor/bento` → run
  `deck:build` and commit the rebuilt shell in the same commit, or prod keeps the old one.
  `npm run deck:dev` gives the vite dev server on :5173.
- **Routing + auth.** `next.config.ts` rewrites `/deck` → `/deck/index.html` (a static shell isn't
  a Next route, so bare `/deck` would 404) and now pins **`outputFileTracingRoot`** to the repo dir
  — the vendored app brings a second `package-lock.json`, and with more than one lockfile Next only
  *infers* the workspace root, which would change what a `standalone` build traces in. `src/middleware.ts` gates `/deck**` **exactly like an
  `/app` page** (NextAuth session + `SESSION_VERSION`), via `isDeckPath()` folded into the same
  clause — **no module gate**, since Deck holds no workspace data, so any signed-in member can
  open one. Verified: unauthenticated `/deck` → 307 `/login?callbackUrl=/deck`.
- **Entry points (deliberately quiet while it's in testing).** A mono `· DECK ↗` text link in the
  HQ context strip (`app-overview.tsx` → `DeckLink`) and a `Deck` secondary button beside
  Analytics on the Docs list toolbar (`proposal-list.tsx`). No sidebar item, no bento tile.
- **Brand — Foundry · Gitwork** (`slides/src/foundry/brand.ts`, the single place product identity
  lives; renaming the product is one line). Precedence: `?brand=` → **the deck's own theme** → the
  remembered choice → Foundry. A segmented control in the topbar flips it **live with no reload**
  (nothing unsaved is ever lost): it re-skins the chrome, re-declares the kernel app identity
  (window-title suffix + save-picker label — `applyBrand()` re-calls `configureApp()`, which is why
  upstream's call site moved out of `main.ts`), re-renders the wordmark, and **re-themes the deck
  while it's still on brand defaults** — paper/ink/accent + an untouched chart palette move,
  hand-picked colours don't; one `store.commit`, so ⌘Z undoes it. It repaints, it does **not**
  rewrite text baked into a deck (a footer wordmark stays as typed). The control needs room, so it
  only renders **≥1560px** (measured: below that the flex topbar squeezes the deck-title field
  220px→118px) — `?brand=gitwork` still forces either brand at any size.
- **A saved deck brings its brand with it** — `adoptDeckBrand()` on boot: a document whose theme
  exactly matches a brand's is opened in that brand's chrome, so a Gitwork deck sent to someone
  opens in Gitwork whatever their own last choice was. **Not** via `<html data-brand>` — the save
  snapshot is cloned at boot (`capturePristine`), so that attribute always carries the brand the
  window OPENED in, never the one the deck was saved in (tried it; it silently did the wrong thing).
- **Design skin** — `slides/src/foundry/theme.css`, imported after upstream's `styles.css`. Token
  swap + the house grammar upstream can't express: the mono **`NN // SECTION` widget header** on
  the props rail (a **CSS counter**, so numbering stays sequential as the rail re-renders),
  de-pilled chrome (upstream ships `999px` on the zoom bar, chip bar, present pill, toasts), 6px
  controls / 10px cards, brand focus rings, and Gitwork Blue on every interactive state. See the
  new **DESIGN.md § "Deck"** for the full spec incl. the per-brand token table.
- **Typography is embedded, not linked** — Inter · JetBrains Mono · DM Serif Display latin woff2
  base64 in `foundry/fontdata.ts` (generated by `vendor/bento/scripts/refresh-brand-fonts.mjs`,
  `npm run fonts:refresh`), following upstream's own `fontdata.ts` precedent: a Bento file must
  make **zero external requests**, so a saved deck keeps its typography offline. All three are
  OFL-1.1 and are recorded in `THIRD_PARTY_NOTICES.md` (MIT/OFL notices must keep travelling with
  the shell — the `NOTICE` block in `index.html` is carried into every saved deck; don't strip it).
- **Starter deck** — `foundry/starter.ts`: five on-brand slides (mono eyebrow + accent rule, serif
  headline, stat tiles, a live chart, morph transitions, speaker notes) that wear the active brand.
  Upstream's own product tour is untouched and still reachable at `/deck?demo=bento`.
- **Upstream update checks are off** — the launch check would hit `bento.page` for a manifest
  signed with a key we deliberately don't hold. `silenceUpstreamUpdateChecks()` sets it off once
  (so anyone re-enabling it in the About dialog keeps their choice); `manifestUrl` points at
  `/deck/manifest.json`, which is not published — this shell updates when Foundry redeploys.
- **Optimised (second pass).** The shell went **726KB → 504KB (−31%)**, and with it every saved
  deck (837KB → 620KB), because a Bento file carries the app:
  - **English only** (`src/i18n.ts`) — the 7 translation catalogs were **171KB, 25% of the shell**.
    The single-file build forbids lazy-loading (zero external requests is the format's contract), so
    it's all-or-nothing; Dan chose English-only. The catalogs stay in the tree, just unreferenced so
    rollup drops them, and `languageDropdown()` hides the globe while there's one locale — restoring
    all 8 is putting the imports back.
  - **Upstream's demo deck dropped from the shipped shell** (−52KB: a 1000-line tutorial + an
    embedded Instrument Sans face) — it only ever served a developer comparison. `starterdeck.ts`
    stays in the tree; swap the `foundryStarterDoc()` call to `starterDoc()` under `deck:dev` to see it.
  - **Boot: 2.2s → ~0.55s on repeat opens.** The brand-moment splash held *every* open to 1250ms +
    a 550ms fade while the editor was interactive at ~350ms. It now plays in full **once per browser**
    (upstream's own slideshow-hint idiom) and afterwards clears as soon as the editor is up, on a
    180ms fade (`#bento-splash.fd-quick`). First open is unchanged.
  - **`Cache-Control: public, max-age=60, must-revalidate`** on `/deck/:path*` — Next serves `public/`
    at `max-age=0`, so every open paid a revalidation round trip for a file that only changes on
    deploy. Cache-Control only; `/deck` already matches the catch-all security-header rule, and
    re-listing those would send each header twice.
  - **`.dockerignore` now excludes `**/node_modules`** — the bare `node_modules` entry only matched
    the top level, so the vendored app's own ~80MB install was going into the build context.
  - gzip on the wire (**726KB → 547KB**, and 504KB → ~390KB now) is an **nginx** setting, which was
    outside this repo until the VPS config was checked in. `gzip on` is now set in
    **`deploy/nginx/foundry.conf`** — but that file is a checked-in mirror, not a deployed one: it
    only takes effect once someone copies it up and reloads nginx (see `deploy/nginx/README.md`).
- **Every upstream accent swept out of the chrome.** Upstream drives most of its UI from `--accent`,
  but hard-codes its coral/amber in places the token swap couldn't reach — so re-pointing the token
  left them bento-coloured. Now brand-correct: the About primary, the update chip (needs
  `!important` to beat upstream's), the player + unlock buttons, the live-reader dot **and its pulse
  keyframe** (re-declared), the recovery banner, `accent-color` on checkboxes, the Slideshow
  first-run "runner" comet, **present mode** (reveal's `--r-link/selection/progress-color` + the
  click-target outline now follow `--bento-accent`, i.e. the DECK's accent — so a Gitwork deck
  presents in purple), and the **speaker view** (its own popup window, painted with a copy of these
  styles, so it gets `--fd-speaker-accent` — a mid blue/violet, because `#1D4ED8` on near-black is
  why upstream reached for amber).
- **Responsive (per `docs/mobile-playbook.md`).** Upstream's topbar is one nowrap flex row of ~38
  controls, so below the desktop split it overflowed and took the page with it — **+292px of
  horizontal page scroll at 390px, +19px at 768px, in upstream's own build too**; our wider lockup
  made 768 worse (+33px). Fixed by **wrapping** below 1024px, not scrolling or clipping:
  `overflow-x:auto` on the bar would make it a scroll container and clip the dropdown menus that
  live inside it, and `overflow:hidden` would just hide controls. Our lockup also yields first — the
  `DECK` tag hides ≤1359px, handing ~40px back to the deck-title field on a 1280 laptop (upstream
  squeezes it to 100px there; ours is 179px). Verified clean at **390 · 430 · 768 · 1023 · 1024 ·
  1280 · 1440 · 1600**: no page H-scroll, no clipped control, canvas + Slideshow reachable at every
  width, and the `NN // SECTION` strip stays a 36px full-bleed band.
- **Clipping audit — `scripts/audit-clipping.mjs` (`npm run audit:clipping <url>`).** Dan's standing
  complaint was UI that's present but cut off, found by hand. This walks every rendered element at
  four viewports for the five ways content goes missing: `CLIPPED` (an ancestor's overflow cuts it
  and that ancestor **cannot scroll**), `OFFSCREEN` (fixed panel past the viewport), `COLLAPSED`
  (text in a zero-size box), `TRUNCATED` (ellipsed with no `title` **and** no scroll), `PAGE-X`
  (sideways page scroll — **and it names the offending element**). `--self-test` renders deliberately
  broken markup and asserts every kind still fires plus that three lookalikes stay quiet — run that
  before trusting a clean report. Full contract in **`docs/mobile-playbook.md` §3a**, which is now
  step 5 of the standard responsive process. Two rules it encodes, both learned here:
  **`overflow:hidden` is not scrollable** (the browser reports `scrollWidth` past the box either way,
  so testing that alone excuses the commonest way UI vanishes) and **`innerWidth` lies on mobile**
  (browsers widen it to fit overflowing content, so it claims nothing is past the edge while the user
  scrolls sideways — measure `documentElement.clientWidth`).
  - **Deck: clean across 8 editor states × 4 viewports** (dialogs, popovers, full props rail, present
    mode; 1280×620 included because a short laptop viewport is where dialogs run off the bottom).
    Wired into `npm run deck:verify` as group 05.
  - **Two pre-existing app defects found and fixed** (both public pages, neither caused by Deck):
    `/api-docs` endpoint rows clipped the path and hid the **"Auth required" badge entirely** on a
    phone — up to 185px unreachable, because the header was a nowrap flex row inside a card with
    `overflow:hidden` and the path couldn't shrink (`min-width:auto` is the flex default). Fixed with
    `flex-wrap` + `min-width:0` + `overflow-wrap:anywhere`, and `.endpoint-body` now scrolls so param
    tables aren't cropped. `/context`'s module-map table forced the page **90px wider than a phone**
    (playbook §2: tables scroll, they don't reflow) — now in an `overflow-x:auto` wrapper; the Deck
    row I added in this PR is the longest one, so I'd made it worse.
  - Verified clean afterwards: `/api-docs`, `/context`, `/pulse-overview`, `/login`, `/embed/pulse`
    at 390 · 768 · 1280×620 · 1440. **`/app` pages remain unreachable** (auth-gated, no staging) —
    point the script at them the day staging exists.
- **`vendor/bento/scripts/verify-shell.mjs`** — the regression gate for a vendored fork whose skin
  works by *overriding* upstream: it drives the built shell in headless Chromium and checks every
  control, both brands for accent leaks (incl. present mode), the five responsive bands, and a
  save → reopen-from-disk round trip. Needs `npm i --no-save playwright-core` (not a repo dep, and
  not in CI — no browser there). **Run it after every upstream re-sync and after any `theme.css`
  change.** Two things it already caught: "New slide" is a *layout picker*, not an insert button
  (an earlier assertion was simply wrong about the contract), and `setContent()` can't boot a saved
  deck (the shell needs a real document origin for its blob-URL runtime).
- **Verified:** vendored `tsc -b` clean; root `tsc --noEmit` + `eslint` clean; `npm test` 135
  passing; `next build` clean; `verify-shell.mjs` fully green; headless-Chromium smoke tests of the built shell — both brands boot
  with no console errors, all four faces load, the brand switch re-skins + re-themes + undoes,
  present mode runs, a saved deck round-trips and reopens in its own brand, the topbar holds at
  1600/1440/1366/1280, and `/deck` gates to `/login` unauthenticated. Two bugs were caught this way
  rather than shipped: `injectBrandFonts()` ran *before* `capturePristine()` (would have baked
  ~190KB of duplicate font CSS into every saved deck), and the first cut of "a saved deck remembers
  its brand" read `<html data-brand>`, which is frozen at boot.
- **It knows who you are (July 2026 follow-up).** Upstream has no accounts — your name is whatever
  you type into the share panel, defaulting to **"Guest"**, which is what the People list showed.
  `slides/src/foundry/identity.ts` asks Foundry: one `GET /api/account` (the same session that gated
  `/deck`), cached, seeding upstream's own `bento-author` key so the share panel, **presence** and
  **comments** all name the signed-in user with no further patching — and comments stop prompting
  for a name. Two hard rules in the code: it **only calls out when served from the `/deck` path on
  http(s)** (a saved deck, or one someone re-hosted, makes **zero requests** — the format's contract,
  and now a checked one), and it **never overwrites a name you typed** (it only replaces a value it
  seeded itself).
- **De-wrappered (same pass).** Things that still said bento to the user: the About dialog carried
  upstream's product promo ("New to Bento? Find templates, the gallery…") and linked to bento.page;
  Help linked out to **bento.page/help**; the logo tooltip said "About bento/slides"; a tip said
  "another Bento deck"; saves were named `.bento.html`. Now: About states what Deck is and credits
  **bento/slides (MIT)** with a link to the repo — the credit we owe, not marketing for another
  product; Help ends on the one thing worth saying about the format; saves are `<title>.deck.html`
  (the FORMAT is unchanged — identity is the embedded JSON block, not the extension). The dead
  update UI ("Check for updates", launch-check toggle) is hidden: we publish no manifest, so it could
  only fail. **Offline mode stays** — it still governs collaboration. The About footer's claims were
  corrected to match reality (checks off; the embedded faces are Inter/JetBrains Mono/DM Serif
  Display + Fraunces — Instrument Sans left with upstream's demo deck, confirmed against the
  uncompressed bundle, and `THIRD_PARTY_NOTICES.md` says so).
- **The palette sweep, done properly.** The first pass chased the coral/amber hexes I'd seen. This
  one **enumerated every hardcoded colour in `styles.css`** (60 of them) and mapped the visible
  chrome: share status (goldenrod → `{colors.warning}`), live dots (brass/sea-green → warning/
  success), every error red → `{colors.danger}`, upstream's cool blue-grey scale → the Foundry
  slate scale, and the whole **speaker view** dark palette → the sanctioned navy set. `verify-shell.mjs`
  group 02 now greps for **all thirteen** of upstream's literals, not four.
- **Two layout defects Dan hit that the audit could not see.** A native `<select>` renders its
  chevron *inside* the box: at upstream's 110px the value ran underneath it ("Widescreen 1⌄"). Fixed
  with `appearance:none` + our own inset chevron, and — per DESIGN.md's rail rule ("fields are never
  crammed horizontally") — rows holding a select or text input now **stack**, label above a
  full-width control, while numeric pairs and colour swatches stay inline. The share panel's People
  row laid name + role + key fingerprint on one nowrap line, ellipsing the *name* ("Guest (y…") while
  showing 14 characters of key; it now stacks the person over a mono role/fingerprint readout.
  **Neither was caught by `audit-clipping.mjs`** — it treats `<select>` and `title`-bearing text as
  recoverable, which is right in general and blind here. Screenshots still beat a detector for
  "this looks wrong"; the detector is for "this is unreachable".
- **`DECK` tag dropped from the wordmark** — the lockup is the mark + `Foundry` (or the "G." +
  `Gitwork`). The window title already names the app.

### Deck — pass 3 (July 2026): it's a Foundry product, not a re-skinned fork

Dan's charge was that the previous passes still read as a wrapper. This one removes the last of
upstream's *product* (as opposed to its engine) and finishes wiring Deck to the platform.

- **Dark mode — Deck follows Foundry's own setting.** Upstream has one fixed light palette.
  `slides/src/foundry/theme-mode.ts` reads the SAME `localStorage` key the platform's
  `ThemeProvider` writes (**`gitwork.theme.v1`**, `system|light|dark`) and stamps the same
  `<html data-theme>`; it keeps listening on `storage` + `prefers-color-scheme`, so flipping the
  toggle in a Foundry tab moves the Deck window live. Dark tokens are a second block in
  `theme.css` (`:root[data-theme='dark']` + a Gitwork variant), taken from `globals.css`. **Two
  boundaries**: only the CHROME flips — the **artboard keeps the deck's own paper**, because that's
  the document (a dark editor around a light page, like every design tool); and it's a storage
  read, never a network one, so a **saved deck honours it offline** without touching the
  zero-external-requests contract. Accent lifts to `#6BA0FF` / `#A99BFF` on dark — `#1D4ED8` on
  near-black fails contrast. Elevation on dark is tone, not shadow.
- **The MIT credit is out of the UI, by Dan's explicit consent — the licence still travels.** The
  About line used to read "Built on bento/slides (MIT)". MIT requires the notice be retained in
  copies; it does **not** require a visible in-app credit. The `NOTICE` block at the top of
  `index.html` is carried verbatim into the built shell **and into every saved deck** (verified,
  and now asserted by `verify-shell.mjs`), and the repo keeps `LICENSE` +
  `THIRD_PARTY_NOTICES.md`. **Do not strip the NOTICE block, and do not re-add a credit paragraph
  to the dialog** — that combination is the whole basis for this being compliant.
- **The `?` button and the "Shortcuts & tips" overlay are gone** — removed at the source
  (`openHelp` deleted, the `?` key left unbound), not hidden. Every shortcut it listed is already
  on the tooltip of the control it belongs to.
- **The topbar's first slot is now `← Foundry`** (`mountHomeSlot`, `foundry/boot.ts`) linking to
  `/app` — a window with no sidebar needs an exit more than a wordmark. It says *Foundry* under
  both brands (the destination is the platform). A **saved deck** shows the inert lockup instead:
  same `servedByFoundry()` test as identity, so a file on someone's disk never renders a dead link.
- **About is now THE standard Foundry popup** — `foundry/about.ts`, built to DESIGN.md's
  "fixed-height two-column popup" and matched against the React reference
  (`starter-versions-modal.tsx`): 768px, 36px widget-header, a body that is **always 460px**,
  `minmax(0,300px)/minmax(0,1fr)`, hairline divider, pick-left/read-right, focus trap + Escape.
  Three sections — **About** (what Deck is, build/format), **Document** (the `{{author}}` merge
  fields), **Privacy** (offline mode). Reached from **Save ▾ → Deck settings & about…** now the
  logo is a back link. Collapses to one column below 720px.
- **The launch update-check is deleted, not hidden** — we publish no manifest, so it could only
  fail; removing the call also drops a pointless fetch at every boot.
- **Bug found and fixed:** the CSS that hid the update UI was `.ed-about-row:has(> button)
  { display:none }` — too broad. **"Replace from JSON…" builds its Apply/Cancel row with the same
  class, so that dialog shipped with no visible buttons.** The rule is gone (the update UI is
  removed at source instead) and `verify-shell.mjs` now asserts those buttons are visible.
- **The Bento name and icon are gone from the product entirely (Dan's call, stated twice).**
  - **Icon:** the topbar/About/splash marks are **deleted, not replaced** — "no logo anywhere other
    than the favicon". Identity in the chrome is the words *Foundry Deck*. The **favicon** is the
    platform's own disc, byte-identical to `src/app/icon.svg` (`#4F46E5`); `applyFavicon()` in
    `foundry/boot.ts` swaps it for the Gitwork disc under that brand. What was there before was
    upstream's tile triptych repainted blue — the single most recognisable thing about the app this
    is forked from. **Do not add a mark back into the chrome.**
  - **Name:** every runtime identifier was renamed `bento-*` → `deck-*` (41 of them across 21 files:
    CSS classes, DOM ids, custom properties, `localStorage` keys, the sync channel), plus
    `window.bento` → **`window.deck`**, the clipboard tag `__bento` → `__deck`, and the
    `<meta generator>`. Three carry **read-both compatibility** because they live inside saved
    files: the data block `#bento-doc` → **`#deck-doc`**, its MIME
    `application/bento+json` → **`application/foundry-deck+json`**, and
    `FORMAT 'bento/slides'` → **`'foundry/deck'`**. A deck written before the rename still opens
    (`LEGACY_BLOCK_ID` / `LEGACY_FORMAT`) and is migrated forward on its next save.
  - **The one exception, and it is not optional:** the **MIT `NOTICE` block** and the per-file SPDX
    headers keep the name, because MIT requires the copyright line be retained in copies and the
    copyright holder is literally *"The Bento authors"*. Removing it would be a licence breach, not
    a branding win. **New group `08 // NO UPSTREAM NAME`** asserts exactly this pair on the BUILT
    shell: the NOTICE is present, and stripping it leaves **zero** "bento" occurrences in the
    artefact that ships (and therefore in every saved deck) — plus that the favicon matches
    `src/app/icon.svg` and contains no tile/rect.
- **`verify-shell.mjs` grew groups for all of it** — help-is-gone, the back link (and that a saved
  deck does *not* render one), the About dialog's exact 768/460/2-col geometry + that it doesn't
  resize between sections, "no MIT/bento string anywhere in the chrome **but** the NOTICE is still
  in a saved file", the Replace-from-JSON regression, and a new **07 // DARK MODE** group checking
  both modes, ≥4.5:1 topbar contrast, that the artboard does *not* follow, and that a `storage`
  event from another tab reaches the window.
### Deck — pass 4 (July 2026): templates, and two radius bugs the audit couldn't see

- **Ten templates** — `slides/src/foundry/templates.ts`. Five **Foundry / delivery** (kickoff,
  sprint review, monthly client report, technical approach, discovery readout) and five
  **Gitwork / sales** (new-business pitch, developer talent, build proposal, case study, retainer).
  Each is a `(Brand) => Slide[]`, so the same structure wears Foundry blue/DM Serif or Gitwork
  purple/Fraunces and the topbar switch re-themes it live. Built from a small slide vocabulary
  (`cover` · `points` · `figures` · `columns` · `chartSlide` · `closing`) over the starter deck's
  own helpers — `chrome`/`heading`/`statTile` are now exported from `starter.ts` rather than
  re-drawn. **No invented proof:** every metric is a visible placeholder (`00`, `[client]`, `£[n]k`)
  with a prompt in the speaker notes, so an unfilled sales deck looks obviously unfinished rather
  than plausibly wrong. The only real claim used is Gitwork's own public line, *"From prompt to
  production"*.
- **Picker** — `foundry/template-picker.ts`, reusing the `.fd-dlg` shape wholesale, because
  DESIGN.md names this exact case ("reach for this shape before inventing a new layout for any
  pick-one-of-a-list-and-inspect popup"). Save ▾ → **New from template…**; list grouped
  Delivery/Sales, right pane shows the blurb, slide count, full outline and a "Have ready:" line.
  Applying goes through `store.replaceDoc`, so it is **⌘Z-undoable**. Also deep-linkable:
  **`/deck?template=<slug>`** (empty shell only — a saved deck always wins, so a stray link can
  never replace someone's work; an unknown slug falls back to the starter).
- **Two radius bugs, both from a CSS specificity trap, neither visible to any existing check.**
  Our de-pilling rule is a bare `.ed-btn { border-radius: 6px }` (0,1,0) that loads *after*
  upstream. Upstream writes its **partial** (split-control) radii at (0,1,0) and (0,2,0):
  - `.ed-split-caret` (0,1,0) **lost** → the Save caret got 6px on all four corners while its Save
    half kept `8px 0 0 8px`. Mismatched corners at the seam is what reads as the button's right
    edge being cropped — **Dan spotted this from a screenshot; the clipping audit cannot see it**,
    because nothing is actually clipped.
  - `.ed-pill-main` / `.ed-pill-caret` written in `theme.css` at (0,1,0) **lost** to upstream's
    `.ed-present-pill .ed-pill-main` (0,2,0) — so **the present pill was still a literal 999px
    pill**, and DESIGN.md's "no pills … present pill" claim was simply untrue for the one control
    it named. Both now written at (0,2,0). Measured after: `6px 0 0 6px` / `0 6px 6px 0` and
    `10px 0 0 10px` / `0 10px 10px 0`.
  - **New gate `02b // INSTRUMENT GEOMETRY`**: fails on any chrome control with a radius ≥100px
    (status dots excepted by size), and on split halves that are rounded on the seam side,
    disagree on their outer radius, differ in height, or leave a gap. Radius is invisible to the
    clipping audit and to every behavioural check — it needed its own assertion.
- **Deferred / notes:** nothing links a saved `.deck.html` back to a Foundry document or client
  yet (decks live as files — Drive/Docs attachment is the obvious next step); no PDF/thumbnail
  capture into Docs; no `manifest.json`, so in-app "update" is a redeploy; collaboration (bento's
  CRDT + relay) is untouched and unused; and the product name is one constant in `brand.ts` if
  "Deck" isn't the final call.

## 31. Recent Changes (July 2026) — The build gate: CI on PRs + a static UI-standards audit

Dan's standing pre-access checks (responsiveness, padding in text boxes, chevrons too close to the
right, mobile optimisation, low token usage, general best practices) were **documented but almost
entirely unenforced**. This closes that, so a new builder in the workspace hits a gate rather than
a code review.

**The headline gap: there was no CI.** `.github/workflows/deploy.yml` was the *only* workflow and
it triggers on **push to `main`** — straight to build → GHCR → VPS. Nothing ran `tsc`, `eslint` or
the tests on a branch or a PR. New **`.github/workflows/checks.yml`** runs on `pull_request` +
push to `main` + `workflow_dispatch`: `npm ci` → `db:generate` → `tsc --noEmit` → `lint` → `test`
→ `audit:ui --self-test` → `audit:ui` → **`npx next build`**, with `concurrency`
cancel-in-progress.
⚠️ **It calls `npx next build`, never `npm run build`** — the npm script runs `prisma db push`
first and would mutate whatever `DATABASE_URL` it was handed. Bare `next build` was verified to
compile and prerender all 101 static pages with **no database**, so CI gets the RSC-boundary and
static-generation coverage `tsc` can't give without any DB access. (Nothing here touches Vercel —
it hasn't been in the deploy path since §23.)

**New static audit — `scripts/audit-ui-standards.mjs` (`npm run audit:ui`).** The companion to
`audit-clipping.mjs`: that one drives a real page, which makes it the better detector, but **every
`/app` page is auth-gated with no staging environment**, so the screens where most of these defects
actually live had no gate at all. This one reads **source** (1380 files), needs no browser or
server, and covers the gated screens. Seven rules, each a defect that has really shipped here:
`SELECT-CHEVRON` (native OS chevron with no reserved padding — the Deck bug from §30) ·
`SELECT-PAD` (`app-select-chevron` under `pr-6`, so the value sits under the arrow) ·
`TEXTAREA-PAD` (horizontal padding only → first line flush to the top border) · `INPUT-PAD` ·
`FIXED-WIDTH` (unprefixed `w-[≥380px]` with no cap/scroller/desktop-guard → `PAGE-X` on a phone) ·
`TABLE-SCROLL` (a table that *cannot shrink* with no scrollable ancestor; `overflow-hidden` is not
a scroller) · `MODEL-LITERAL` (hardcoded model id in server/API code).
It has a **`--self-test`** (like the clipping audit) asserting every rule fires on the defect **and
stays quiet on the fix** — run it before trusting a clean report. Also `--rule=`, `--warn-only`.

**Writing the rules found more bugs in the rules than in the app, which is the point.** The first
pass reported 28 findings; 25 were false positives and each one taught the rule something:
`className="…"` plain strings weren't being parsed at all; `\bw-\[` also matched inside
`min-w-[…]`; a prose `<select>` in a *comment* read as markup; `border-0` satisfied a
"draws its own border" test; and `overflow-x-auto` ancestors, `max-w-[94vw]` caps and
`hidden lg:block` desktop-only markup were all legitimate and being flagged. Ancestor state matters
too: `.endpoint-body { overflow-x: auto }` on `/api-docs` is a real scroller declared in CSS, not
Tailwind, so the audit now collects CSS-declared scroller classes and honours them.

**Real defects found and fixed (3):** two `<select>`s in `starters/starter-form.tsx` and the
sync-interval `<select>` in `support-dashboard.tsx` were bespoke fields with **no chevron
treatment** — native OS arrow, no reserved right padding. Fixed with `app-select-chevron` + `pr-9`
/ `pl-2 pr-6`, matching the correct precedent already in `support-dashboard.tsx` (the ticket-status
dropdown). Audit is now clean at 0 findings.

**Token usage: audited, and already in good shape — nothing invented.** `completeText()` already
marks every system prompt `cache_control: ephemeral`, `tier: "light"` routes to Haiku, and
`ai-cache.ts` / `ai-usage.ts` / `ai-cost.ts` / `ai-pricing.ts` cover response caching, usage and
cost. Of 15 Anthropic call sites, the 5 that looked uncached were: 2 in `fix-agent.ts` that pass
`cache_control` **via a variable** (and add rolling `withPrefixCache` on the tool loop — the
exemplar), and 3 whose system prompts measure **~124–446 tokens, far below Anthropic's ~1024-token
minimum cacheable length**, where `cache_control` would be a literal no-op. `proof/analyse` already
wraps its call in a workspace response cache keyed on the brief hash. **No caching changes were
made**, because none would have saved a token.

**The one real AI-cost drift risk, fixed:** the handbook and §8 both say fallback models live *only*
in `DEFAULT_MODELS` (`ai-provider.ts`), but the literals were **duplicated across 29 sites in 10
server/API files** (`?? "claude-sonnet-5"`, `?? "gpt-4o"`, `?? "gemini-2.0-flash"`,
`?? "llama3.1"`). Bump the table and every one of those silently keeps the old default. All now
import `DEFAULT_MODELS`; `MODEL-LITERAL` keeps it that way. Its scope excludes the places a
model-shaped string is *data* — `ai-pricing.ts` (rate card), `api/settings/models/` (its `gpt-4` is
a prefix filter for OpenAI's catalogue), `pulse-checks/` (sniffs these names in scanned HTML) and
`starters-catalog.ts` (`claude-*` slugs are tags/build refs) — each exclusion commented with why.

**Docs:** new **[`docs/build-checklist.md`](docs/build-checklist.md)** — the one-command gate, a
table of every rule and its rationale, what the audits *can't* see (radius mismatches and cramped-
but-recoverable controls are screenshot findings), verification honesty (no staging, no branch
previews, `/app` can't be self-screenshotted), and the AI cost rules. `docs/mobile-playbook.md`
gained **§3b** for the static audit and a step 6 in its process. This file's header now points at
the checklist.

**Deferred / notes:** the clipping audit stays manual for `/app` until a staging environment
exists (it needs a reachable page and those are auth-gated). **~8 hand-rolled field
class constants** (`inputCls` / `fieldInput` / `brandInputClass` / `inputClass` in `wiki/*`,
`starters`, `onboarding/brand.tsx`) all have correct `px-3 py-2` padding but diverge cosmetically
from `app-input` (different radius, border token, focus ring) — consolidating them is a real
consistency win but touches screens that can't be visually verified pre-merge, so it was left as a
follow-up rather than done blind.

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
| `{{Product}}` | A top-level module — its own sidebar item and route | **Pulse · Care · Docs · Code · Studio · Portal · Provenance** |
| `{{Feat}}` | A feature inside, or spanning, the products | **Dispatch · Deck · Starters · Wiki · DevSignal · RoundUp · Demo · On Your Desk · Settings · MCP · Calendar · Dashboard · Handbooks · Analytics · Notifications · Launchpad** |
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

## 33. Recent Changes (July 2026) — Backend cleanup: the /app gate defaults to deny, Care clears unread

Three items that had been sitting in §11 as known defects, plus recovery of work that was lost
when the orphaned history was reattached to `main`. No schema change, no new env, no new route.

**The `/app` module gate is now default-deny, anchored, and unit-tested.** `hasModuleAccess` moved
out of `src/middleware.ts` into **`src/server/auth/module-gate.ts`** — a pure module with no
NextAuth or edge-runtime imports, so it can actually be tested (importing the middleware into a
Node test can't work). Three real changes came with the move:

- **It no longer ends in `return true`.** Any `/app` path matching neither `MODULE_PATHS` nor the
  new **`UNGATED_APP_PREFIXES`** allow-list is now **denied** for non-admins. The old default is
  precisely how `/app/proof`, `/app/templates` and `/app/projects` were reachable by any signed-in
  member — including a developer scoped to neither module — because nobody has to *decide* to
  expose a page, they get it for free by adding a directory. Adding a page under `/app` now means
  picking one of the two lists on purpose; miss both and it redirects to `/app`, a visible failure
  at first click instead of a silent hole. `UNGATED_APP_PREFIXES` holds the six genuinely-open
  surfaces (`settings`, `account-settings`, `team`, `handbook`, `analytics`, `starters` — the last
  two self-gate on Super Admin).
- **Prefix matching is anchored on a path-segment boundary** (`matchesPrefix`), the same guard
  `isPublicApiPath` already had. A bare `startsWith` meant `/app/code` would gate a hypothetical
  `/app/codex` on `codeclear`. It also meant `/app/code` incidentally covered `/app/codeclear`, so
  the legacy prefix now needs — and has — **its own explicit `MODULE_PATHS` entry**. The DevSignal
  ordering hazard is unchanged and still first in the list.
- **`src/server/auth/__tests__/module-gate.test.ts`** (13 tests) asserts the lookalike cases, that
  DevSignal stays on its admin-only perm rather than STAFF-inherited `codeclear`, that an unknown
  `/app` path is denied, and — the useful one — that **every `/app` route segment resolves to a
  decision in one of the two lists**. Add a page without gating it and that test fails.
  ⚠️ It caught a real bug in the first cut of this file: a `"/app"` row in `UNGATED_APP_PREFIXES`
  matched every descendant path and quietly turned the default-deny back into a default-allow.
  `/app` is now an exact-match constant (`APP_ROOT`) for that reason — **keep it exact.**

**`assertSuperAdmin` is strict; the lenient behaviour has its own name.** It used to take
`EffectiveUser | null` and pass a null caller straight through, so "Super Admin only" actually read
"Super Admin, **or anyone holding the workspace API_KEY**" — deliberate for unattended server
integrations, but invisible at the call site and trivially inherited by copy-paste. It now takes a
**non-null** `EffectiveUser`, so passing a possibly-null user is a **compile error**, and the
lenient path is spelled **`assertSuperAdminOrApiKey`**. Only the five `/api/dev/seed-*` demo-seed
one-shots use the lenient one (they're invoked unattended). Every other call site already resolved
its user via `requireAuthedUser` and was strict in fact — it just didn't look it. No behaviour
changed for any existing route.

**Care clears `unread` when you open a conversation.** The cockpit rendered the flag (bold subject)
and the client-list badges counted it, but **no code path ever wrote `false`**, so the counters only
ever grew for anyone working in Care. New **`useMarkConversationRead`** in `use-support.ts` —
optimistic, reusing the existing `patchConversationInCache`, so the row de-bolds on the click that
opened it rather than a request later; it also invalidates `["support","clients"]` because the badge
count is derived server-side. Wired through a single `openConversation()` in `client-cockpit.tsx`
(one open path, so no effect needed), guarded on `conv.unread` to skip pointless writes and on
`canManageSupport` because the PATCH route asserts it — without that guard a read-only Care viewer
would take a 403 per open and watch the row re-bold as the optimistic patch rolled back. Server side
needed nothing: `updateConversation` already had `unread` in its allow-list, and the legacy dashboard
has always done this (`support-dashboard.tsx`). No saved view predicates on `unread`, so marking read
never reorders the row under the cursor.

**Recovered three commits the history reattachment closed without merging.** Reattaching the
orphaned lineage with `git merge -s ours` kept `main`'s tree byte-identical but made 9 open PRs
ancestors of `main`, so GitHub's ancestry-based merge detection **closed them and auto-deleted their
branches while none of their code landed**. Checking each: **#43, #37, #222, #255 and #140 were
already in `main` or moot**; three were genuinely missing and are cherry-picked here — the
`fix(care)` Gmail-UNREAD-preservation fix (**#202**), the checked-in VPS nginx config + proxy-buffer
502 fix (**#332**), and the IMAP/SMTP mailbox-connector build plan (**#432**). Head SHAs for all
nine are recorded in `docs/pr-recovery-2026-07-27.md`.
**#354 is deliberately NOT recovered here** — it removes the forced `prompt: "consent"` and moves to
30-day sessions, which must not land until the Google OAuth consent screen is set to "Internal", so
it needs its own PR held until then.

**Two nginx settings that stopped being "outside this repo".** Recovering #332 checked the VPS
proxy config in at **`deploy/nginx/foundry.conf`**, which makes two long-standing "can't fix from
here" notes actionable — both now set in that file:

- **`server_tokens off;`** — drops the version from `Server: nginx/1.24.0`. The app half of this
  (`poweredByHeader: false`, dropping `X-Powered-By: Next.js`) already shipped; §30 and the
  `next.config.ts` comment both said the nginx half was out of reach.
- **`gzip on;`** — §30 listed this as "not done … outside this repo". The win is Deck: a single
  self-contained ~504KB shell fetched on every open, ~390KB gzipped. `text/html` is gzipped by
  nginx unconditionally and must **not** appear in `gzip_types` (duplicate MIME → `nginx -t`
  warning); images are excluded deliberately (already-compressed formats gain nothing).

⚠️ **Neither is live yet.** That file is a **checked-in mirror for disaster recovery**, not a
deployed artefact — `deploy.yml` only touches Docker. It takes `scp` + `nginx -t && systemctl
restart nginx`, documented in `deploy/nginx/README.md`. Don't read the committed config as the
running config.

**The lesson worth keeping:** `git merge -s ours --allow-unrelated-histories` is safe for *files*
and not for *PR state*. Anything it makes an ancestor of `main` gets marked merged. Close or draft
the affected PRs first, or record their head SHAs before you run it.

## 34. Recent Changes (July 2026) — Pulse learns to read a native iOS repo

Pulse scored a real client iOS app (Fellas, 39k LOC, live on the App Store) at **50/100 with two
findings: no README, no .gitignore**. A hand review of the same commit found 18, including a
shipping build that writes users' plaintext passwords and both auth tokens to the device console.
`grades`, `techStack` and `compliance` all came back **empty** — the scan couldn't even identify
the project as Swift. Three scans over two months returned **47 / 50 / 50** with identical
findings while the app shipped many releases.

**The score wasn't wrong by a margin — it wasn't measuring.** Two independent causes, both fixed:

### 34.1 Generic repo checks are web/JS-shaped, and were scored as failures

`runGithubChecks` looks for a top-level `test/` folder, an ESLint config, a tsconfig, a Dockerfile,
an `.env.example`. A Swift or Kotlin project has **no equivalent by design**, so each emitted
FAIL/WARN and a flawless native app scored the same as a broken one — a floor for the input type.

**`src/server/pulse-checks/native-mobile.ts`** (pure) detects the project shape and rewrites those
checks to **SKIPPED**, which `score-breakdown.ts` already excludes from both sides of the ratio.
Same pattern the Supabase RLS check uses (`applicable: false` + a reason). 15 keys are listed with
a per-key justification, split into *toolchain mismatch* and *superseded by the native family*.
Checks that remain true for any repo (README, .gitignore, CI, licence, branch protection) are
deliberately **not** in that list.

⚠️ **Detection order matters.** React Native and Flutter projects *contain* `ios/` and `android/`
folders with real `Info.plist` / `AndroidManifest.xml` files. Matched naively, every RN app reads
as native iOS and gets the wrong check family plus the wrong skips — so `pubspec.yaml` and the JS
manifest are tested **first**. Only `ios`/`android` count as native; RN and Flutter keep the JS/Dart
toolchain and its generic checks. There is a unit test for exactly this.

`nativeTechStack()` also fills in the empty `techStack` (iOS · Swift · CocoaPods · SPM …), which
package.json sniffing structurally cannot do.

### 34.2 There was no iOS check family at all

**`src/server/pulse-checks/ios-app.ts`** — 32 checks, every one traceable to a real finding from
the Fellas review, across six areas: credential logging in Release, Keychain vs UserDefaults token
storage, ATS, privacy manifest + permission strings + background modes, Dynamic Type + VoiceOver,
**caching and constrained networks**, and test targets / dependency pinning / status-code handling.
Registered in `checks-registry.ts` per §8; the reconcile test enforces it.

**The caching group exists because a client reported "the app is slow on low data."** The checks
are the actual causes: no adaptive bitrate (`ios_adaptive_streaming` — a progressive `.mp4` has ONE
bitrate, so a weak connection can only buffer), no Low Data Mode adaptation, no on-disk response
cache, no image downsampling, no explicit timeouts, no offline cache fallback.

**Evidence model — read this before adding a check.** A 376-file app can't be fetched whole, so
config files are always read and Swift sources are **relevance-ranked and capped** (150). That makes
two different kinds of finding, and they are handled differently:
- **Presence** ("we found `try!`") is sound on a sample — we saw it.
- **Absence** ("no Dynamic Type anywhere") is not. Those declare `confidence: "LOW"` when coverage
  is thin, which `score-breakdown.ts` excludes from scoring and the UI shows as Inconclusive. A thin
  sample can therefore never invent a failure.

To support that, `deriveConfidence` in `confidence.ts` now **honours a confidence a module set
itself** (nothing else does, so behaviour is unchanged elsewhere). Confidence is keyed by
`checkKey`, which cannot express "sound this run, weak the next" — and for a sampled family that
case is real.

### 34.3 Four bugs found by validating against the real app, not by unit tests

The unit tests passed while the checks were wrong. Running the family against the actual Fellas
clone is what caught these — **do this for any new check family**:

1. **`Logger.swift` was never sampled.** It scored 900 against a hundred-odd `*Service.swift` files
   at 1000 and fell outside the cap, so the *critical* credential-logging finding reported PASS.
   Fixed with a `MUST_READ_BASENAMES` tier scoring 100,000 — small, high-value files (logger,
   keychain, environment, `*Keys`, app delegate) can't be crowded out.
2. **`UserJourneyKeys.swift` matched no pattern**, because the token names are in its *contents*,
   not its path — so tokens-in-UserDefaults reported PASS. Same fix, plus broader path keywords.
3. **Comments were matched as code.** The low-data check passed because the only occurrences of
   `allowsConstrainedNetworkAccess` in the app were two **commented-out** lines.
   `stripSwiftComments()` now runs over sampled source. It **must** preserve string literals — a URL
   contains `//`, and naive stripping truncates `"https://…/master.m3u8"` and breaks media
   detection. `ctx.swiftRaw` is kept for the few signals that genuinely live in comments (TODOs).
4. **Presence-not-ratio.** `ios_dynamic_type` passed an app with 358 hardcoded font sizes and one
   `.font(.title)`. It is now a ratio. Likewise `ios_force_unwrap_density` divided by *file count*
   rather than lines, which is meaningless — now per 1,000 lines with a minimum sample size.

One check was wrong in the *other* direction, which is worth remembering: `ios_url_cache` was
"failing" in the hand review and actually passes — the app really does configure a
`URLCache(memoryCapacity:diskCapacity:)`. **Validate against the repo before trusting either the
scanner or the reviewer.**

Result on the same commit: **10 FAIL / 12 WARN / 10 PASS**, versus two findings before.

### 34.4 The agent verdict dropped every warning

`buildAgentVerdict` (`pulse-agent.ts`) built `confirmedIssues` from `status === "FAIL"` only, so a
scan whose problems were all warnings returned "0 confirmed issues" and an **empty `topFixes`** —
for a native repo that was most of them. It now returns a `warnings[]` array, `counts.failures` /
`counts.warnings`, and `topFixes` falls through to warnings when there are no failures.

Note `counts.confirmed` is a **trust-bucket population that includes passes** — it is not the
number of issues, and reading it as one is a mistake that has already been made. `counts.failures`
is the number the summary quotes.

**Also:** `categories.reconcile.test.ts` now walks check directories **recursively**. It only read
the top level, so a module in a subdirectory could emit unregistered keys and the drift guard would
never see it.

### 34.5 Tidiness checks, and how "nice to have" is expressed

Seven further checks close the gap to the hand review: `ios_restricted_entitlements` (entitlements
Apple gates behind an approval request or a very recent OS — an archive fails outright if the
distribution profile lacks one), `ios_firebase_config_committed`, `ios_invalid_plist_keys`,
`ios_ats_exception_noop`, `ios_dev_leftovers`, `ios_todo_density`, `ios_dead_code`.

**"Nice to have" is a property, not wording.** `priority.ts` already had `HARD_CRITICAL` to boost
launch-blockers; it now has the mirror — a **`COSMETIC`** set damped by 0.3, so tidiness findings
always land in **P3** and can never push a security or store-blocking finding down the fix list.
A check qualifies only if acting on it changes nothing a user or reviewer would ever see; if it can
break a build, fail review, or expose data, it does **not** belong there. These checks are also
WARN-at-worst by construction, which a test enforces.

Two of them are deliberately **not** failures even though they look like security findings:
- `ios_firebase_config_committed` — Google ships these keys in every app binary and treats them as
  public identifiers, so rotating one achieves nothing. The action is confirming the key is
  bundle-ID-restricted in the Cloud console, which cannot be seen from the repo.
- `ios_aps_environment` — Xcode's automatic signing usually substitutes `production` on export.

**Densities need a denominator.** `ios_todo_density` and `ios_dead_code` are per-1,000-lines with a
200-line minimum, and both SKIP below it. This matters: the hand review called out "20 TODOs" as a
finding, but across 19k sampled lines that is ~1 per 1,000 — the check correctly passes. A raw count
grows with any codebase and would fire on every large repo forever.

### 34.6 Flutter family — and the reason "the Android app" was a Flutter app

Chasing the Fellas **Android** build turned up three separate repos and the live one is **Flutter**,
not Kotlin. `src/server/pulse-checks/flutter-app.ts` adds **21 checks**; `FLUTTER_INAPPLICABLE_CHECKS`
gives Dart its own skip list (deliberately different from the native one: `has_tests` is **not**
skipped, because a Flutter project really does keep a top-level `test/`, while `has_linter` **is**,
because Dart lints live in `analysis_options.yaml`).

**The two findings the family exists for, both recurring across all three Fellas codebases:**
- `flutter_env_baseurl` — the API host is chosen by **commenting out lines** in a Dart constants
  file. On the branch that ships, production was commented out and **staging was active** across all
  37 generated services. Same defect class as iOS's `//TODO: Set environment before release`, except
  here it *is* the mechanism.
- `flutter_token_storage` / `flutter_password_retention` — tokens in SharedPreferences while
  `flutter_secure_storage` sits in the same repo holding the user's **password**. The exact inversion
  found in the native iOS app (Keychain holding the password, tokens in UserDefaults). One house
  pattern, not three teams' mistakes — which is what makes it worth a check rather than a comment.

**Three bugs found by validating against the real repo (again — do this every time):**

1. **`MUST_READ_STEMS` was `\.swift$`-anchored**, so no Dart file could ever be must-read. On a
   1,114-file app `constants.dart` fell outside the cap and `flutter_env_baseurl` — the whole point
   of the family — silently **SKIPPED**. It now matches on the filename **stem** across
   `swift|dart|kt|java`. This is the `Logger.swift` lesson from §34.3, which should have been
   generalised the first time.
2. **`stripCStyleComments` only understood double-quoted strings.** Dart's idiomatic delimiter is
   `'`, so `'https://api…/api/'` was truncated at the `//` and the constant vanished entirely. Both
   quote styles and both triple-quote forms are handled now. Swift has no single-quoted literals and
   a Kotlin/Java `'x'` char literal strips identically, so this is safe for every family.
3. **`flutter_metered_network` reported PASS when a guard was only partially disabled.** The original
   rule was "commented out AND no live guard" — but on the real app the *download* path's cellular
   guard was commented out while another screen kept one, so the check passed and the actual cause of
   the client's "used all my data" report stayed invisible. Partial disablement is now its own WARN,
   worded as such: inconsistent is worse than either, because the setting appears to work.

Result on the live branch: **6 FAIL / 8 WARN / 7 PASS**, with `flutter_env_baseurl` and
`flutter_cleartext_traffic` at P1 and every tidiness finding at P3.

⚠️ **Sampling coverage on a big Flutter repo is ~13%** (150 of 1,114 Dart files), which is *below*
`SOUND_ABSENCE_COVERAGE`. That is working as designed, not a bug: presence findings fire at HIGH
confidence, and absence findings (`flutter_semantics`, `flutter_release_logging`,
`flutter_response_cache`) self-downgrade to LOW and drop out of the score. Don't "fix" it by raising
the threshold — raise the cap or add a must-read stem if a specific check is being starved.

**Native Android (Kotlin/Gradle) is still next** and remains cheap: detection, applicability, the
reader and the sampling tiers are all platform-agnostic now. It needs an `android-app.ts` and a
registry block.

## 35. Recent Changes (July 2026) — Secrets sync from CI, and the token that was never set

**`GITHUB_TOKEN` had never been set in production.** `docs/fasthosts-secrets-recovery.md` lists it
under *"Optional — only if you want the feature (were never set in prod)"* — so it was absent on
Vercel before the migration and absent on the VPS after it. Consequences, all silent:

- Unauthenticated REST → **404 on every private repo** → an empty file listing.
- `githubGraphQL` throws without a token → `runCodeAgent` catches it → no repo intelligence at all
  (no stars, releases, branch protection, commit velocity, dependency alerts).
- So every Pulse repo scan of a private repo reported **~28 confident "missing X" findings** and a
  plausible score, having read nothing. A repo demonstrably containing `README.md`, `.gitignore` and
  `pubspec.yaml` was reported as having none of them (§34.7 covers the guard that now prevents this).
- `codeclear-analysis.ts` has the **same shape and worse stakes**: `detectRepoSignals` turns an
  empty listing into `hasTests/hasCi/hasLint/hasReadme: false`, feeding `CodeClearScore`. Every
  private candidate repo has been scored as having no tests, CI, linter or docs. **Not yet fixed.**

### What changed

**1. The deploy syncs secrets into the VPS `.env`.** `deploy.yml`'s VPS step now upserts a managed
allow-list before restarting the app, via `upsert_env` — idempotent, never prints the value, and an
empty value is a **no-op rather than a delete** so an unset Actions secret can't wipe one set by
hand. It guarantees a trailing newline first: appending to a `.env` without one concatenates onto
the previous variable and corrupts both. `--force-recreate` so the container picks up the change.

⚠️ **The Actions secret is `FOUNDRY_GITHUB_TOKEN`, not `GITHUB_TOKEN`** — GitHub rejects any secret
name beginning with `GITHUB_` (reserved for the token Actions injects, which `deploy.yml` uses for
GHCR login). It is written to the VPS as `GITHUB_TOKEN`. Add another managed secret with one more
`upsert_env` line.

**2. `deploy.yml` accepts `workflow_dispatch`.** Adding or rotating a secret changes no code, so
there is nothing to push — the deploy has to be re-runnable on its own.

**3. The failure is no longer silent.** `hasGithubToken()` in `lib/github.ts`; `githubHeaders()`
warns **once per process** when GitHub is called with no token; and `repo_accessible` now names the
actual cause, distinguishing *"GITHUB_TOKEN is not configured on this server"* from *"the token
cannot see this repository"* — different fixes, and conflating them cost a day of misdiagnosis.

**The lesson worth keeping:** a secret that lives only in one hand-edited file on one box is a
secret that silently goes missing, and a check built on `safeGithubRequest` converts "we couldn't
look" into "it isn't there". Any *scored* check needs to distinguish those two; an optional signal
can get away with not caring.

### 35.1 The token landed — and the iOS/Flutter families still did not run

With `GITHUB_TOKEN` finally in place, the two real client repos scanned **53/100** (iOS) and
**64/100** (Flutter) — and **not one of the 39 iOS or 21 Flutter checks appeared**. Every finding in
both scans was generic repo hygiene (no CONTRIBUTING.md, no Makefile, no Renovate). `techStack` was
now correctly populated (`iOS · Swift · Objective-C · CocoaPods · SPM`, `Flutter · Dart`), so the
tree read and the platform detection were both working.

**The tell was that *every* code-agent check was missing too** — `branch_protection`, `has_releases`,
`github_stars`, `repo_not_archived`, `primary_language`. All of them live in `runCodeAgent`, and so
does the native family (it is called at the END of that function). `runCodeAgent` opened with:

```ts
try { data = await githubGraphQL(...) } catch { return { checks: [], insights: emptyInsights() } }
```

So **one failed GraphQL call discarded the entire source analysis** — the whole point of §34 — and
reported a plausible score instead. Same shape as the `safeGithubRequest` bug in §35: a failure in an
auxiliary signal silently deleting the primary measurement.

**Two independent defects, both fixed:**

1. **`githubGraphQL` threw on partial errors.** GraphQL is **partial-success by design**: when a
   token lacks permission for ONE field, GitHub answers **HTTP 200** with that field `null`, an entry
   in `errors`, and good data for every other field. Throwing on any `errors` entry discarded all of
   it. `vulnerabilityAlerts` needs *Dependabot alerts: read* and `branchProtectionRules` needs
   *administration: read* — permissions a repo-scoped PAT routinely lacks, so this fires on a
   perfectly valid token. It now returns the usable data (warning once, naming the unreadable field
   paths) and throws **only** when there is nothing usable — `repository: null` still errors, because
   that genuinely is "we could not look".
2. **Source analysis was downstream of metadata.** The REST-only families (secret scan + native
   mobile) moved into `runRestOnlyFamilies()`, called **before** GraphQL and unconditionally, via
   `Promise.allSettled` so neither can take out the other. Repo metadata and source analysis now fail
   **independently**: losing GraphQL costs you branch-protection and star count, never the 39 iOS
   checks.

Because partial responses are now honoured, any single field can arrive `null` — so
`branchProtectionRules?.nodes?.[0]` and `pullRequests?.nodes ?? []` needed optional chaining, and
both are `| null` in `GQLResponse`. Without that, tolerating the partial response would have swapped
a silent empty result for a crash.

**New check `repo_intelligence`** (registered, emitted `SKIPPED`) says *why* metadata is missing, and
distinguishes "GITHUB_TOKEN is not configured" from "the token lacks the permissions these fields
require". Eight checks silently vanishing is what made this cost two days; the diagnostic is now in
the scan itself.

⚠️ **The trap worth internalising:** `techStack` being populated looked like proof the token worked.
It is not — the tree read is REST, which succeeds unauthenticated on a **public** repo. Only the
GraphQL path proves the token. Verified by unit test rather than by inference: 6 tests for the
partial-error contract, 5 asserting the native family survives every GraphQL failure mode.

**Still open (unchanged):** `codeclear-analysis.ts` has the same shape with worse stakes —
`detectRepoSignals` turns an empty listing into `hasTests/hasCi/hasLint/hasReadme: false`, feeding
`CodeClearScore`, so every private candidate repo has been scored as having no tests, CI, linter or
docs.

## 36. Recent Changes (July 2026) — Dispatch (the Slack-resident coordinator)

`@Foundry` is now **answerable**. Mention the bot in a channel — or DM it — and **Dispatch**
answers delivery questions ("where are we with the ElectricFire onboarding?", "what has Howard
done on Big Wedge Golf?", "is anything at risk?") from Foundry's own records, in-thread, always
stating what it could **not** confirm. Prompted by a Loom of Ayven doing the same thing; the gap
turned out to be narrow, because Foreman (§29) already had the brain — it had no mouth. **Full
operator runbook + verification steps: `docs/dispatch.md`.**

- **The inbound half of Slack, which never existed.** Foundry had `/commands` and `/interactions`
  but no Events API endpoint — it could post and be clicked, never *talked to*. New
  `src/app/api/webhooks/slack/events/route.ts`: verifies the HMAC over raw bytes (that path is
  public in middleware, so the signature is the only auth), answers the `url_verification`
  challenge, then **acks immediately and works in `after()`**. Deferring is correct here, unlike
  the interactions route which must finish `views.open` inside the 3s `trigger_id` window —
  nothing in an event expires. Manifest gains `event_subscriptions` (`app_mention`, `message.im`)
  + `app_mentions:read`/`im:*`; **reinstalling the Slack app is required** (Slack never grants new
  scopes to an existing token).
- **The design rule, and it's structural not prompted:** `question → deterministic subject
  resolution (resolve.ts, pure) → deterministic evidence pack (evidence.ts, Prisma only) → ONE
  light-tier LLM call that may only rephrase the pack`. The model never queries, never infers,
  never decides what's true — it's a writer, not a researcher. Three consequences worth keeping:
  (a) **`unverified` is not the model's to write** — it's derived from the pack's blind spots and
  merged in afterwards; the model may only *add* a caveat, never drop one; (b) **there's a no-AI
  floor** — `composeDeterministicAnswer()` is pure, so with no API key / a failed call / junk JSON
  Dispatch still answers, just plainly; (c) **"nothing overdue" can never mean "on track"** unless
  tasks are actually dated — computed in `deriveBlindSpots()`, not left to the model.
- **Blind spots** (`NO_TASKS`, `NO_DUE_DATES`, `NO_TIMELINE`, `NO_COMPLETION_STAMPS`,
  `NO_RECENT_ACTIVITY`, `NOT_IN_FOUNDRY`, `SLACK_NOT_READ`) each name a question the evidence
  *can't* answer. `SLACK_NOT_READ` is **conditional on purpose** — only added when the board has
  gone quiet, which is the one moment a reader would otherwise conclude nothing happened.
- **Subject resolution is deterministic, never the model's pick** — a confidently wrong client is
  the exact failure Dispatch exists to prevent. Two passes: word-bounded on a normalised form,
  then a length-guarded squashed pass so "ElectricFire" finds "Electric Fire" while "Echo" can't
  match inside "echoed". Client + person in one question = client subject narrowed to that person.
  Nothing matched → it says so and stops.
- **`allowExternalChannels` is a disclosure gate, default OFF, fails closed.** Per-client Slack
  Connect channels contain the client; overdue counts / developer workload / Foreman flags are not
  client-facing. Classified from a live `conversations.info` (`is_ext_shared` — **not** `is_shared`,
  which is also true for internal org shares); any failure to classify → treated as external.
  `resolveDispatchConfig` accepts only a literal boolean `true`, so a stray `"yes"`/`1` can't open it.
- **Cost discipline mirrors the Foreman narrative** — one `tier:"light"` (Haiku) call, 900 tokens,
  cached system prompt, wrapped in `AiResponseCache` with the **subject+question in the cache key**
  and the **evidence in the inputs hash**, so re-asking an unchanged board is **£0**. Attributed to
  the pre-existing `AiModule.SLACK`. Per-channel rate limit counts *every* exchange, junk included.
- **Schema (additive → applies via the guarded `prisma db push`):** `Workspace.dispatchConfig`
  (`{enabled, recentDays 7, maxEvidenceItems 12, perChannelPerHour 20, allowExternalChannels false}`)
  + new **`DispatchExchange`** — written BEFORE the answer, so `slackEventId @unique` doubles as the
  Slack retry-dedupe guard (a re-delivery loses the insert race; an attempt that died pre-insert
  legitimately retries). Also the audit trail: `status` (`answered` | `no_subject` | `rate_limited`
  | `no_ai` | `error` — honest refusals are outcomes, not silent failures), `unverified`, `evidence`
  (counts + blind-spot kinds only, never a second copy of client data), `aiModel`, `cached`, `latencyMs`.
- **`slack` notification channel wired** (was declared-but-no-op in `dispatchNotification`). Posts
  **once** per dispatch to `Workspace.channelRoutes[event]`, gated on the event's **default**
  routing — deliberately NOT per-recipient, because a channel post is a workspace broadcast and
  routing it per-user would post N copies to one channel and let one person's mute change what a
  shared channel sees. Runs independently of the recipient set, so a channel-routed digest lands
  even if every individual muted it. **`foreman.digest` now routes `["inApp","push","slack"]`** —
  set `channelRoutes["foreman.digest"]` and the morning delivery picture lands in Slack. No route
  configured → silent no-op.
- **Deliberate limits (all Phase 2/3, all called out in `docs/dispatch.md`):** it does **not** read
  Slack conversation (no `channels:history` scope requested — least privilege, and it keeps the
  answer's provenance honest); there is **no mission object** yet, so it answers from derived state
  rather than a durable "the ElectricFire onboarding" record with an owner + completion target +
  evidence log (that's the real product work); it answers but never acts (read-only, no writes on
  your behalf); replies are always in-thread; no Settings UI or panel — config is JSON on the
  workspace.
- **Verified:** `tsc --noEmit` + targeted `eslint` clean; `npm test` **174 passing** (39 new
  Dispatch unit tests covering mention stripping, subject resolution incl. the squash-collision
  guards, config clamping + the external-channel boolean guard, every blind-spot rule, the no-AI
  floor, and event triage/loop-guard); `next build` clean with
  `/api/webhooks/slack/events` registered. App is auth-gated with no local DB → **post-deploy**:
  reinstall the Slack app, confirm the Events URL verifies, mention the bot in an internal channel,
  re-ask to prove the `cached` footer, ask something unresolvable, and try a Slack Connect channel
  to confirm it declines. Steps 1-8 in `docs/dispatch.md`.

## 37. Recent Changes (July 2026) — Pulse: the scan dropdown gets check families behind it

Six of the eleven entries in the scan dropdown had **no checks of their own**. The menu was
purely **subtractive**: picking "iOS app" removed five irrelevant categories and fed a label into
the AI prompt, and never caused a single one of the 39 iOS checks to run — those fire on repo
DETECTION. So "Desktop app" and "CLI tool" were empty, "React Native" was a label with nothing
behind it, and a scan that could not run the family you asked for looked identical to one that ran
it and found nothing. Same disease as §35, one layer up.

**Registry: 703 → 819 checks (+116).** Every one is deterministic and traceable to a vendor rule —
citations in **`docs/platform-check-sources.md`**, which also carries the three version-pinned
constants (below), because those are the parts that go stale on a schedule.

### 37.1 The bug found while wiring: the browser-extension family could never fire

`isChromeExtension` reads `snapshot.files`, and `buildSnapshot` returned early with an **empty
files map** for any repo that wasn't iOS/Android/Flutter. A browser-extension repo is neither, so
`findExtensionManifest` had nothing to search: **all 12 extension checks shipped in #469 were
unreachable from the moment they landed**, and no test caught it because they were unit-tested
against a hand-built snapshot. Fixed by the two-phase snapshot below; the family is now 26 checks.

### 37.2 New families

| Family | Checks | File |
|---|---|---|
| **Desktop — Electron + Tauri** | 33 | `pulse-checks/desktop-app.ts` |
| **React Native** | 22 | `pulse-checks/react-native-app.ts` |
| **CLI / published npm package** | 22 | `pulse-checks/cli-tool.ts` |
| **API behaviour (probed)** | 13 | `pulse-checks/api-behaviour.ts` |
| **Android — component & platform security** | +14 (19 → 33) | `pulse-checks/android-app.ts` |
| **Browser extension — surface, code, listing** | +14 (12 → 26) | `pulse-checks/chrome-extension.ts` |

- **Desktop is the highest-severity family in Pulse.** `nodeIntegration: true` with
  `contextIsolation: false` is remote code execution on the user's machine from any script the
  renderer loads — one boolean. `readBooleanSetting` returns `true` / `false` / **`null`** because
  absent ≠ false: `contextIsolation` defaults SECURE (absence passes) while `sandbox` does not.
  Collapsing them gets one backwards, and there is a test that fails if you do.
- **API behaviour probes rather than reads docs.** `api-quality.ts`'s 15 checks all ask whether
  something is *documented*; these ask what the API actually does — CORS origin reflection with
  credentials, stack traces in error bodies, TRACE, GraphQL introspection. Two rules it must not
  break: a **failed probe yields SKIPPED, never FAIL**, and on a `catchAll200` host the path probes
  decline to answer. `api_unauthenticated_data` is deliberately SKIPPED with a reason — OWASP API1
  needs an authenticated test with two accounts and cannot be inferred from outside.
- **CLI is about DISTRIBUTION, not code.** Install lifecycle scripts, `bin` names that shadow
  `node`, publish provenance, and the argv/stdout/stderr/exit-code contract other programs depend
  on. Runs only for a `bin`-carrying package that is not a web app and not `private: true`.

### 37.3 The dropdown now says what it did and didn't cover

New `platform-coverage.ts` + check **`platform_family_coverage`**. Detection still WINS over a
wrong selection — a user who picks the wrong entry should still get a correct scan — but the gap is
no longer silent:

- **URL scan + a source-based selection** → SKIPPED, naming the family and the count, and saying to
  re-run with a GitHub repo. **Never a FAIL**: scanning a URL is legitimate, and the score must not
  punish a project for how it was scanned.
- **Repo scan, shape matches** → PASS. **Shape differs** → WARN naming both ("selected iOS, this is
  a CLI"), because the cross-platform-product case — the mobile code is in another repo — is common.

### 37.4 Two-phase snapshot (`native-repo.ts`)

An Electron app, an RN app, a CLI and a plain web service all look like "a directory with a
package.json", so shape detection needs file CONTENTS, which is what the old path-only early-return
could not do.

- **Round 0** — at most 8 tiny files (root `package.json`, `src-tauri/tauri.conf.json`, candidate
  `manifest.json`s), ranked and capped so a 200-workspace monorepo can't stampede the API.
- **Resolve shape** — mobile first (`detectNativePlatform` already orders RN/Flutter before native),
  then desktop/CLI from package.json, then React Native, then extension last (needs the
  `manifest_version` key, which is what stops every PWA being scanned as an extension).
- **Round 1** — config + a relevance-ranked source sample for that shape, plus a CLI's `bin` targets
  (named in package.json, so they match no path pattern — and the shebang check is meaningless
  without them). Config capped at 60.
- A plain web repo still costs **one tree call + the round-0 probes** and nothing else.

⚠️ `SnapshotShape` is deliberately a **third** union, separate from `NativePlatform` and
`ProjectShape`. It exists only to choose which files to fetch; merging it into either of the others
would let a desktop repo silently pick up mobile applicability semantics.

⚠️ `runNativeMobileChecks` guards the RN branch on the **resolved snapshot shape**, not on
`detectNativePlatform` alone — an Electron app that also ships an `app.json` reads as
`"react-native"` to the path-based detector. There is a test for exactly this.

### 37.5 Version-pinned constants — these go stale and produce WRONG findings

Not missing findings: an app on a supported version reported as end-of-life. Full table in
`docs/platform-check-sources.md`.

| Constant | File | Value | Cadence |
|---|---|---|---|
| `ELECTRON_OLDEST_SUPPORTED_MAJOR` | `desktop-app.ts` | 41 | new major every 8 weeks, latest 3 supported |
| `RN_OLDEST_SUPPORTED_MINOR` | `react-native-app.ts` | 84 | latest 3 minors |
| `PLAY_TARGET_SDK_FLOOR` | `android-app.ts` | 35 | each August |

### 37.6 Things learned (again) writing this

- **The reconcile guard's tuple heuristic bites any three-string array**, including one **inside a
  comment**. It fired three times here: `["preinstall", "install", "postinstall"]`, the icon sizes,
  and then the comment written to explain the first. Restructured the code each time rather than
  loosening the guard — it is the only thing stopping the catalogue drifting.
- **A computed `checkKey` opts a check out of that guard entirely.** The three `cli_pkg_*` metadata
  checks were a loop over a template literal; they are written out explicitly now.
- **Regex classes and quote characters.** `[^"']*` failed to match the Android SQL-concatenation
  case because a SQL string routinely *contains* the other quote (`"… WHERE email = '"` + email).
  Matched per-quote-style now. Same family of bug as the Dart single-quote issue in §34.6.
- **Tests were proved to discriminate** by breaking four things on purpose: disabling comment
  stripping (1 fail), collapsing absent-vs-false (3 fails), making a failed API probe report FAIL
  (1 fail), and letting RN classify an Electron app (1 fail).

**Verified:** `npm run verify` green — tsc + lint 0 errors, **494 tests**, audit:ui 0 findings.
App is auth-gated with no local DB → **post-deploy**: scan a real Electron repo, a real Kotlin repo,
a browser-extension repo and an npm CLI, and confirm the `platform_family_coverage` check reads
correctly for a deliberate mismatch. **Deferred:** the 116 new checks are validated against unit
tests, not against real repositories — §34.3's lesson is that validating a family against a real
codebase is what finds the wrong ones, and that has not happened yet for any of these.

## 38. Recent Changes (July 2026) — Provenance: the attestation layer (new product)

A new top-level product at `/app/provenance`, sharing Foundry's spine and sellable standalone. It
inverts what Pulse does: **Pulse produces a report for the owner; Provenance produces a signed,
expiring attestation for the counterparty** — the client accepting handover, the insurer
underwriting the app, the acquirer, the procurement officer. Someone who did not build the
software, cannot read code, and is about to rely on it. Full brief, market evidence, revenue
model and operator runbook: **`docs/provenance.md`**.

**Why an attestation and not another scanner.** Scanning commoditised to free during 2026 —
free no-signup agent-readiness scanners, free vibe-code security scanners, Snyk/Semgrep/OX
overlapping the rest. What has not commoditised is *standing behind* a measurement, and
certification lives or dies on one property this repo has already paid to learn: **never
claiming what you did not check** (§34.2's confidence model, §35's *"a check built on
`safeGithubRequest` converts 'we couldn't look' into 'it isn't there'"*, §37's
SKIPPED-not-FAIL). Every free scanner still has the bug Foundry found and fixed in itself.
The commercial precedent is Cyber Essentials — 200,000+ certificates, 69% micro/small, growth
driven by contract mandates, ~290 licensed assessment bodies (which is the white-label
channel, proven at national scale).

**SAS-1 — the standard is the product's contract** (`src/server/provenance/standard.ts`). 14
clauses, each with a plain-English `assertion` (the sentence a counterparty relies on), a
non-technical `whyItMatters`, a `critical` flag, and the Pulse `checkKeys` that constitute
evidence. Versioned, and a mark records `standardId` + `standardVersion` — a certificate that
does not name its standard is worthless. **Never change a clause's meaning in place**; marks
already issued cite it. A test asserts every `checkKeys` entry exists in
`checks-registry.ts`, because a clause pointing at a key nothing emits is `UNPROVEN` forever,
which reads as "we could not check this" when the truth is "we asked the wrong question".

**The verdict rules, and the one that matters** (`evaluate.ts`, pure). `MET` needs every
covering check to have run *and* passed; `FAILED` needs an adverse check at HIGH or MEDIUM
confidence; a proven warning is `QUALIFIED`; all-SKIPPED is `NOT_APPLICABLE`. Everything else
— **no covering check ran, or only LOW-confidence adverse signals** — is `UNPROVEN`. Grades:
a critical `FAILED` → `NOT_CERTIFIED`; a critical `UNPROVEN` → **`INCOMPLETE`**; non-critical
problems → `CONDITIONAL`; else `CERTIFIED`.
⚠️ **`INCOMPLETE` is load-bearing and must not be merged into `NOT_CERTIFIED`.** "We could not
check this" and "this is broken" are different facts with different fixes. `score-breakdown.ts`
already excludes a LOW-confidence adverse check from scoring as "an unproven alarm"; here the
consequence is stronger — it must not earn a *pass* on the way through either.

**Blind spots are first-class and rendered ABOVE the clause list** on the certificate
(§02, before §03/§04). Derived, never authored: unmeasured clauses, weak-evidence-only
clauses, clauses met on a partial check set, thin overall coverage — plus an **unconditional**
`RUNTIME_NOT_PROBED` stating that Provenance inspects code, config and public responses and never
signs in, exercises payments or attempts cross-account authorisation. A reader must never have
to infer the product's boundary from the absence of a caveat.

**digest ≠ seal, and the honesty rule** (`digest.ts`). The **digest** is a SHA-256 over a
canonical (recursively key-sorted) serialisation — proves contents unaltered, needs no secret,
recomputable by anyone from what the certificate prints. The **seal** is an HMAC-SHA-256 over
the same form under `PROVENANCE_SIGNING_SECRET` — proves *we* issued it. A digest alone is
worthless against forgery (an attacker who edits the contents recomputes it). With no secret
configured, `seal` is `null` and the certificate says **UNSEALED** — there is deliberately
**no fallback to a derived key**, because a seal anyone can reproduce looks identical to a
real one to every reader while proving nothing. `verifyAttestation` also keeps
`UNVERIFIABLE` (seal present, no key here) distinct from `TAMPERED`, so a rotated key does not
cry forgery. The payload seals clause **verdicts and blind-spot kinds, not prose** — otherwise
rewording a rationale would invalidate every seal ever issued.

**Marks expire on purpose, and that is the subscription.** 90 days certified / 30 conditional
(and 30 for failed+incomplete, which still need to be citable in a dispute). Precedence is
`REVOKED` → `SUPERSEDED` → `LAPSED` → `EXPIRING` → `VALID`, and the order is deliberate: a
revoked mark that has *also* expired must still say REVOKED, because "we withdrew this"
outranks "it would have run out anyway" for anyone who relied on it. `LAPSED` explicitly means
*nobody re-checked*, not *a fault was found*.
⚠️ **Revocation is `PATCH`, never `DELETE`.** Deleting the row 404s the certificate URL, which
reads to whoever holds it as a broken link rather than a withdrawal — so the one thing
revocation exists to communicate would be the one thing it fails to say.

**The Countermark row is frozen and self-contained** — `clauses`/`blindSpots`/`coverage`/
`standardVersion`/`checkCount` snapshotted at issue, and `scanId` a **loose indexed id, not an
FK**. Same precedent as Docs (`formSnapshot`, so editing a template never rewrites a document
already sent) and `ForemanRun` (frozen findings). An attestation whose contents change when the
scan is re-run is not an attestation, and the digest is computed over the frozen payload, so
re-deriving anything on read would break verification too.

**Permissions are split.** `provenance` (module) is a read-only register; **`provenance.issue`** is a
separate high-risk action, because the issuer's name goes on a certificate a third party
relies on. Both default off. The issue route uses `requireAuthedUser`, **not** the OrDefault
variant — that helper falls back to the default workspace owner, so an identity-less caller
would issue a certificate in a Super Admin's name, which here is not merely a privilege bug
but a forged signature.

**Schema (additive → applies via the guarded `prisma db push`):** `Countermark` + enum
`CountermarkGrade`; relations on `Workspace` and `WorkspaceClient`. New env
`PROVENANCE_SIGNING_SECRET` (optional; absence degrades honestly to UNSEALED). New route
`/countermark/[token]` added to `robots.ts`'s disallow list alongside the other token pages.

**Verified:** `npm run verify` green — tsc + lint **0 errors**, **560 tests passing** (66 new
across evaluate/lapse/digest), `audit:ui` **0 findings** with its self-test passing;
`npx next build` clean with all four new routes registered. The 66 tests were **proved to
discriminate** by breaking four things on purpose (§37's discipline): certifying an unmeasured
clause → 6 failures; letting a LOW-confidence adverse check count as proof → 1; making
`LAPSED` outrank `REVOKED` → 1; dropping blind spots from the sealed payload → 2.
**Not visually verified** — `/app/provenance` is auth-gated and `/countermark/[token]` needs a real
row, and there is no staging or local DB. Post-deploy steps 1-6 in `docs/provenance.md` §5.

**Demo data + the internal product case.** **Settings → Labs → Provenance → Seed demo data**
(Super Admin, session-authorised — no API key; `POST /api/dev/seed-provenance-demo` for scripts)
seeds **six countermarks** covering all four grades plus a revoked one and a superseded pair. It
does **not** fabricate rows: it builds realistic `PulseScan`/`PulseScanCheck` records and runs the
real `issueCountermark`, so every verdict, blind spot, digest and seal is genuine engine output —
and the response asserts each scenario's grade against what the engine actually returned,
surfacing `gradeMismatches` in the UI rather than swallowing them. Fixtures live in
`src/server/provenance/demo-scenarios.ts` and are graded in CI by
`__tests__/demo-scenarios.test.ts` with **no database**, which is how the demo data is known
correct *before* it is seeded (the seed route can't run locally). Writing that test immediately
earned its keep: it caught that `repo_accessible` — the canonical "could we even look" signal
(§35) — was in no clause at all, even though C11's assertion already claimed readability had been
established. Fixed by bumping **SAS-1 to v1.1.0** and adding the key, rather than loosening the
test; safe because zero marks had been issued. Also `/provenance-overview`, the internal product
case (noindex, in `robots.ts`) — a working document with dated regulation, sourced figures, a
specimen certificate, the competitive-gap table, and an explicit register of what is NOT built
and what is unresolved.

**Deferred, highest-value first:** **commit pinning** — `subjectCommit` is written `null`
because `PulseScan` never records the SHA it read, so a mark currently names a repo rather
than a version (recorded as null rather than guessed, per the no-false-precision rule);
**continuous re-examination** as a `COUNTERMARK_RECHECK` job on the existing Curator/Foreman cron spine
(this is the subscription); **licensed issuers** for white label (issuer record + per-issuer
certificate branding + a public issuer directory); a **public `SAS-1` page** at a stable URL so
a contract can cite it; **Docs integration** (embed a mark in a handover; require a live mark
before e-sign acceptance); and an **insurer/marketplace API**, which needs a partner before it
needs code.

## 39. Recent Changes (July 2026) — Badges: "Foundry Approved" + an embeddable Pulse score

Two families of self-contained SVG mark, so Gitwork's work can be signed on a client's own site and
a Pulse score can be published there. **Full usage + parameters: `docs/badges.md`.**

- **"Foundry Approved" — five options, committed under `public/badge/`.** Seal (circular stamp,
  rotating legend), Instrument plate (the `01 // WIDGET NAME` widget grammar), Shield (inline,
  shields.io proportions), Monogram (square, the real wordmark's "F"), Certificate lockup
  (horizontal footer). Each ships light + `-dark` and static + `-anim`; the monogram adds `-sm`.
  Measured size floors: **seal 64px**, **monogram 24px** (below that its tick lozenge is a smudge —
  `-sm` drops it and is legible to 16px).
- **Pulse score — `GET /api/badge/pulse/[token]`** (public, added to `PUBLIC_API_PATHS`). The token
  is the **existing `PulseScan.shareToken`**, so no schema change, no new auth surface, and nothing
  is exposed that `/report/[token]` does not already show. It reads through the **same
  `pulse-report-<token>` cache tag** the share route already revalidates, so unshare revokes the
  badge with the report. `?style=shield|ring|card|bar`, `?theme=light|dark`, `?motion=1`. A revoked
  token **404s on purpose** — a badge that kept rendering would advertise a claim nobody can check.
- **Bands are locked to the report.** `scoreBand`/`scoreGrade` mirror `HealthScoreRing`
  (`document-cover.tsx`) and a unit test asserts every boundary, so the badge can never contradict
  the report it links to. The `card`'s domain bars come from `computeScoreBreakdown` — the same
  maths as the headline score.

**Type is outlined to paths, and that is load-bearing.** An SVG in an `<img>` is an isolated
document: no webfont fetch, no inherited CSS. `font-family:'DM Serif Display'` there falls back to
Georgia, whose numerals are **old-style** — a score would render with a descending "9". So
`scripts/badge/fonttype.py` outlines the brand faces (shaped through HarfBuzz for correct kerning)
from the base64 woff2 **already vendored for Deck**, keeping one copy of the fonts in the repo.
⚠️ `TTFont` loaded from `.woff2` keeps `flavor="woff2"` and re-saves compressed; HarfBuzz cannot
parse that and fails **silently** — every character maps to `.notdef`, giving uniform advances and
no outlines. Clear `font.flavor` before saving.

**⚠️ The trap that shaped the whole design: a CSS animation inside an `<img>` freezes at frame 0.**
It is not that the animation "doesn't apply" — the browser *starts* it and never advances the
timeline, so an entrance animation renders its **hidden** first frame. **No `fill-mode` fixes it**;
"frame 0" and "finished" are contradictory states. It fires wherever a page is rasterised without
being scrolled: offscreen images in a full-page screenshot, social/OG card renderers, print-to-PDF.
Found exactly that way here — the Pulse badges came out blank in a full-page screenshot while the
same files were perfect in isolation. Consequences, both kept:
1. **Everything ships in two builds.** Static is the **default** and the one that goes on someone
   else's site; animated (`-anim`, or `?motion=1`) is for surfaces we control, where a person
   scrolls it into view. The static build is literally the animated one minus its `<style>`.
2. **Every base style must equal the finished state.** `entrance()` (in both the Python generator
   and `pulse-badge.ts`) puts stagger in **keyframe percentages, never `animation-delay`**, because
   a delay with `fill-mode:backwards` reintroduces a hidden resting state. `prefers-reduced-motion`
   is deliberately *only* `animation:none`, which makes the invariant self-testing — get it wrong
   and a reduced-motion render visibly breaks.

**Layout defects the detectors cannot see, found by screenshotting** (the §30 lesson again): the
ring's caption collided with its own arc, the lockup's serif title ran under the VERIFIED chip, and
the card's fourth domain bar overlapped the footer rule. All three are geometry, so `audit:ui` and
`audit-clipping` are blind to them — the lockup now **derives its width from the shaped type**, so
that class of collision cannot come back when the copy changes.

**Files:** `scripts/badge/{fonttype,generate}.py` (build-time only — `pip install fonttools brotli
uharfbuzz`; outputs are committed, nothing runs Python at build or request time),
`src/lib/badge/pulse-badge.ts` (pure, 23 unit tests), `src/lib/badge/glyphs.ts` (generated, ~15KB,
caps-only), `src/app/api/badge/pulse/[token]/route.ts`, `public/badge/*.svg`, `docs/badges.md`.

**Verified:** `npm run verify` green — tsc + lint clean, **517 tests** (23 new), `audit:ui` 0
findings; `npx next build` clean with `/api/badge/pulse/[token]` registered. Both builds were
rendered in headless Chromium at multiple sizes, on light and dark grounds, and under
`prefers-reduced-motion`. **Not verified:** the live route against a real shared scan — that needs a
database, so it is a post-deploy check (share a scan, hit each `style`, unshare and confirm 404).
**Deferred:** per-client copy on the static plate/lockup (`AUDITED …` is baked into the art); an
Inter block in the glyph table (the dynamic `card` sets its grade in mono for that reason); and a
picker in-app — today you copy a URL out of `docs/badges.md`.

### 39.1 Badge studio (Settings → Labs) + the naming scheme

The marks are now installable from inside Foundry rather than by copying a URL out of a doc.

- **Every mark has a permanent code** — `FA-01`…`FA-05`, `PS-01`…`PS-04` — defined in
  **`src/lib/badge/catalog.ts`**, the single source of truth for badge identity that the studio,
  the docs and any review comment all read from. Codes are permanent: retiring a mark retires its
  code, because reusing a number makes a stale reference resolve to the *wrong* thing instead of
  failing. `catalog.test.ts` asserts each code is unique, well-formed, and — the useful part —
  that **every variant the studio can offer actually exists on disk**, so the catalogue can't
  advertise a file the generator never wrote.
- **Settings → Labs → Badge studio** (`src/components/settings/labs/badge-studio.tsx`): pick a
  mark, set the ground, static/animated, then copy a paste-ready snippet. For a Pulse badge it also
  picks the scan and **shares the report inline** if it isn't shared yet — that share is what mints
  the token, so the studio is the whole install path rather than step one of three.
- **It is a modal, not a route, and that is deliberate.** Labs is Super-Admin-gated in the settings
  shell, but `/app/settings/**` is in `UNGATED_APP_PREFIXES` — a route would have been reachable by
  any signed-in member. Keeping it in the panel means it inherits the gate it should have. `LabEntry`
  now takes either an `href` (opens a tab, e.g. `/edge`) or a `panel` (opens in place).
- **`PulseScanListItem` gained `isShared` + `shareToken`** (additive DTO, no schema change).
  `shareToken` is populated **only while `isShared`** — an unshared scan's token never leaves the
  server, and once shared it is no more secret than the `/report/[token]` link it belongs to. The
  share/unshare hooks now also invalidate `["pulse-scans"]`; they only invalidated the single scan,
  which left the list's new share state stale.

**Two layout bugs, both caught by rendering the component rather than reading it.** `/app` is
auth-gated with no staging, so the studio was server-rendered with `renderToStaticMarkup` inside
the real providers, wrapped in the app's compiled CSS, and screenshotted. That is worth knowing as
a technique — it does not run effects, but it does check real geometry on gated screens:

1. The **Install block fell below the fold** once the Pulse scan picker was present. The column
   scrolled, so `audit-clipping` would have passed it — but the snippet is the reason the studio
   exists and should never be the thing you scroll to find. It is now a pinned, non-scrolling
   footer with the content above scrolling under it.
2. Pinning it didn't work at first: the inspector column needed **`min-h-0`**. Without it a grid
   item's automatic minimum size is its content, so the column grew past the `h-[460px]` track and
   pushed the footer out of the dialog. Same trap DESIGN.md documents for the Docs editor panes.

**Verified:** `npm run verify` green — tsc + lint clean, **531 tests** (8 new catalogue tests),
`audit:ui` 0 findings; `npx next build` clean. The studio was rendered and screenshotted in three
states (FA-01, FA-03, PS-04). **Not verified:** the studio driven live with real scans — effects,
the scan dropdown and the clipboard need a browser session against a database, so that is a
post-deploy check.

### 39.2 The Countermark badge — the embeddable face of an Provenance attestation

Provenance (§38) publishes a Countermark as a **page**; it had no embeddable mark. This adds one, so a
client can put the attestation in their own footer rather than only linking to it. Three styles —
**`CM-01` Mark shield**, **`CM-02` Validity disc**, **`CM-03` Certificate card** — served from
`GET /api/badge/countermark/[token]` (public; `/api/badge` was already in `PUBLIC_API_PATHS`), keyed
on the same `Countermark.token` that serves `/countermark/[token]`, so the badge is exactly as
public as the certificate and shows strictly less.

**`src/lib/badge/svg-kit.ts`** was extracted first — tokens, outlined-type composition, `entrance`,
`wrap`, `cardFace` — because the alternative was copying ~150 lines out of the Pulse renderer. Both
renderers now sit on it and `pulse-badge.ts` kept its public API, so its 23 tests passed the
refactor unchanged.

**Three honesty rules, enforced in `markState()` so every style inherits them.** Each has unit
tests named after it, because a badge is the likeliest place for an attestation to get overstated:

1. **Validity dominates grade.** A LAPSED / REVOKED / SUPERSEDED mark asserts nothing, so it never
   leads with its grade — the status word, muted, and the shield is struck through rather than
   merely greyed. A badge still reading CERTIFIED three months after expiry is precisely what Provenance
   exists to prevent.
2. **INCOMPLETE is not NOT_CERTIFIED.** "Could not establish" and "provably broken" never share a
   colour — neutral vs danger. The same distinction as §35, one layer out.
3. **An unsealed mark says so.** No `ASSAY_SIGNING_SECRET` → an UNSEALED marker, so it cannot pass
   for a signed mark.

⚠️ **This badge is cached for 60 seconds, not 5 minutes, and never at a CDN.** Unlike the Pulse
badge it is **time-dependent** — it renders days remaining and flips VALID → EXPIRING → LAPSED on
its own, with no write to invalidate against. `max-age=60, must-revalidate`, deliberately no
`s-maxage`: a CDN holding a lapsed mark as certified is the failure mode that matters. `validityDays`
is derived from the record's own `issuedAt`/`expiresAt` rather than the standard, so a mark issued
under an older validity policy still draws its own window correctly.

**Studio:** the catalogue gained a third family and `countermarkPath()`; the studio lists it and
picks a mark. There is no share step — a countermark is public the moment it is struck.

**Verified:** `npm run verify` green — **624 tests** (26 new Countermark tests + the catalogue
guard extended to `CM-`), `audit:ui` 0 findings; `npx next build` clean with both badge routes
registered. All fifteen grade × status × seal × theme combinations were rendered and inspected —
which caught the UNSEALED marker sitting on the disc's 9px ring stroke and being cut in half.
**Not verified:** the route against a real struck countermark (needs a database) — post-deploy,
issue a mark in Labs → Provenance, hit each style, then revoke it and confirm the badge flips.

## 38. Recent Changes (July 2026) — Pulse reads the source of a WEB repo (the blind spot at the centre)

Prompted by a competitive read of **ogbuilds.ai** (secure·vibes / clean·vibes — a one-person studio
scanning the same population Pulse targets), which surfaced a gap worth more than anything in their
feature list: **Pulse read source for seven repo shapes and not for the eighth, most common one.**

A plain web/service repo resolved to `shape === "none"` and `buildSnapshot` returned right after the
round-0 manifest probes. So a Next.js app, an Express API or a Django service was graded on its HTTP
responses, its GitHub metadata and a **filename listing** — nothing about the code inside it. That is
exactly the population where AI-assisted development concentrates.

Their published 549-repo study (deterministic rules, no AI pass, re-runnable) quantifies what Pulse
was missing: `dangerouslySetInnerHTML` in **42.6%**, injection-category findings in **47.5%**, and a
`.gitignore` that exists but does not cover `.env` in **35.7%**. Pulse could see the third only as
"a .gitignore is present" — which PASSES that case — and the other two not at all.

**New family `pulse-checks/web-repo-source.ts` — 17 checks.** Registry 819 → 836.

| Group | Checks |
|---|---|
| Injection & unsafe code | raw HTML rendering, SQL string-building (4 idioms), `eval`/`new Function`, shell built from a variable, `pickle`/`yaml.load` |
| Credentials | `.gitignore` CONTENTS vs `.env`, hardcoded passwords, Supabase RLS from committed migrations |
| Framework defaults | `DEBUG = True`, `ALLOWED_HOSTS = ['*']`, JWT verification off / `alg: none`, CORS from source, helmet |
| Transport | TLS verification disabled, plaintext outbound URLs |
| Supply chain | `curl \| sh` in the README, unpinned deps / no lockfile |

⚠️ **This family carries the highest false-positive risk in Pulse**, because unlike the platform
families it matches PATTERNS in ordinary application code rather than reading a named config value.
So the tests are mostly about staying QUIET — on template code, placeholders, `localhost`, comments —
and three findings are deliberately softened: raw HTML drops to WARN when a sanitiser is present, a
password literal drops to WARN when it looks like a placeholder, and wildcard CORS is only a FAIL
when credentials are also enabled. **A scanner that fires on every React app is worse than none.**

### 38.1 The cost trade, made deliberately

`SOURCE_EXTENSION.none` was `null`; it now samples JS/TS/Py/Rb/PHP/Go/Java/C#. Every repo scan pays
for this, where before only the mobile minority did — so the web cap is **`WEB_SAMPLE_CAP = 80`**,
not the mobile 150. Config reads grew too: `.gitignore` (contents, not existence), shell scripts, and
`migrations|supabase|db|sql/*.sql` for the repo-side RLS check.

### 38.2 What else is worth taking from them (NOT built — Dan's call)

- **Benchmark percentile.** They publish a distribution over 549 repos, so a score reads
  "worst 15% of AI-built apps" rather than "61/100". Pulse has no corpus. This is the single biggest
  remaining idea, and it compounds: every scan we run could feed it.
- **A ready-to-paste Claude prompt per finding.** They ship one with every result. Foundry already
  puts Claude Code in front of clients, so this is a natural fit and needs one optional field.
- **Six legible subscores with published weights.** Theirs: Secrets 30 / Injection 20 / Auth 15 /
  Data exposure 15 / Dependencies 10 / Transport 10. Pulse has 26 categories, which is more accurate
  and much less legible on a client report.
- **A per-rule finding cap** (they use 10/rule, 300/repo). `MAX_SITES_QUOTED = 5` applies that idea
  within this family only.

⚠️ **Do not assume their calibration is better than ours.** Their security median is **97 (A)** with
353 of 549 repos scoring A — a distribution that says most vibe-coded repos are fine, which does not
match what a hand review of a real client app finds (§34: 10 FAIL / 12 WARN on a shipping iOS app).
Their *coverage* of web repos was better than ours. Their *severity calibration* looks generous.

**Verified:** `npm run verify` green — tsc + lint 0 errors, 696 tests, audit:ui 0 findings. Tests
proved to discriminate by breaking three things on purpose: comment stripping (1 fail), the
`.gitignore` contents test reduced to a presence test (1 fail), and the localhost exclusion (1 fail).
**Deferred:** as with §37, validated against fixtures rather than real repositories.

## 39. Recent Changes (July 2026) — Pillars, a real benchmark, and cleanliness that measures code

Three changes, all prompted by reading a competitor properly (ogbuilds.ai) rather than copying its
feature list. Registry 836 → 845.

### 39.1 Pillars — six legible subscores with published weights (`pulse-checks/pillars.ts`)

Pulse grades 845 checks across 26 categories in 12 domains. That is more accurate than any
six-bucket rollup and much harder to read: a client sees a number and then a wall, with no answer to
"which part is the problem?" Competitors get an inferior measurement and a better conversation.

Six pillars, weights **published** so they can be argued with rather than buried in a formula:
**Security & secrets 30 · Access & data 15 · Code & maintainability 15 · Reliability 15 ·
Legal & compliance 15 · Experience & reach 10.**

Three properties make it honest, each with a test:
- **Nothing hand-maintained.** Every category maps to exactly one pillar; `unassignedCategories()` /
  `duplicatedCategories()` must both be empty, so adding a category in `categories.ts` and forgetting
  it here FAILS rather than scoring nowhere.
- **Weight is redistributed, never assumed.** A pillar with nothing applicable (an iOS app has no
  SEO checks) is dropped and its points shared across the pillars that applied — and it is *named* as
  dropped. Scoring it zero, or on nothing, is the "we could not look" → "it is not there" failure.
- **It reuses the score's own rules.** Same exclusions as `computeScoreBreakdown`. A test asserts the
  two agree on the same checks; if they ever disagree a client will find it before we do.

### 39.2 Benchmark — the existing one, made trustworthy (`getIndustryBenchmarks`)

⚠️ **A benchmark already existed.** I nearly shipped a parallel module before finding it — grep
first. It was rewritten in place rather than duplicated, because two benchmarks disagreeing is worse
than one weak one.

What changed and why:
- **Segments on `PulseScan.platform`, not the AI's `projectClassification`.** That free-text label is
  regenerated per scan, so "SaaS platform" and "B2B SaaS" never matched and peers were lost silently —
  and it required AI to have run, so a checks-only scan (the fast path since §18) could never be
  benchmarked at all.
- **Widens instead of returning nothing** when the platform segment is too small, and sets `widened`
  so the report says which happened.
- **A `caveat` sentence ships WITH the figure**, naming the corpus and stating plainly that this is
  Pulse's own scan history, not an industry survey. A percentile gets screenshotted into a deck and
  outlives its context.
- **Stops loading `llmAnalysis` for every scan in the workspace** to read one nested string — a large
  JSON blob per row for a number already in a column. Adds a 12-month window.

### 39.3 Cleanliness — structural debt, measured (`pulse-checks/code-cleanliness.ts`, 9 checks)

Pulse treated maintainability as a checklist (is there a README, a linter, a CI file). Those are
facts *about* a repo, not about its code — a project can have all three and be a 4,000-line file
nobody dares change. **This is the pillar that predicts COST rather than risk**, which for an agency
inheriting client codebases is the more useful number more often, and the one nobody measures before
quoting.

Three real analysers — the only actual algorithms in Pulse's check layer, everything else being
pattern matching:
- `commentedOutCodeLines` — distinguishes commented-out CODE from prose. This distinction *is* the
  check: a comment explaining why is the most valuable thing in a file, and a check that fires on
  documented code punishes exactly what it should encourage.
- `maxNestingDepth` — control-flow depth, brace- or indentation-based.
- `detectDuplication` — sliding-window hashing over normalised lines. Excludes all-import windows
  (every file shares those) and windows with <3 distinct lines (a run of closing braces is not
  duplicated logic).

### 39.4 ⚠️ Two defects found by running it against a REAL repo, which the unit tests passed through

Dan supplied `tmoreton/tutorials`. §34.3's lesson held again — **validate a new family against a real
codebase, because unit tests pass while checks are wrong**:

1. **Nesting counted object literals as nesting.** The two files it flagged were an AWS CDK stack and
   an SDK entrypoint: nested *config*, with three levels of actual control flow. As written, the check
   would fire on any config-heavy or JSX-heavy file — the "fires on every React app" failure that
   makes a family worthless. Now only control-flow and function braces count (`opensABlock`), with a
   regression test both ways: config-heavy reads 1, genuinely nested still reads 5.
2. **`.gitignore` was read at the repo root only.** That repo is a monorepo whose sub-project
   `.gitignore` correctly covers `.env` while the root one holds `.DS_Store` — a completely normal
   layout that produced a false positive. The config pattern now matches `.gitignore` at any depth.

After both fixes that repo reports clean, which it is.

**Verified:** `npm run verify` green — tsc + lint 0 errors, **738 tests**, audit:ui 0 findings.
**Deferred:** the pillar breakdown and benchmark caveat are computed but not yet rendered in the
report UI — pillars derive from `scan.checks` per §8, so that is a presentation change with no
server work behind it.

## 40. Recent Changes (August 2026) — Client intake API, and the sidebar is products only

### 40.1 Clients can push their own bugs/feedback/feature requests in

A client asked to push items from their tracker into Foundry rather than re-typing
them. Built for **any** client, not one integration: every client wiki already had
an intake token, so this extended `POST /api/public/wiki-items/[token]` rather than
adding a parallel credential system. Operator + integrator guide:
**`docs/client-intake-api.md`** (send it to the client as-is).

What was added: `status`, `externalUrl` (deep link back to their item) and
`attachmentUrls`; **PATCH `/[ref]`** to update, addressed by OUR id or THEIR
`externalRef`; **GET `?items=1`** to reconcile; and vocabulary aliases so
"Feature request" → TASK, "P1" → HIGH, "Done" → CLOSED. Anything unrecognised is a
400 naming the field, never silently coerced.

**The real blocker was the key.** There was no way to obtain a token short of
database access, which is why a client asking for "an API key" couldn't be given
one. It is now surfaced in **Portal → client → Wiki → Settings → `02 // API
INTAKE`**, with the token, every endpoint pre-substituted, a worked `curl`, and
Rotate.

⚠️ **Never hand a client the workspace `API_KEY`.** It authorises every `/api/`
route for the whole workspace. The intake token authorises one thing for ONE
client, and since the token *identifies* the client there is no way to express
"write to a different client's wiki".

**Two defects only end-to-end testing found** (verified against production against
a second client, not just Wedge):
- Enabling API intake minted a token but did **not** switch on the Requests
  section — and pushes are rejected while that's off. So you could enable the API,
  send a client the token, and every call would fail reporting *"Invalid intake
  token"*, pointing at the credential when the credential was fine. Enabling now
  turns both on, and the API names the real cause.
- A malformed image upload returned `500` with sharp's internal error string
  (`pngload_buffer: libspng read error`) — wrong status and an internal library
  message leaked externally. Now a 400.

**Screenshots: links AND uploads.** `attachmentUrls` are stored as links and never
fetched (fetching a caller-supplied URL is an SSRF vector). Real bytes go to
`POST /api/wiki/[token]/intake-items/[id]/image` (multipart `file`, ≤8MB) — which
matters because a link into a client's private tracker often 403s for us.

**Rate limited** (`wiki-intake-limit.ts`): 300 new items/hour, 1000/day per client.
Counts items *created*, not requests received — a retry loop resending the same
`externalRef` is already deduped to zero rows, so it costs nothing, while genuinely
new items are what needs a ceiling. Only `source: "api"` rows count, so a client's
misbehaving integration can never block the team filing a request by hand. A dry
run is never billed. The threshold logic is pure and unit-tested.

**Status webhook out** (`wiki-intake-webhook.ts`, optional, off by default): we POST
`request.promoted` / `closed` / `updated` / `deleted` so a client's tracker follows
without polling. Three things done deliberately — the destination host is validated
through the Pulse SSRF guard and **re-checked on every delivery** (a hostname that
resolved publicly when saved can be repointed at `127.0.0.1` later); deliveries are
**signed** `X-Foundry-Signature: sha256=<hmac>` with a per-client secret shown once,
because without it a receiver can't tell our POST from anyone else's who learned the
URL; and delivery is **fire-and-forget with a 4s timeout**, so a client's dead
endpoint can never slow or fail the Gitwork user who just closed a request. A
client's own PATCH does not fire a webhook back — that would loop.

**Per-integrator keys** (`wiki-intake-keys.ts`, optional): named keys so a client
with several systems can have one revoked without breaking the others. Deliberately
**layered on top of** `courseIngestToken` rather than replacing it — that token is
live (Wedge's course feed uses it) and is resolved at eight call sites, so a
presented key is translated to the canonical token at the edge of the public routes
and every lookup downstream is untouched. Only a SHA-256 hash is stored.

⚠️ **Wedge's shared token also serves the golf-course feed**, so rotating it breaks
both. Named keys avoid that.

### 40.2 The sidebar is the seven products

`Foundry HQ · Pulse · Code · Docs · Portal · Care · Backstage`, then Handbook.
Everything else moved to an entry point per §4a: **Studio → Settings → Labs**,
**Analytics + Starters → mono links in the HQ context strip**, **Settings → the
profile flyout**, and **View-as collapsed behind one row** inside that flyout
(expanded it is you + every restricted admin + a teammate picker + two presets,
long enough to bury Settings, Theme and Sign out). Rows were also tightened —
smaller logo, 16px icons, `py-1.5`, 11px descriptors — 14% less nav height with the
descriptors kept, then the descriptors themselves cut to **2–3 words** for another
30px (367 → 337). That length is now a rule in DESIGN.md, and it is about layout,
not taste: at the 280px rail a descriptor gets ~204px, so "Proposals, SLAs, SOWs and
other documents" wrapped and made that row 62px against every other row's 47px. Two
ragged rows is what made the rail look unevenly spaced. Say what the product **is**
("Developer vetting"), not what it contains.

⚠️ Moving Studio under Labs **narrows** it from the `studio` module permission to
Super Admin, because Labs is Super-Admin-gated. If a staff member needs Studio it
needs its own entry point.

**The top band was left 48.6px out of true by the smaller logo.** The sidebar's brand
cell and the page header sit side by side and are meant to show one continuous hairline,
but they are **not in a shared grid row** — the rail spans full height and carries its own
brand block — so nothing structural kept them level. Shrinking the logo moved one line and
not the other: brand at 81px, header at 129.6px. Both now read `HEADER_BAND_H` /
`HEADER_BAND_MIN` in `app-shell.tsx`, measured level at **80px** (off by 0). The page `<h1>`
came down 44px → 28px with it, and title + subtitle **truncate with a `title=` attribute**
rather than wrapping: wrapping would grow the band and break the alignment again, while
truncating without `title=` is a TRUNCATED defect under `audit:clipping` — it has to be both.

⚠️ **44px is still right elsewhere.** `{typography.heading-1}` stays 44px for the public
and standalone pages (`/timeline/[token]`, `/sign/[token]`, marketing) where a full-bleed
serif headline is the point; it was only ever wrong *inside the app shell*, where it made
the band 129.6px on every page. **`src/components/demo/demo-shell.tsx` still has the old
44px header and `pb-5 pt-7` band** — it is a separate mirror of the shell used by the 16
public sales demos, and its two sides do not line up either. Left alone deliberately rather
than restyling customer-facing sales material in a UI-tidy PR; worth doing as its own change,
and those pages are public so they can actually be verified in a browser.

### 40.3 Two infrastructure fixes that were failing deploys

- **Deploys raced.** Every run pushes the same `:latest` tag then restarts the box,
  so two overlapping deploys meant **whichever finished last won — including an
  older commit**. A fix that reported "deployed successfully" was not running.
  `deploy.yml` now has a `deploy-production` concurrency group; `cancel-in-progress`
  is deliberately **false** so a run can't be interrupted mid-SSH and leave the box
  half-deployed.

  ⚠️ **A `cancelled` deploy in the feed is usually NOT a failure, and does not mean
  the commit didn't ship.** `cancel-in-progress: false` protects the *running* job,
  but GitHub still only keeps **one run queued per group** — push twice in quick
  succession and the older *pending* run is cancelled by the newer one. That is
  harmless here only because every run deploys the **tip of `main`**, so the newer
  run builds a superset that already contains the cancelled run's commit. Observed
  live on 2026-08-05: `901776ff` was cancelled while queued and its content shipped
  in `d70039cf`. Before concluding a change is missing, check whether the cancelled
  commit is an ancestor of whatever did deploy
  (`git merge-base --is-ancestor <cancelled> <deployed>`) — and don't re-push to
  "force" it, which just queues another run.
- **The Docker build OOMed.** Nothing set `NODE_OPTIONS`, so the build used Node's
  default heap and the app has outgrown it at ~100 routes — deploys failed
  seemingly at random depending on what a commit touched. Now
  `--max-old-space-size=6144` in the builder stage only.

⚠️ **`npm run verify` cannot catch a prerender error** — only `next build` can. A
`useSearchParams()` added without a Suspense boundary passed tsc, lint, tests and
`audit:ui`, then broke the production build. **Run `npx next build` before pushing
anything that touches a page or its client hooks.**

## 41. Recent Changes (August 2026) — The Docs architecture review (Routes A–C) + the renderer's ceiling

Prompted by Dan's read of the Docs editor: *"nothing necessarily… it just doesn't feel optimised.
The layouts feels tight and slow… something just feels off and outdated."* Not a missing feature —
three separate complaints, each of which turned out to be measurable. Three PRs, all merged:
**#544** (layout + performance), **#545** (the text engine), **#546** (the editing model + the
renderer). One follow-up open at the time of writing (**#547**).

### 41.1 "Tight" — the canvas was rendering the document at 49–81% of A4

The editor canvas is meant to show an A4 page. It was showing a squeezed one at every width below
~1432px, and badly at the low end: **49% of A4 at 1024px**. The cause was the options rail's
padding compounding with the canvas's own, so the page had nowhere to go.

⚠️ **The first measurement of this was invalid, and the way it was invalid is worth knowing.**
Tailwind only emits arbitrary classes it finds *in source*, so deleting `lg:pl-[268px]` removed it
from the compiled CSS — and the "before" run then reported 100% everywhere, i.e. no bug. Each
state has to be **built separately and measured against its own CSS**. An earlier claim in the
plan that 1440 rendered at 95% was also wrong (double-counting the `sm:p-6` the rail padding
replaces); it was already 100%, and the real defect is bounded below ~1432px.

Route A also **kept the outline** rather than merging it into the options rail — the first plan
proposed merging them, and Dan pushed back: you would lose the outline exactly when you need it.
It collapses to a slim numbered strip instead; the options panel is the one that overlays.

### 41.2 "Slow" — three whole-document `JSON.stringify` per keystroke

Per keystroke, on the whole document. Plus 38 dnd-kit rows re-rendering, and a `signature` memo in
`paged-document.tsx` that re-ran the pagination on every render. Fixed by moving the dirty check
**inside** the 900ms debounce, mounting the observers once with refs, and a stable-callback pattern.

`updateDocument` also stopped doing `deleteMany` + `createMany` on every save. It now runs a plan
(`src/server/documents/section-writes.ts`, pure and unit-tested) that updates what changed, creates
what is new and deletes what is gone. ⚠️ It trusts an id **only when it names a row we already
hold** — the editor mints `draft-section-<uuid>` for unsaved blocks — and compares payloads through
`canonicalise` from `provenance/digest`, because jsonb does not preserve key order and a naive
compare would rewrite every section on every save.

### 41.3 "Outdated" — and the thing that was actually the ceiling

The text layer was hand-rolled regex over a `<textarea>` (45 fields showing literal `**asterisks**`)
and a `contentEditable` driven by `document.execCommand` (5 fields). Route B replaced both with
TipTap/ProseMirror behind **one** component, `src/lib/sections/rich-text-field.tsx`, a drop-in for
both outgoing substrates.

**Markdown stays the stored format.** 19 files render it back out, so the seam
(`src/lib/sections/markdown-doc.ts`) has to round-trip byte-for-byte. The contract
(`markdown-roundtrip.test.tsx` + `markdown-corpus.ts`) was written **against the old engine first**,
precisely so the replacement could be held to it rather than to whatever it happened to do.

**But the editor was never the limit — the renderer was.** `renderLines` (`src/lib/markdown.tsx`)
understood a paragraph, a **flat** bullet list and the inline marks in `INLINE_RE`. Measured:
`1. One` → `<span>1. One</span>`; `- a\n  - nested` → one flat `<ul>`. So Route B had to *clamp the
editor's schema* to match, and the toolbar stayed at five verbs — a button that writes syntax the
renderer cannot draw ships a literal `1.` onto a client's proposal.

#### The rule that follows, and it is permanent

**The editor's schema may never be wider than what `renderLines` can draw.** `markdown-doc.test.ts`
is the tripwire. Headings, blockquotes, code blocks and horizontal rules are still out — a heading
*inside* a prose block competes with the document's own section headings and `NN` numbering, which
is a layout decision, not a renderer gap.

⚠️ **Removing a node from the schema is not enough.** markdown-it still EMITS its tokens and
prosemirror-markdown **throws** on an unmapped one, so the first cut meant any stored document
containing `## x`, `> x`, a fence or `![alt](url)` **crashed the editor on open** — strictly worse
than the literal syntax it was preventing. The rules are `.disable()`d at source now, so the tokens
never appear and each construct degrades exactly as the renderer already draws it.

### 41.4 The renderer learned ordered and nested lists (#546)

Mostly deletion: `parseListLine` → `buildListTree` → `renderListTree` already existed 180 lines up
the same file and already handled ordered lists and unlimited nesting. `renderLines` had its own
accumulator that threw the indentation away.

**Parsing and nesting now live in `src/lib/markdown-lists.ts`** — framework-free, imported by both
the client renderer and `document-to-html.ts`. They had genuinely drifted: the Drive backup emitted
`<ol>` while the page drew literal text, so the same list was a real ordered list in the client's
Drive copy and a numbered paragraph on the page they read. It also tested all-bullets **or**
all-numbers, so a nested list of a different kind from its parent fell through to a paragraph with
markers showing. `renderer-agreement.test.tsx` holds both to the same tag sequence over the corpus.

⚠️ **A live data-mangling bug shipped in #545 and was found by this work.** `ordered_list` had no
`getAttrs`, so markdown-it's `start` was never read: open a document containing `100. Item`, type
one character in that field, and the autosave wrote back `1. Item`. The author's number, gone.
It was invisible because ordered lists rendered as literal text, and **#545's own round-trip test
could not catch it** — its only ordered-list fixture was `1. One\n2. Two`, which passes whether or
not `start` is read. **A fixture that cannot distinguish the bug from the fix is not covering it.**

⚠️ **The near-miss:** `renderListTree` applied `text-[var(--text-2)]` to the top-level list —
correct for block Markdown, wrong for a document field, which never had a colour on its lists.
Routing fields through it would have changed the colour of **every bullet in every existing
document**, as a side effect of adding ordered lists. The scale is a caller option now, with a test
asserting the bullet classes did *not* change.

**Two changes are visible on documents clients already hold**, both intended: a sent proposal
containing `1. One` now renders as a real ordered list on its public view, and taller lists mean
`packPages` can add a page.

### 41.5 Things that generalise

- **`/app` is auth-gated with no staging, so none of this was visually verified pre-merge.** The
  technique that helps: server-render a gated component with `renderToStaticMarkup` inside the real
  providers, wrap it in the compiled CSS and screenshot it (§39.1). It does not run effects, but it
  checks real geometry — it is how two layout bugs in the badge studio were caught.
- **Prove tests discriminate by breaking things on purpose.** Every claim in #546 was checked that
  way: dropping the ordered branch fails 2, stripping the indent 3, dropping `start` 1, flushing a
  flat list 5, re-hardcoding the scale 1, reverting the server renderer 9 agreement cases.
- **Comments get the same treatment.** Two in this work were confidently wrong and only found by
  deleting the thing they described: `breaks: true` was documented as essential to preserving a
  single newline and removing it failed *nothing* (the `softbreak → hardBreak` mapping is what
  carries it), and a `lastEmitted` echo-guard was described as protecting the caret when the
  `focused` check does that. **If deleting the code changes no test, the comment claiming it is
  load-bearing is wrong.**
- **jsdom does not drive ProseMirror's text-input path.** A test that "types" a slash asserts
  against its own simulation. Toolbar commands are a real code path and work; typing does not.
  Where a rule cannot be driven, export the predicate and assert it directly (`isBlockMenuTrigger`).

### 41.6 Cover contents, and Gitwork's identity (#547)

The cover can show an **`INSIDE` contents list** — the document's own block titles, numbered.
On by default for `PROPOSAL`, off for other types; an explicit `showContents` always wins.

⚠️ **Derived at render, never stored** (`src/lib/sections/cover-contents.ts`). A stored copy would
be correct exactly once — rename, add, hide or reorder a block and the cover would advertise the old
contents to a client. Deliberately the **opposite** call from `Countermark` (§38) and
`OnboardingForm` (§16), which snapshot, and for the opposite reason: those record what was true at a
moment, this describes the page it is printed on. Hiding a block **renumbers** rather than leaving
`01, 02, 04`, which reads as a missing page to the one audience a cover is for.

**Gitwork's company details now live in `src/lib/gitwork.ts` and nowhere else.** They were
hard-coded at **eight sites in three formats** — the NDA template's contractual preamble, the cover
letterhead, the portal footer, the parties editor, the demo data. Same failure mode as the
model-name literals in §31.

⚠️ **They had already drifted: three different registered-office addresses were live** — one
dropping "Anchorage Quay", one adding "Manchester". The NDA template's form is canonical, being the
wording inside an actual contract rather than a page decoration; the letterhead keeps a shorter form
deliberately (fixed-width mono strip), and a test asserts that difference is intentional.
`gitwork-identity.test.ts` sweeps source for the company and VAT numbers and **fails naming any file
carrying a copy** — it found three sites a hand grep had missed.

**MCP tool descriptions now state which Markdown subset renders.** No MCP route needed changing for
any of the above — `update_document` calls the same `updateDocument` as the editor — but the tool
never said what a text field supports, and the builder's own toolbar *cannot* write a heading. So
**MCP was the one way into the product that could ship a literal `## Scope of work` onto a client's
document, silently.** Keep `MARKDOWN_SUBSET` in step with `docExtensions`; a stale allow-list there
is worse than none, because an agent will believe it.

Also: `buildBlockGallery` wrote the registry key into `description` as a key→file trace affordance,
and `description` is rendered as the **subtitle of the block's editor panel** — so every gallery
block opened with a stray lowercase `cover` / `faq` above its first control. A builder's convenience
in the place a reader looks first. **"Save as snippet"** was removed from the block panel (the
`/api/snippets` route and library are untouched, so it is reversible).

### 41.7 Known gaps

- **Canvas drag-to-reorder is deliberately not built.** Reordering re-paginates, so a dragged block
  can jump to another page mid-gesture — the same churn class as the drifting-caret bug — and the
  outline rail already does it reliably. Hardest part of Route C for the least new capability.
- **Short-label fields are still the old `InlineTextArea`.** Route B's scope was prose fields; those
  45 fields still show literal `**asterisks**`. The Numbered-list command correctly stays inert on
  them (a field only lights the commands it declares).
- **There is a FOURTH Markdown renderer** — `src/components/clients/wiki/wiki-page-editor.tsx`,
  using `dangerouslySetInnerHTML`. It escapes `& < >` up front so it is not obviously unsafe, but
  the client intake API (§40.1) writes into that surface and nothing holds it to the other three.
- **The cover editor still shows every field always.** Making fields addable/removable — across all
  blocks, not just the cover — is an open design question, not a coded decision.

## 42. Recent Changes (August 2026) — Care tells you whether a reply was actually sent

Dan's charge was that Care could not be trusted for the one question a support desk exists to
answer — *"has this been replied to?"* — so the team worked out of the mailbox instead and Care
drifted further out of date. Reading the code, the complaint decomposed into **five independent
defects**, four of which made Care actively state something false. None was a missing feature in
the sense of "we never got to it"; each was a mechanism that produced a confident wrong answer.

### 42.1 The five defects

1. **There was no reply state at all.** `SupportConversation` recorded no notion of who spoke
   last. The only "first reply" timestamp in the schema is `SupportTicket.firstReplyAt`, and
   tickets are **dormant** in the cockpit (schema note, line ~2553), so nothing in Care read it.
2. **`unread` was raised by ANY new message, including our own.** `runChannelSync` set
   `unread: true` whenever it created messages, and Gmail's `threads.get` returns the *entire*
   thread — so **a reply you sent from Gmail re-flagged the conversation as unread on the next
   sync**. The badge grew because of your own replies. (CLAUDE.md §33 fixed nothing ever
   *clearing* `unread`; this is the other half — something wrongly *setting* it.)
3. **The IMAP connector never read the Sent folder.** It opened `INBOX` only, so a reply typed in
   Apple Mail / Outlook / webmail was invisible to Care and the thread showed as unanswered
   **forever**. This is precisely the "sometimes we go straight to the email" gap: Gmail happened
   to be fine (whole-thread walk), IMAP structurally was not. Flagged as optional/v2 in
   `docs/care-imap-smtp-connector-plan.md` line 85 — it is not optional if Care is the record.
4. **Conversations were ordered by `receivedAt`, which is stamped once at creation and never
   updated.** So the list sorted by *when a thread started*. A months-old thread that got a reply
   an hour ago sat at the bottom — past the 100-row page limit, i.e. gone.
5. **On manual-reply channels the reply was never recorded.** The messages route was *built* to
   log replies for sources with no automated send path ("still get logged so the copy-to-send
   flow works"), but the UI's manual button only ever wrote to the clipboard and never called it.
   App Store Connect replies therefore left **no trace in Care at all**.

### 42.2 The design — store facts, derive the judgement

New pure module **`src/server/support-reply-state.ts`** (no Prisma, no I/O, 17 unit tests).
The conversation stores only what a connector can *observe* — `lastInboundAt`, `lastOutboundAt`,
`lastMessageAt` (additive, nullable → applies via the guarded `prisma db push`) — and
`deriveReplyState()` decides `awaiting_reply | replied | no_inbound` from them at serialize time.

**The reply state is never stored, and that is the whole point.** A `repliedAt` column can only
be correct if every reply goes through Care, and they demonstrably do not. A flag nobody updated
reads exactly like a conversation nobody answered. Deriving it means a reply sent from *anywhere*
flips the state the moment a sync sees it, with nobody marking anything — so the board self-heals
instead of drifting. Same call as Docs cover contents (§41.6): derive what describes current
state, snapshot only what records a moment.

⚠️ **`replied` requires the outbound message to be STRICTLY newer than the inbound one; an exact
tie returns `awaiting_reply`.** The two errors are not symmetric — a false "replied" hides a
customer who is actually waiting, which is the failure this work exists to remove, while a false
"awaiting" costs one glance. **Never relax `>` to `>=`.** There is a test named for it.

⚠️ **The three columns are REQUIRED (not optional) in `serializeConversation`'s parameter type.**
A caller that narrowed its `select` and omitted them would otherwise get a silent, confident
`no_inbound` on a conversation that is really awaiting a reply. Requiring them makes that a
compile error.

### 42.3 What changed per defect

- **`recordMessageActivity()`** (`support.ts`) is the single writer for the stamps, shared by the
  channel core, the Gmail adapter and in-app replies, so no connector can forget them. It sets
  `unread` **only when an inbound message landed** — which is defect 2. New conversations are now
  created `unread: false` and raised by a real customer message, so an outbound-only thread (one
  we started, or one reconstructed from Sent) never arrives pre-flagged.
- **IMAP reads Sent** (`imap.ts`). The mailbox is found by its RFC 6154 **`\Sent` special-use
  flag**, not by name — names are non-standard *and localised* (`[Gmail]/Sent Mail`,
  `INBOX.Sent`, `Sent Items`), so name-guessing fails silently on exactly the mailboxes that
  matter. `sentFolder` overrides; `readSentFolder: false` disables. Existing Message-ID dedup and
  References threading merge the sent copy onto the right conversation with no new logic.
  ⚠️ Messages found in Sent are marked outbound **because of where they are**, not by comparing
  the From address — a mailbox that sends from an alias (`support@` vs `app@`) would otherwise
  have its own replies classified inbound, marking the thread unread and stranding it in the
  awaiting queue. A Sent-discovered thread takes its `customerLabel` from `To`, else the operator
  shows up as the customer on their own board.
- **Ordering is by `lastMessageAt`** (nulls last, `id` tiebreaker so cursor pagination cannot skip
  or repeat a row). `receivedAt` keeps its meaning as the thread start.
- **"Copy & mark replied"** on manual channels copies *and* logs, so the thread stops claiming it
  is unanswered. The copy happens first and independently — a failed log leaves the draft intact
  and shows an error rather than silently losing it.
- **`backfillConversationActivity()`** populates history. Bounded (500/run, chunked 25-wide) and
  **self-terminating** — it only matches rows with a null `lastMessageAt`, so a drained client
  costs one indexed lookup. That is why this needed no migration, no one-shot route and no manual
  step: it runs on the ordinary sync path. A conversation with no captured messages is stamped
  from `receivedAt` rather than skipped, or it would re-match the filter every sync forever.

### 42.4 UI — the queue is now "awaiting reply", not "needs action"

`SAVED_VIEWS` leads with **Awaiting reply** (the default) and adds **Replied**; "Needs action"
became "All open". The awaiting view sorts **longest-waiting first** — a triage board that buries
the oldest unanswered message under today's noise is how things fall through. Rows carry an amber
left accent bar plus a `Awaiting reply · 3h` chip that escalates past `LONG_WAIT_HOURS` (24);
the detail pane states whose turn it is outright. Care home's headline number is now **Awaiting
reply**, not active-conversation count, which overstated the backlog and was easy to ignore.
The legacy `/app/support` dashboard reads the **same** server-derived field (a shared dot +
`lastMessageAt` timestamp) so the two UIs cannot tell an operator different stories.

⚠️ Amber, not red — priority owns red, and a board where everything is red says nothing.

### 42.5 Verified / not verified

`npm run verify` green: tsc + lint **0 errors** (30 warnings, all pre-existing — confirmed
identical on the stashed tree), **1534 tests** passing across 113 files, `audit:ui` **0 findings**
with its self-test passing. `npx next build` clean, 98 static pages, no database. The 21 new tests
were **proved to discriminate** by breaking three things on purpose: relaxing the tie to `>=`
(1 failure), raising `sawInbound` for any message (1), and dropping the backwards-drag guard (1) —
each failing only the test named for it.

**Not verified:** none of this was seen in a browser. `/app/care` is auth-gated, there is no
staging and no local DB, so the reply-state chips, the awaiting queue and the Sent-folder read
have not been driven against real data. **Post-deploy, in order:** hit **Sync now** on each Care
client once (that is what runs the backfill — until it does, existing conversations read "No
customer message" and the Awaiting queue is empty, which looks like a broken feature rather than
a draining one); confirm rows show Awaiting/Replied correctly; reply to a thread **from the
mailbox, outside Care**, sync, and confirm it flips to Replied — that single check is the whole
point of the change; then confirm the unread badge stops climbing on its own.

**Known limits:** Discord and App Store replies made outside Care are still undetectable — there
is no equivalent of a Sent folder to read — so those rely on "Copy & mark replied".
`AWAITING_CUSTOMER` on the dormant `SupportTicket` remains unused; reply state lives on the
conversation.

### 42.6 The views became server queries, so a 50-row page is safe

The first cut kept the cockpit's existing shape: fetch one page of conversations, filter it
client-side with saved-view predicates. That made every view silently mean "…among the rows we
happened to load", and the awaiting queue is the one list where that is unacceptable — an old
unanswered thread outside the page makes the queue look empty when it is not. **Shrinking the
page to 50 would have made that strictly worse**, so the filter moved into SQL first.

- **`listConversations` gained `replyState`, `unassigned`, `q` and `sort`**, and `SAVED_VIEWS`
  entries are now `ConversationListParams` rather than predicates. Source filter and search are
  server params too — searching used to match only loaded rows, the same class of lie.
- **Reply state is filtered with a Prisma field reference** (`lastOutboundAt lte
  fields.lastInboundAt`), so no raw SQL and no denormalised boolean to drift.
  ⚠️ A null `lastOutboundAt` needs **its own OR branch**: SQL comparisons against NULL yield
  NULL, not true, so without it the query drops exactly the never-answered conversations the
  queue exists for. ⚠️ It uses `lte`, matching `deriveReplyState`'s deliberate tie behaviour —
  **the query rule and the display rule must agree**, or a row appears under "Awaiting reply"
  wearing a "Replied" chip. `matchesReplyState()` pins the semantics and its test asserts the
  three states **partition** the space (exactly one match per conversation, so none is in two
  queues or in none).
- **Pagination is 50/page with "Load more"**, and the list says *"End of list · N shown"* when
  complete — so an empty queue is never confused with a truncated one.
- **Badges come from `getConversationViewCounts()`** (indexed COUNTs over the whole client), not
  from tallying loaded rows, which capped every badge at the page size. Care home uses it too,
  replacing a fetch of up to 100 conversation rows *per client* that existed only to be counted.

⚠️ **Optimistic triage patching had to be rewritten and this is the trap to remember.** The
cockpit used to hold every conversation under ONE key, so `patchConversationInCache` targeted
`["support","conversations",clientId]` directly. Now the key carries the view's params and the
cache is an infinite query of pages, so that lookup would have found nothing and **silently
stopped patching** — no error, just a UI that stopped feeling instant. It now sweeps every
conversation query for the client via `getQueriesData`/`setQueriesData` and handles both shapes,
and mutations invalidate the counts key as well, or the badges disagree with the list beside them.

### 42.7 The row redesign, and a bug the first cut shipped

Dan's read of the live list: *"very confusing, and things like this are present when we can see it
has been replied to"*, pointing at a row labelled **"No customer message"** whose preview plainly
read *"This has now been cancelled. Thank you…"*.

**The bug is mine and it is the §35 mistake again — "we could not look" rendered as "it isn't
there".** `backfillConversationActivity` derived `lastInboundAt` purely from `SupportMessage`
rows, so any conversation whose message bodies were never captured (empty body, a purge, a
pre-message-capture sync) got `lastInboundAt = null` → `no_inbound` → a confident *"No customer
message"* on a thread with visible content, **and** it dropped out of the awaiting queue
entirely. A conversation exists *because a connector ingested something inbound*, so `receivedAt`
is the honest floor: with **no** message rows at all it is now stamped from `receivedAt`. Rows
that DO exist are still trusted as-is, so a genuinely outbound-only thread (one we started, or
one rebuilt from the Sent folder) correctly stays `no_inbound` — now labelled **"Sent by us"**,
which says what it means. The same fallback runs in `runChannelSync` for a newly-created
conversation that yielded no messages.

**The row was carrying four competing status objects.** Reply chip + status chip + priority dot +
sentiment dot, all at the same visual weight — and two of them were *defaults*: `status: NEW`
printed a "New" pill on essentially every untriaged row, and neutral sentiment printed a dot on
nearly all of them. A signal that appears on everything is not a signal. The redesign:

- **Sender leads, not subject.** Support triage is about people, and the subject is frequently a
  reference number that identifies nothing (`Follow-up [Case 1001-134555]`).
- **One state readout**, in the house mono data-label voice rather than a bordered pill —
  `NEEDS REPLY` / `REPLIED` / `SENT BY US` / `SNOOZED`. It sits **first on line 3 at a fixed 80px
  width**, so the labels form an aligned, colour-coded column you can scan vertically; floating
  it right made a ragged edge across three lines. Status *wins over* reply state when snoozed or
  closed — a snoozed thread is in nobody's queue regardless of who spoke last — which is what
  removes the double-chip.
- **The readout carries no duration.** For an awaiting thread the last activity IS the customer's
  message and for a replied one it is our reply, so the line-1 age is already that number —
  printing both gave `6d … NEEDS REPLY 6D`.
- **Time is the alarm.** It ages the *latest* message and turns amber + semibold past
  `LONG_WAIT_HOURS`, so lateness is legible without another object on the row.
- Priority renders **only when urgent**, sentiment is gone from the row (it lives in the detail),
  the checkbox reveals on hover so a resting list is content rather than controls, and the
  assignee is a distinct muted tile — adjacent plain mono read as one string (`HB NEEDS REPLY`).
- The rail splits into **Queues** vs **Browse**; nine flat rows read as a filter dropdown. Only
  the awaiting count carries colour, because it is the only one that is a call to action.
- The detail pane's reply banner became a **rule + dot + sentence** instead of a filled alert
  panel that appeared on every thread including healthy ones.

**Verified by rendering, not by reading.** `/app/care` is auth-gated with no staging, so the list
was server-rendered against the app's **real compiled CSS** in headless Chromium (the §39.1
technique) at the true production rail width (`xl:w-80` = 320px) and at 390px. That caught two
things a code read did not: the `NEEDS REPLY 6D` / `6d` duplication, and that the first
screenshot's labels were *not* aligning — the injected CSS predated the arbitrary `w-[74px]`
class, and once rebuilt the measured longest label (`NEEDS REPLY` ≈ 73px) needed 80px with
`truncate` so a future longer label clips rather than shoving the preview out of column.
Horizontal overflow measured **0** at both widths via `documentElement.clientWidth` (per the
playbook — `innerWidth` lies). ⚠️ The first overflow reading of 227px was **my harness**, not the
component: I had written `flex-1` where the real section has `w-full`, so it shrink-wrapped to
content. Mirror the component's actual classes or the harness tests itself.

### 42.8 The redesign that mattered was in the connector, not the CSS

Dan's verdict on §42.7 was blunt and correct: *"it literally looks 90% the same … if you
understand the logic, the connectors, the premise of the product, you would know this is not the
world class way of handling customer support tickets."* The screenshot that came with it shows
why, and none of it is styling:

- **226 awaiting · 1 replied · 0 closed · 0 snoozed.** Nobody has ever burned this queue down.
- **"Fellas Loaded" is the sender on 12 of 15 visible rows.** It is a contact-form forwarder: the
  From line is the app emailing itself, and the customer is in the subject.
- **Subject and preview are the identical string on every row**, so the list is two copies of one
  line and nothing can be triaged without opening it.
- **Every row reads `NEEDS REPLY` in amber**, because the view is "Awaiting reply".

⚠️ **The root cause of the first two is one line each in `gmail.ts`**: `preview: subject` (never
updated afterwards, because the Gmail `run()` path only ever writes `connectionId` on an existing
conversation), and `customerLabel = from` display name. **I validated the row design against an
invented fixture — "Sarah Mitchell", "Priya Anand" — where every sender differs and every preview
is distinct. On that data the design was fine. On the real inbox it was unreadable.** This is
§34.3's lesson ("validate against the real thing; unit tests pass while the output is wrong")
applied to UI, and it should be the default: **screenshot a real client's data, not a fixture.**

**`support-channels/identity.ts`** (pure, 18 tests against real rows from that inbox):
- `resolveCustomer()` only overrides the From line when the mail is demonstrably the mailbox
  talking to itself (address match, display-name match, or a no-reply sender), then takes the
  first address in the subject, then the body. ⚠️ The dangerous failure mode is the reverse of
  the bug — replacing a genuine sender with an address that happens to appear in their subject —
  so "Björn Khermik" and "Sanmatin Matin" have tests asserting they are left alone, and the
  mailbox's own address is never selected back out of the subject or body.
- `derivePreview()` strips quoted history and signatures, unwraps `Message:` form labels, and
  **returns null rather than echoing the subject** — the UI then renders no third line at all,
  so the row collapses to two and more of the queue fits on screen.
  ⚠️ `--` on its own line is the RFC 3676 signature delimiter; matching only long dash rules let
  signatures into every preview. A test caught it.
- **`repairForwardedIdentities()`** fixes the 226 rows already stored, from their own message
  bodies (no Gmail round trip). Self-terminating with no schema change: it selects only rows that
  still show the defect (label equals a mailbox address/name, or `preview` equals `subject`), so
  a repaired client matches nothing next pass. Runs on the ordinary sync path.

**UI changes that follow from the data:**
- **The row state is hidden when the view already filters to it.** In "Awaiting reply" all 226
  rows are awaiting, so the label and the amber bar were the view's own name repeated 226 times.
  A signal that is constant within a view carries no information there. Shown only in mixed
  views (All open, All, Urgent…).
- **Keyboard triage — `j`/`k` move, `↵` open, `e` close, `s` snooze, `x` select, `Esc` clear.**
  This is the actual product gap: a mouse-only UI cannot clear 226 items, which is why the board
  reads 1 replied / 0 closed. Front, Superhuman, Missive and Linear are all keyboard-first for
  this reason. The handler ignores events from inputs/textareas/contentEditable so `e` stays a
  letter while the composer, search or notes field has focus, and after a close/snooze the cursor
  holds position so a run of closes walks down the queue instead of jumping back to the top. The
  shortcuts are printed once at the foot of the list — an invisible shortcut is unused.

**Verified:** `npm run verify` green — 0 errors, **1555 tests**, `audit:ui` 0 findings; `npx next
build` clean. The list was rendered against the app's real compiled CSS as a **before/after using
the actual Fellas Loaded rows**. **Not verified in a browser against live data** — /app/care is
auth-gated. **Post-deploy: hit Sync now on Fellas Loaded**, which is what runs
`repairForwardedIdentities` over the existing 226 rows; until it does, they keep the old labels.

### 42.9 The rest of the page — detail pane, empty state, Care home

§42.7–8 redesigned the list and fixed the connector; the other ~60% of the screen was untouched.
Dan's follow-up ("have you redesigned the ENTIRE page") was fair. What changed:

**The detail pane is a workspace, not a viewer.** It gave ~288px of permanent width to a rail of
three stacked `<select>`s, three snooze buttons and an always-open notes form — so the thread was
squeezed, and the two things an operator does constantly (read it, answer it) competed for space
with settings they change rarely. The verbs now sit in a **toolbar across the top** (Close ·
Snooze · Assign · Priority · Status · Notes), the **thread gets the full width**, and the
**composer is pinned and always visible**. That is the Front/Missive/Intercom shape, and it is
the correct one: answering is the job, so it should never be behind a click. Notes moved behind a
toolbar toggle — they matter, but a permanently-open notes form on a 226-item queue is 226 forms
nobody filled in.

⚠️ Caught by rendering it: the first cut had a **"Snooze" button beside a "Snooze for…" select** —
the same verb twice. Now one split control: the button does the common case (a day, matching the
`s` shortcut), the caret picks a longer one.

**The empty state carries the queue.** The largest area on the page read *"Select a conversation
to triage."* — an instruction, occupying the most space, telling you to do the thing you were
obviously about to do. It is now a **queue overview**: how many are waiting, how long the worst
one has waited, the four figures that matter (stat grammar per DESIGN.md — DM Serif figures, mono
unit labels), and one button that opens the longest wait. `Start with the longest wait` is the
only sensible first action on a 226-item board and now it is one click.

**Care home is a ranked list, not a grid of cards.** Cards are all the same size whether a client
has 0 waiting or 226, so the page could not answer the only question it exists for — *which
client is being let down right now?* It is now one row per client with the awaiting figure
leading, a left accent bar when the longest wait is stale, and secondary counts kept quiet. It
also **stopped fetching up to 100 conversation rows per client purely to tally them** (N clients ×
100 rows on every visit) — it reads `getConversationViewCounts` instead, which is both cheaper and
actually complete.

**Verified:** `npm run verify` green — 0 errors, **1555 tests**, `audit:ui` 0 findings (incl.
SELECT-CHEVRON/SELECT-PAD, which matter here because the toolbar added four selects); `npx next
build` clean. All three surfaces were rendered against the real compiled CSS at 1180×620 and
1000×430 with **0 horizontal overflow**. **Not verified against live data** — /app/care is
auth-gated, so the toolbar, keyboard shortcuts and composer have not been driven in a browser
session.

### 42.10 The repair matched nothing in production — and why the tests missed it

The fix in §42.8 shipped, the sync ran, and the board was **unchanged**: still "Fellas Loaded" on
every row, still subject-as-preview. Every unit test passed. Two defects, both from reasoning
about the data model instead of checking what is actually stored:

1. **The selection matched nothing.** `selfLabels` was built from `impersonateEmail` /
   `intakeAddress` — **addresses** — while the stored `customerLabel` is a **display name**
   ("Fellas Loaded"). They can never be equal. The other branch used a Prisma **field reference**
   (`preview equals fields.subject`) comparing a nullable column to a non-nullable one, which is
   at best fragile and was silently contributing nothing.
2. **Even a selected row could not be repaired.** The Gmail adapter stores `authorLabel` with the
   `<address>` **already stripped**, so at repair time `resolveCustomer` receives a bare name with
   no address, finds nothing to compare against the mailbox, and returns it untouched.

**The signal that works is the Care client's own name.** A "customer" whose name is the client's
own name is definitionally the app forwarding to itself, and `SupportClient.name` is available on
both paths. `IdentityContext.clientName` now carries it; `resolveCustomer` treats it as a
self-name alongside `mailboxName`.

The repair also stopped using a field reference: it selects plainly (`clientId` + `GMAIL`,
bounded, newest first) and decides **in JS** whether each row still shows the defect. Ordinary
code cannot fail silently the way that query did.

⚠️ **The lesson, and it is the same one as §42.8 one layer down.** The tests all passed because
every fixture was an idealised From line — `"Fellas Loaded" <support@fellasloaded.com>` — with
the address present. The database holds `Fellas Loaded`, full stop. **Fixtures must be the shape
the code will actually receive at the call site, not the shape the upstream format allows.** Four
tests now assert exactly the stored shape, including the guard that `clientName` must not become
a licence to rewrite a genuine sender.

**Also:** the empty pane was a small status card floating in a very large empty area. It now
carries a **"Next up"** list — the five longest waits, one click each — so the space does work
rather than just reporting a number.

**Verified:** `npm run verify` green — 0 errors, **1559 tests**, `audit:ui` 0 findings; `npx next
build` clean. ⚠️ **Still not verified against live data**, which is precisely how the previous two
attempts passed review and failed in production. The honest post-deploy check is: hit **Sync now**
on Fellas Loaded and confirm the rows relabel to customer addresses. If they do not, read
`repairForwardedIdentities` against a real row rather than adding another unit test.

### 42.11 Simplicity through hierarchy, not removal

Dan asked whether Care now follows the standard for this kind of app, whether Gmail was a better
model, and where connectors belong — with the real point being *"I just need it to be simple
enough to use and so far we have overcomplicated the actual functionality."* Offered a hard cut
of the state model, he chose **layout only, keep all features**. So the constraint is: make it
feel simple without removing anything.

**On the question itself, for the record:**
- **The layout already is the standard.** Views rail │ list │ reading pane is Gmail, Front,
  Missive, Intercom and Help Scout alike. Switching to "more Gmail-like" would change little,
  because Gmail *is* this layout with a different label system. Front is the right structural
  reference (multi-client, multi-channel, assignment); Gmail is the right bar for simplicity.
- **The complexity is the concept count, not the layout.** A Care conversation carries seven
  overlapping axes — status (5 values), priority (4), sentiment (3), reply state (3), unread,
  assignee, tags/issueType — across 9 saved views. Gmail runs on two axes and one verb (archive);
  Front on three. That gap, not the CSS, is what makes it feel heavy, and it is recorded here as
  a known, deliberately-accepted trade rather than an oversight.
- **Connectors belong where they are** — bottom of the rail under `03 // MANAGE`. They are setup,
  not daily work; Gmail does not put "add account" in the sidebar. Moving them above the queue
  would put configuration in the path of triage.

**What changed under the layout-only constraint: the detail toolbar became two tiers.** It had
six controls in one row — Close, Snooze, Assignee, Priority, Status, Notes — four of them
dropdowns at identical visual weight, which is what read as busy. Now:

- **Row 1, actions:** `Close` · `Snooze` (split button) on the left, `Notes` pushed right. These
  are the verbs pressed on essentially every thread.
- **Row 2, properties:** `Assignee` · `Priority` · `Status` as labelled fields (mono caps label +
  compact select, DESIGN.md's data-label voice), behind a hairline. They read as a property sheet
  rather than three more buttons competing with Close.

Every control is still present and still one click. Only priority carries colour, and only when
urgent — four equally-weighted levels means three of them asking for attention they do not need.

**Verified:** `npm run verify` green — 0 errors, **1574 tests**, `audit:ui` 0 findings (the
SELECT-CHEVRON/SELECT-PAD rules matter here — the properties row is three selects). Rendered
against the real compiled CSS at 820×600, 0 horizontal overflow. **Not verified against live
data** — /app/care is auth-gated.

### 42.12 The cockpit is an index and a record, not three columns

§42.7–42.11 were compliance and correctness passes: the connector identity fix, the house palette,
the numbered panels, the two-tier toolbar. Dan's verdict on the result was that it "looks almost
identical to what we have… I wanted [something] totally different", and he was right — none of that
touched the **information architecture**. It was still rail │ 320px list │ detail with tidier chrome.

**What was actually wrong was the layout, not the styling.** Every pane was permanently on screen,
so at 1440px the nine saved views ate a fifth of the width to show a filter set you touch a few
times a day, the list of work was a 320px sliver, and the thread was a sliver beside it. That is why
a 226-row queue was unreadable and why nothing was ever cleared. Offered a choice of reference
shapes, Dan picked **HubSpot — views as tabs, a sortable table, a bulk toolbar on selection, a
right-hand properties panel** — and explicitly **"keep DESIGN.md, change the layout only"**, so the
instrument chrome (mono `NN //` bands, mono data-labels, DM Serif figures) is unchanged throughout.

```
INDEX                                    RECORD
┌ client · queue readout · actions ─┐    ┌ client · ← conversations ─────────┐
│ tabs: the saved views             │    ├ customer · subject · Close Snooze ┤
│ search · channel · ⌨ hints        │    ├────────────────────┬──────────────┤
│ ┌ table, the full width ────────┐ │    │ thread             │ 01 // PROPS  │
│ │ ☐ CUSTOMER SUBJECT … WAITING ↑│ │    │ composer (pinned)  │ 02 // NOTES  │
└─┴───────────────────────────────┴─┘    └────────────────────┴──────────────┘
```

One thing at a time, each with the whole width — the index/record shape of every CRM and issue
tracker, and the reason a HubSpot table carries hundreds of rows legibly.

- **The list is a table.** Cards are three lines of mixed-weight text per row: fine for five, a wall
  at 226. Columns let the eye scan DOWN one attribute ("who has waited longest?", "what is
  unowned?"). New **`.app-table app-table--dense`** in `globals.css` — mono-caps headers, 8px/12px
  cells, per DESIGN.md's table grammar. ⚠️ Written `.app-table.app-table--dense` (0,2,0) because the
  base `.app-table thead th` is (0,1,2); a bare `.app-table--dense th` loses and does nothing.
- **The saved views are tabs**, keeping the QUEUES / BROWSE split as a hairline between groups.
- **Sorting is server-only, on one column.** `listConversations` can produce exactly two orders
  (`activity`, `oldest_inbound`), so WAITING is the only sortable header. ⚠️ **Do not add a header
  that sorts the loaded page** — that reintroduces the "…among the rows we happened to fetch" lie
  §42.6 removed. `SortHeader` exists to make that rule explicit at the call site.
- **`QueueOverview` is deleted, not moved.** A status card that only appeared when *nothing* was
  open is the wrong place for the state of the queue. Its headline is now a permanent mono readout
  in the client header, its four figures are the tab counts, and "Next up" is the table itself
  (sorted oldest-first). Nothing was lost; it stopped needing a pane.
- **Properties moved off the top of the thread into a `lg:w-[286px]` sidebar** (`01 // PROPERTIES`,
  `02 // NOTES`). Below `lg` the sidebar is a view you switch to via a **Details** toggle — one
  boolean, one copy of the panel. The toggle is `lg:hidden`, not shown-inert, because at `lg+` the
  panel is already on screen.
- **Close is a tint, not a slab.** `bg-emerald-600` with white text was hardcoded and never flipped;
  white on `--success-500` (#3DD68C) fails contrast in dark mode. It is now
  `border/bg-50/text-500`. Same for every remaining hardcoded amber/emerald/red in these two files —
  and note the palette has **no `-600` semantic tokens**: `--success-500`, `--warning-500`,
  `--danger-500` and their `-50` tints are what exists, so a long wait is expressed as *weight*, not
  as a hand-mixed darker amber.

**Three defects found by rendering it, none of which a code read would have caught.** `/app/care`
is auth-gated, so the surface was driven headlessly at `/demo/care` — and because the cockpit is two
clicks deep, `npm run audit:clipping <url>` only ever reaches the client list. The fix is that
**`scripts/audit-clipping.mjs` exports `AUDIT` as a library**: a throwaway script can drive the page
into each state and run the real detector over it. Do that for any surface behind an interaction.

1. At 390px the record's action group was one `shrink-0` nowrap row, so **Snooze was cut at the
   frame edge and the Details toggle — the only route to properties and notes on a phone — was off
   screen entirely.** It registered as **zero page overflow**, because a flex container clips rather
   than scrolls. Fixed by stacking below `sm` and letting the group wrap.
2. The header readout truncated to "…longest 1d · 1 urg", **clipping away the urgent count**, the
   one figure on the line that is a call to action. It wraps now; a phone spends one more line.
3. The subject column took its natural width and pushed **WAITING off the right edge at 390px** —
   reachable by scrolling the table sideways, which nobody does to find the number they came for.
   Column caps now step with the viewport, and the preview line is dropped below `sm` (106px of a
   270-character message is not a preview, and a `title` tooltip is no answer on a touch device).

Also fixed while auditing: the **On Your Desk** dock summary was a TRUNCATED finding on every `/app`
screen (266px of text in 218px, no title, no scroll) — the dock is one 48px strip and cannot grow,
so the recovery is a `title`.

**Verified:** `npm run verify` green — tsc + lint **0 errors** (31 warnings, all pre-existing),
**1612 tests**, `audit:ui` **0 findings** with its self-test passing; `npx next build` clean, 98
static pages, no database. `audit:clipping` **0 findings** on `/demo/care` and **0 across 20
state × viewport combinations** (index · record · record-details · selection · settings ×
390 · 768 · 1280×620 · 1440) via the library harness above. **Not verified against live data** —
`/app/care` is auth-gated and the demo user holds `support` but not `support.manage`, so the
checkbox column, bulk bar and settings screen were screenshotted under a *temporary* local grant
that was reverted before commit. **Post-deploy:** open Fellas, confirm the table renders 226 rows
across the awaiting tab, sort WAITING both ways, select a few rows and bulk-close, open a thread and
confirm the properties sidebar saves assignee/priority/status.

**Deferred:** the legacy `/app/support` dashboard still owns add-client, Tickets, Reports, health
scoring, AI search and workflow rules, and `client-cockpit.tsx` still imports `ConnectorsView` out
of it — so `ConnectorsView` renders its own chrome inside `01 // MODE`'s screen rather than a
numbered sibling. Extracting it is the first step of retiring the legacy file (§11).

### 42.13 The Care touchpoints outside the module

Three surfaces referred to Care and each said something different about it.

**The HQ tile had the module's own three defects, one layer out.** It reported **open tickets and
unread messages** — but tickets are dormant in the cockpit, and `unread` was climbing on our own
replies until §42.2 fixed it, so neither number was actionable and the one that is (*is a customer
waiting on us?*) was absent. It fired a `useSupportTickets` + `useSupportConversations` pair **per
row**, the conversation read pulling up to 100 full rows purely to count the unread ones — the same
N+1 Care home had, replaced by the one `useClientQueueSummaries` roll-up. And every colour was a
literal (`#0F172A`, `#94A3B8`, `#475569`, `#1D4ED8`, `rgba(0,0,0,0.08)`), so the tile was unreadable
in dark mode while every token-driven tile beside it was fine. It is now worst-client-first,
awaiting-led, and all tokens.

⚠️ **`AppOverview`'s tile container is still `bg-white` with a literal border** — so *every*
dashboard widget sits on a white card in dark mode. Out of scope here, but it is the reason a
token-correct widget can still look wrong on that screen.

**One icon for Care everywhere.** Lifebuoy in the sidebar, Heart on HQ, a chat bubble on both Portal
badges. The sidebar is canonical. The chat bubble stays where it genuinely means *a chat channel* —
Slack links, and Care's own `SourceIcon`.

**`/app/context`** called the module "Care / Support" and pointed at the legacy dashboard route.

⚠️ **Portal's two Care badges are still different by design, not by accident** — a mono `CARE` pill
on the client detail page, a quiet 3.5px icon in the client card's icon strip (beside the Drive
favicon, GitHub and the Pulse chip). Each is consistent with its own cluster; converging them means
either breaking the card's icon strip or dropping the detail page's label. The convergence worth
doing is to put the client's **awaiting count** on the Portal card, which needs a new field on the
client DTO — server work, and a separate change.

**Verification technique worth keeping: a component no demo mounts can still be seen.** `CareWidget`
is rendered only by `AppOverview`, and no `/demo/**` route mounts it (`/demo/dev` renders
`DevOverview`), so there is no reachable page at all. It was verified by `renderToStaticMarkup` with
the **query cache pre-seeded** (`qc.setQueryData(["support","queue-summaries"], …)`), wrapped in the
real compiled stylesheet from `.next/static/css`, and screenshotted in both themes. Effects do not
run, but tokens, geometry and content are the shipped ones. ⚠️ `tsx` compiles `.tsx` with the classic
JSX runtime against this repo's `"jsx": "preserve"` tsconfig and fails with *"React is not
defined"* — pass a throwaway tsconfig setting `"jsx": "react-jsx"`.

### 42.14 The bar is the rest of the platform — Deck, Starters, Docs

§42.12's restructure fixed the information architecture and Dan accepted the table, but the verdict
on the rest was that the **tab bar felt basic** and the **reply/authoring screen "looks exactly the
same, feels rubbish and outdated"** against Deck, Starters and Docs. Both were fair, and both were
the same failure: the new IA was drawn in generic web chrome rather than in Foundry's own.

- **The saved-view tabs are a segmented control**, not underlined text. Underline tabs are the web
  default and read as exactly that. DESIGN.md already names the platform's pick-one control (Deck's
  brand switch: *mono caps, 6px, brand-soft*): a hairline-bordered well on `--surface-1`, the active
  view a raised `--surface-0` chip in brand, counts as 4px badges so "Awaiting reply 226" stops
  reading as one string. The QUEUES / BROWSE split is a rule inside the well.
- **The thread is a transcript, not chat bubbles.** Left/right rounded bubbles capped at 85% width
  were wrong twice: Care holds *email* — a support reply is six paragraphs and a quoted history, so
  alternating alignment and an 85% cap make long messages harder to read — and bubbles are nobody's
  language on this platform. Now a mono meta rail (`US` / `CUSTOMER` · author · when) over full-width
  prose, with direction carried by a 2px left rule and a faint wash.
- **The composer is an instrument, not a bare form.** `01 // THREAD` and `02 // REPLY` are numbered
  panels on the canvas like every other module surface (DESIGN.md: never bare cards floating on the
  canvas), and the reply panel's header states **where the reply will actually go** —
  `VIA GMAIL · ⌘↵ TO SEND` versus `MANUAL · COPY TO SEND`. On a manual channel that is the difference
  between a sent reply and a lost draft, and the old naked textarea never said it.
- The record numbers `01`–`04` across **both columns**, left then right: the sequence is per screen,
  not per column.
- **`formatWhen`** was added beside `formatAge`, because `formatAge` returns a bare duration and the
  header appended "ago" to it — so a reply sent in the last minute read *"answered now ago"*.
- **The thread opens at the newest message**, aligned to that message's **top** rather than the
  container's bottom: scrolling to the bottom cut off the one line saying who you are reading.

**`/demo/care` was a shell, and that is why this took three passes.** The interceptor answered
`{ messages: [] }`, `{ members: [] }`, `{ connections: [] }` and `{ notes: [] }` for every request,
so the entire record side of the module — transcript, assignee options, send path, notes — could not
be rendered at all, on the only surface where an auth-gated module *can* be rendered. It now serves
real threads (inbound + our reply), three members, per-source connections and notes.

**It also ignored the query string entirely**, so all nine view tabs showed all four conversations,
the counts disagreed with the rows beneath them, and search and the channel filter did nothing.
`demo-fetch.ts` now passes `URLSearchParams` through and `filterDemoConversations` applies the same
filters `listConversations` applies in SQL. ⚠️ Match the **wire** format, not the shape of the params
object: `status` is **comma-joined** and `unassigned` is the string **`"1"`** (see
`listSupportConversations`). Reading them as repeated params and as `"true"` matched nothing, so the
awaiting tab rendered its empty state while its badge read 2 — the exact class of demo lie the
function exists to remove.

⚠️ **`npx next build` clobbers a running `npm run dev`.** The dev server keeps serving HTML that
references chunks the build deleted, so every page 404s its JS and renders unstyled — which looks
like a broken route and cost a diversion here. After any `next build`, `rm -rf .next` and restart dev
before screenshotting.

**Verified:** `npm run verify` green — 0 errors, **1612 tests**, `audit:ui` 0 findings; `npx next
build` clean. `/demo/care` rendered at 390 · 768 · 1280×620 · 1440 across index · record ·
record-details · selection · settings — **0 clipping findings across all 20 combinations**.

### 42.15 Five defects found by using it on real data

Dan reviewed #580 live on production. Two of the five were cosmetic; one was a scoping mistake; and
**two were the same class of bug this module has now produced four times — a feature with several
entry points, fixed on one of them.**

#### The one that mattered: post-sync housekeeping ran on ONE of three sync paths

`repairForwardedIdentities` and `backfillConversationActivity` were called from exactly one place,
`syncSupportClient`. The other two entry points called `syncConnection` directly and ran neither:

| Path | Ran the repair? |
|---|---|
| Client-level **Sync now** (cockpit header) | ✅ |
| Per-connection **Refresh / Re-sync history** (Channels panel) | ❌ |
| Nightly cron | ❌ |

So the two paths an operator actually reaches for to fix a broken board were the two that could not
fix it — "I re-synced history and it still looks off" was **correct**, and the nightly cron had been
silently skipping the repair every night. Meanwhile the `courseRequestOnly` branch was copy-pasted
into all three, each with a comment claiming it matched the others. That duplication is the disease;
the missing repair is the symptom.

One `runPostSyncHousekeeping({ clientId, workspace, newConversationIds })` now owns backfill →
repair → (course-request import | enrich + rules), and all three call it and nothing else. It
**returns** what it did (`relabelled` / `relabelRemaining` / `stamped`) rather than being silent —
"nothing happened" and "there was nothing to do" being indistinguishable is most of why this took
three attempts to find. ⚠️ The cron calls it **once per client**, not per connection.

#### The repair could not see the rows it exists to fix — three ways at once

Even on the one path that called it, it could not have worked:

1. It required a `GMAIL` **connection** and returned early without one. Fellas' Gmail connector was
   replaced by IMAP, so the whole Gmail history was frozen broken — the connector is gone, the
   conversations are not.
2. It only considered `source: "GMAIL"` **rows**, while the same forwarder now writes through the
   IMAP connector, so the live rows were out of scope too.
3. Its defect test compared the **whole** stored label to the client name. Gmail's adapter strips
   the address (`Fellas Loaded`); IMAP keeps it (`"Fellas Loaded" <noreply@fellasloaded.com>`), so
   the test matched the first and silently missed the second.

⚠️ **The fixtures have now been wrong in both directions.** §42.10 corrected them to Gmail's shape
and in doing so cemented the assumption that it was the only shape. `isSelfLabel` parses the label
first and both forms are asserted, along with the guard that matters more than either — a genuine
sender is never rewritten. The mailbox config is a *signal* now, not a gate: `clientName` alone
identifies a forwarder and is always available.

#### The channel filter was built from connections, not from the data

The dropdown offered Reddit / Discord / Analytics API / Email while the table plainly showed **GMAIL**
rows — visible and impossible to filter to, because the Gmail connector had been replaced.
`getConversationViewCounts` now returns `sources` from a `groupBy(['source'])` (one more groupBy on
an endpoint already doing several) and the dropdown renders the **union** of connected and
present-in-data sources. ⚠️ Not a union over the loaded rows: that is capped at the page and would
restore the "…among the rows we happened to fetch" lie removed in §42.6.

#### The course-requests mode is Wedge-only machinery that was on every client

`01 // MODE` offered "Support paused — course requests only" to every Care client. Everything behind
it is Wedge's golf-course pipeline — `wiki-course-feedback.ts` says so in its own docstring, keyed on
a `"New Feedback"` subject, with `resolveSupportClient` name-matching *Wedge ↔ "Big Wedge"*, beside
`wiki-bigwedge-import.ts` and `bigwedge-course-api.ts`. The wiki already gated it correctly, so the
list moved to **`src/lib/wiki-sections.ts`** (framework-free, so Care can import it without pulling
a component tree in) and Care reuses it. Shown when the client has the pipeline **or** the flag is
already on, so it can always be turned off.

⚠️ Gate on the **Portal** client slug, not Care's: the same client is `wedge` in Portal and
"Big Wedge Golf" in Care, so `SupportClient.slug` would never have matched. `workspaceClientSlug` was
added to the DTO for exactly this.

#### The awaiting queue opened oldest-first, burying today's mail

Sorting longest-waiting-first was the original call and it is wrong on real data: a client whose
whole backlog is two months old shows a wall of identical `2mo` rows with this morning's mail at the
bottom. Both queues now open newest-first; the WAITING header still flips it, and the header readout
still states `LONGEST 2mo`. The readout tells you the worst wait; the list shows you what is new.

#### The record's proportions on a tall window

**Not** a broken height chain — `/app/care` passes `mainClassName="flex min-h-0 flex-1
overflow-hidden p-0"` and the shell is `h-[100dvh] overflow-hidden`, so the page cannot scroll
(measured: `pageScrolls=false` at 2000×1770). The thread panel is `flex-1`, so on a 1770px window it
was ~1100px for a one-message thread with the reply pinned a thousand pixels below what you had just
read. The messages are **bottom-aligned** now (`mt-auto`), so the conversation ends 13px above the
reply at every size.

⚠️ **Four layouts were measured; three are wrong and look right in code.** `flex-initial` (hug the
content) collapses the thread to **2px** on a short window, because the reply panel beside it is
`shrink-0` and wins. `flex-1 max-h-fit` does the same — `fit-content` measures the scroller, which
is collapsible, not the messages inside it. A `min-h` floor on the thread, and letting the record
scroll as a unit, both push the **reply off the bottom of the screen**. When a short window cannot
fit both, the thread yields and the reply keeps its size: a squeezed thread scrolls, a squeezed
reply is the one thing you opened the record to do.

#### `/demo/care` now reproduces the defect it is used to verify

Northwind has **no `gmail` connection** while two of its conversations are gmail — the real Fellas
shape. Built from connections alone the dropdown loses "Gmail" while gmail rows stay in the table;
built from the union it does not. A demo that cannot express the bug cannot verify the fix.

**Verified:** `npm run verify` green — 0 errors, **1643 tests** (24 new), `audit:ui` 0 findings;
`npx next build` clean; `audit:clipping` 0 findings across 20 state × viewport combinations.
The new guards were **proved to discriminate** by breaking five things on purpose — and the first
attempt at two of them did **not** discriminate: the RFC-form fixture passed via the no-reply branch
rather than the name parsing, and a bare `toContain("runPostSyncHousekeeping")` was satisfied by the
import line while the call was renamed. Both were tightened until reverting the fix fails the test.

**Post-deploy, on real data:** press **Re-sync history** on Fellas' Email connector — the path that
previously did nothing — and confirm the customer column relabels; confirm the channel dropdown now
offers **Gmail** and that picking it returns the historical rows; confirm the Awaiting tab opens with
today's mail on top; confirm the course-requests panel is gone from Fellas and still present on
Wedge.

⚠️ **`/demo/care` under-reports available height by ~80px against the real app, so short-viewport
measurements taken there are pessimistic.** `AppShell`'s title band is `h-20` (80px) since §40.2;
`demo-shell.tsx` still carries the old 44px title on a `pb-5 pt-7` band (~130px) plus the demo
banner. §40.2 flagged that mirror as deliberately left alone — worth remembering before treating a
height measured on a demo page as the number the app will produce.

**Known limit:** on a genuinely short window (~620px and below) the title band plus the record
header leave too little for both panels, so the thread is squeezed — to a few pixels on the demo,
to ~120px in the app. The reply stays put by design. Reclaiming the title band on the record screen
is the real fix and needs `hideContentHeader` to become runtime state rather than a page prop
(`/app/docs/[id]` and the Pulse report already pass it statically).

## 43. Recent Changes (August 2026) — Launchpad (what we need FROM the client)

A new section of every client's wiki that collects everything Gitwork needs **from** a
client to start and ship, so developers stop waiting on missing accounts, assets and
legal copy. Two jobs on one page: a **tracked requirements checklist** grouped into
modules (Foundations / Website / Payments / iOS / Android / Compliance), and **fillable
boilerplate legal docs** (cookie policy, T&Cs, privacy policy) rendered
deterministically — no AI.

**It is a SIBLING of the onboarding engine, not an extension of it.** The shared pieces
are genuinely reused — `FIELD_TYPE_REGISTRY`, `validateAnswer`, `isFieldVisible`, and
`FieldRenderer` itself, which `LaunchpadFieldRenderer` delegates to for every field type
Launchpad didn't invent. What diverges is the answer model: per-item checklist status
(`LaunchpadItem`) and per-doc approval state (`LaunchpadDoc`) have no meaningful value in
onboarding's flat id→value map, so `LaunchpadFieldType = OnboardingFieldType | "link" |
"checklist_item" | "legal_doc"` extends the union rather than editing it. Putting the two
table-backed types into `OnboardingFieldType` would have given `validateAnswer` two
branches that cannot validate anything and `FieldRenderer` props it never uses.

⚠️ **The name.** "Launch Kit" was the original brief; it collides with the existing
`launch-kit` **Starter** (`starters-catalog.ts` — the code-scaffolding kit, also
referenced by name in the archetype-mapper prompt). Renamed to **Launchpad** before any
code was written; `Launchpad` is now in the §32 `{{Feat}}` registry.

- **Snapshot-on-assign**, the same rule as `ClientOnboarding.formSnapshot`: the structure
  is frozen onto `ClientLaunchpad.structureSnapshot` when a template is assigned, so
  editing the master template in Settings never disturbs a kit a client is working
  through. Re-assigning replaces the snapshot and module selection but **keeps the item
  and doc rows** — a client who has already provided their app icons shouldn't re-provide
  them because we switched templates. Rows outside the new structure stop being read
  rather than being deleted, so switching back restores them.
- **Prefill is only-if-present, and it is allow-listed.** `prefillKey` names a key in
  `PREFILL_SOURCES` (`src/lib/launchpad/prefill.ts`), **never a column**: template JSON is
  operator-editable, so a key resolving straight to a column name would make a Settings
  edit a way to read anything on the client record — encrypted bank details included — and
  surface it on a page a client user can open. The client record beats an onboarding row
  (it's the live one); a client who never went through onboarding just gets fewer
  prefilled fields, never an error.
- **Legal docs are Launchpad artifacts, NOT `Document` records** — the `DocumentType` enum
  and its exhaustive maps are untouched. Three separate markdown templates rather than one
  parameterised source (they diverge too much), UK-oriented: the privacy policy is
  structured to the UK GDPR Art. 13/14 transparency list, the cookie policy leads on
  **PECR** (consent *before* a non-essential cookie is set — the point most templates
  miss), and the T&Cs state the Consumer Contracts Regs 14-day right and cap only what
  UCTA/CRA 2015 actually let you cap.
- ⚠️ **The red TEMPLATE banner is returned as its own field, never spliced into `body`.**
  The client can edit the body — that's the point, they hand a filled draft to their
  lawyer — so a banner living inside the markdown would be one backspace away from a
  document reading as finished legal advice. `renderLegalDoc` returns
  `{ title, banner, body, missing }` and a test asserts the banner text appears in **no**
  doc body, in any answer state.
- **Approval is a lightweight status, not e-sign.** Approving snapshots the rendered body
  into `bodyOverride` so "approved" refers to a fixed text; editing an APPROVED doc drops
  it back to EDITED, because keeping the badge over changed wording is the one genuinely
  misleading thing this feature could do. The UI says "not an e-signature" in the byline.
- **Assets are LINKS ONLY.** A pasted URL is stored and rendered as an anchor, never
  fetched server-side (SSRF) — the same posture as `ClientWikiIntakeItem.attachmentUrls`.
- **Auth mirrors the wiki's two paths.** Internal by client slug, `assertCan(…,
  canManageClients)`. Client-facing by share token using the **hardened** posture
  (`resolvePublicWiki` → `verifyWikiAccessCookie` → belongs check → per-IP rate limit),
  because a Launchpad write records a commercial fact a developer will act on. Reads are
  token-only, so a link recipient can see what is being asked of them but cannot answer
  it. `/api/wiki` was already in `PUBLIC_API_PATHS` — no middleware change.

### 43.1 The wiki section wiring is TWELVE lists, not eight

The section allow-lists are the standing trap here, and the count in the original plan
was wrong twice over. **Four are exhaustive `Record<WikiSection, …>` maps, so `tsc` finds
them for you** — and it did, naming two nobody had listed: `SECTION_META` in
`wiki-dashboard.tsx` and `SECTION_ICON` in `wiki-mobile-nav.tsx` (plus the demo
`WikiDTO`, which is a third self-enforcing one).

The other eight are plain string arrays and object literals with **no exhaustiveness
checking at all**, which is what
`components/clients/wiki/__tests__/launchpad-section-wiring.test.ts` now covers: the
`WikiSection` union, the nav row, `SHAREABLE_SECTIONS`, `SHARE_SECTION_LABELS`, the
public page's `SECTION_LABELS`, `ALL_WIKI_SECTIONS` (miss it and a refresh on
`#launchpad` silently bounces to the dashboard), `SECTION_WIDGET_LABELS`, and the public
view's `availableSections` + render dispatch. **Adding a section? Add it to that test's
list too** — it is source-text assertions on purpose, because most of these live in
`"use client"` components whose imports drag a React tree into a node test for no benefit.

Two behavioural rules the test also pins: the operator must be able to reach the section
from **+ ADD NEW** and get past the `confirmDeletePage` guard (which early-returns for any
section it doesn't name, so a missing entry makes the delete button silently do nothing —
the §40.1 unreachable-state defect), and the public view requires **enabled AND
assigned** before listing the section, so an enabled-but-unassigned kit never lands a
client on a blank page that reads as a broken link.

### 43.2 Internal signal — and why it caps at amber

`deriveClientHealth` takes a `launchpadOutstanding` input, wired at both call sites
(`clients.ts`, `analytics/portal-analytics.ts`).

⚠️ **It can never go red, however many items are outstanding, and that is deliberate.**
Everything else in that function is a fault on *our* side (work late, code failing
checks); this is work we are waiting on the **client** for. Letting it go red would put a
client who simply hasn't sent their app icons in the same bucket as one whose delivery is
genuinely failing, and the board would stop meaning anything. A test asserts amber at 1,
5, 20 and 500 outstanding.

⚠️ **`null` and `0` are different facts.** No Launchpad means we never asked; 0
outstanding means they've given us everything. Reporting the first as the second is §35's
mistake — "we could not look" becoming "it isn't there" — so the input is nullable and the
absent case contributes no signal.

**The HQ widget renders only when a client actually has a Launchpad**, and the decision
lives in `app-overview.tsx`'s `GRID` (`requires: "launchpad"`), **not** in the widget.
`BentoBand` wraps every grid entry in an unconditional bordered `<div>`, so a widget
returning `null` would leave a 220px empty white card on the dashboard. The filter reads
`useClientList()`, the same query key `ClientsWidget` already uses, so it is a cache hit
rather than a second request.

### 43.3 Three defects found by looking, not by testing

All three passed `tsc`, `lint`, `audit:ui` and the unit suite.

1. **`****` on an unanswered cookie policy.** `**{{trading_name}}**` with no answers
   rendered a literal `****`: the token is optional, its `fallbackId` (`company_name`) was
   also blank, so it resolved to `""` and orphaned its own emphasis markers — and the
   empty-line rule couldn't save the line because it *also* carries a required token that
   is correctly left visible. Fixed by having a fallback chain that terminates in a
   required-and-blank field **inherit that treatment** (token stays visible). The guard is
   now a test over every doc × three answer states (empty / partial / full) asserting
   balanced `**` per line — and it had to be three states, because the bug appears in only
   one of them. A fixture testing just the fully-answered case cannot tell the bug from the
   fix (§42.10).
2. **"YOUR ACCOUNT — IN YOUR NAME" rendered to Gitwork staff.** The section is one
   component for both audiences on purpose (so they can never disagree about what is
   outstanding, the defect §42.4 had to fix in Care) — but the *copy* still has to know
   who is reading. `audience: "client" | "team"` switches the ownership line to
   "Client-owned" / "Gitwork-owned" internally. Facts and controls are identical; only
   wording moves.
3. **The demo served an empty shell**, which is what caught #1. `/demo/wiki` writes now
   run through the **real** `applyItemPatch` / `computeCompleteness` / `renderLegalDoc`
   (`resolveDemoLaunchpad` in `dev-demo-data.ts`, with `init` threaded through
   `demo-fetch.ts`), and the fixture is built from `getDefaultLaunchpadStructure()` rather
   than invented rows. A demo where every write succeeds and changes nothing verifies the
   CSS and nothing else — §42.8's lesson, applied before shipping rather than after.

**Verification technique worth keeping.** `/app` is auth-gated with no staging, so the
section was driven headlessly at **`/demo/wiki`**, clicking into the Launchpad and running
`AUDIT` (exported from `scripts/audit-clipping.mjs`) per state — `npm run audit:clipping
<url>` only ever sees a page as it first loads, and this section is two clicks deep. Clean
at **390 · 768 · 1280×620 · 1440** across checklist and legal-doc states: 0 findings, 0
console errors, 0 horizontal overflow. The status machine was driven end-to-end and the
header moved **7/14 → 8/14**, which exercises the route, the transition rules and the
completeness recompute rather than just the layout.

**Verified:** `npm run verify` green — tsc + lint **0 errors** (31 warnings, all
pre-existing), **1776 tests** across 133 files, `audit:dependencies` clean, `audit:ui`
**0 findings** with its self-test passing; `npx next build` clean, 98 static pages, all 11
Launchpad routes registered. The new tests were **proved to discriminate** by breaking ten
things on purpose (the auto-advance rule, explicit-status precedence, the banner's
separation from the body, section gates, the amber cap, a dropped allow-list entry, a
missing helper, required-blank substitution, account ownership, and the fallback fix) —
each failing only the tests named for it.

**Not verified:** nothing ran against a real database. **Post-deploy checklist is in the
PR body** — the short version is that a client's kit is created by switching the section
on, so the first thing to confirm is that Add New → Launchpad lands on a populated page
rather than an empty one.

### 43.4 Review round — a link-validation hole, and the two-column pass

**⚠️ The item link had no URL validation at all, and it renders as an `<a href>`.**
`launchpadItemPatchSchema.link` was a bare `z.string().trim().max(2048)`, so
`javascript:alert(1)` was reachable from a paste — while `validateLaunchpadAnswer`
DID check http(s) for the `link` *field* type. Two copies of one rule with one of them
wrong: the same class of drift as the duplicated model literals in §31.
`rel="noreferrer noopener"` does nothing about a `javascript:` href.

Fixed with **one** rule, `safeLaunchpadLink()` in `field-types.ts`, used by the field
validator, the Zod item schema, and defensively at render on both anchors (so a legacy
row can't paint a bad href either). It is a **protocol allow-list, not a blocklist** —
`javascript:`, `data:`, `vbscript:` and `file:` are all reachable and enumerating them is
how one gets missed. A test asserts all four are rejected, and breaking the allow-list
back into a `javascript:`-only check fails it.

**The client is now TOLD why**, inline. `saveLaunchpadAnswers` skips an invalid answer
(`if (!ok) continue`), which from the client's side looks like their value silently
reverting — so both link inputs validate on blur and render the message rather than
firing a write that will be dropped.

**Layout: two columns where the content earns it.** The first cut stacked everything
full-width, which at 1440px put a three-way status picker ~900px from the label it
belonged to. Now: the progress readout and the module toggles sit side by side from `xl`,
and requirement cards are **two-up from `xl`** with `items-start` so a long helper doesn't
stretch its neighbour. **`xl`, not `lg`** — a requirement card carries a label, a helper,
the status picker and a link field on one row, and below ~1280 the picker wraps under the
label, which reads worse than a single column. Roughly halves the page.

**Pagination was considered and deliberately NOT added.** A Launchpad is a *form*, not a
queue: paginating it would lose the client's place and break the one read the page exists
for — what is still outstanding *in total*. The length problem is a density problem, which
is what the two-column pass addresses (~45 requirements with every module on becomes ~23
rows). The one genuinely unbounded surface, a legal doc's body, is already capped at
`max-h-[420px]` with its own scroller.

**Deferred (fast-follows, not oversights):** real file uploads (links only in v1, gated on
the parked blob-storage migration); Foreman/Dispatch wiring of the completeness signal;
"promote a legal doc into a real Docs `Document`"; any AI drafting of the legal text; and
a full-kit PDF export mirroring `onboarding-pdf.ts`; and **custom per-client documents**
— today a `legal_doc` can only point at one of the three in-code generators, so a
client-specific document (liability insurance, a bespoke data-retention policy) has no
home. The obvious shape is a `custom_doc` type carrying its own markdown body + question
list in the template JSON, authored in Settings → Launchpad with no code change. Note that
half of that ask is already possible: a document the client *provides* (an insurance
certificate) is a `checklist_item` with a link, not a generated doc.
