# Foundry by Gitwork — Master Build Prompt

> **What this is.** A single, self-contained prompt for rebuilding **Foundry by Gitwork** from an
> empty repository. Paste everything below the line into a capable coding agent (Claude Code or
> equivalent) pointed at a fresh repo. It is distilled from the production system, so treat its
> specifics — tokens, class names, security invariants, module map — as authoritative, at the same
> level of authority as `DESIGN.md`. It is deliberately prescriptive: where it names a value, use
> that value. Where it says "never", it means never, and states why.
>
> **How to use.** Feed it whole, then let the agent work through `<build_order>` one vertical slice
> at a time, keeping the build green between slices per `<definition_of_done>`. It is long by
> design — completeness beats brevity for a rebuild spec.

---

<role>
You are a senior full-stack product engineer and product designer. Your job is to build
**Foundry by Gitwork**, a production-grade agency-operations SaaS, end to end: data model,
backend, frontend, information architecture, design system, security, deployment.

Operate like a staff engineer who owns the whole surface:
- **Ship vertical slices.** A feature is done when its schema, server module, gated API routes,
  React Query hooks, and design-system-faithful UI all exist and the build is green — not when one
  layer compiles.
- **Match conventions over inventing.** Reuse the named tokens, CSS classes, and primitives in this
  document. New patterns are a last resort and must be justified.
- **Verify before claiming done.** Run the checks in `<definition_of_done>`. Never report a slice
  complete on the strength of "it should work".
- **Be honest about state.** If something is stubbed, skipped, or unverified, say so plainly.
</role>

<product_context>
**Foundry by Gitwork** is a design-and-build agency platform. One deployment serves **two audiences
at once**:

1. **Public** — a marketing homepage plus a family of **tokenized share pages** where the URL token
   is the only credential: clients open proposals, sign documents, complete onboarding, view project
   timelines and wikis; candidates complete vetting assessments. No login for these.
2. **Internal** — a full platform at `/app` for the Gitwork team to run the agency: write and track
   proposals/contracts, manage clients, hire and assess developers, validate the production-readiness
   of client projects with AI, run user research, handle client support, and manage internal ops
   (leave, expenses, availability).

**It is multi-tenant.** Almost every model scopes to a `workspaceId`. The owner persona is an agency
founder; the daily users are admins, staff, and developers with sharply different views of the same
data.

**Its soul is "a precision operating system."** The interface should read as instrument-grade,
editorial, and calm: numbered widget panels in a bento grid, editorial serif figures over
monospace data labels, hairline borders, a single confident blue. Not another rounded, shadowed,
purple-gradient SaaS. Every design decision below serves that identity.
</product_context>

<tech_stack>
Pin these. Do not substitute without a stated reason.

| Layer | Choice |
|---|---|
| Framework | **Next.js 15** (App Router), **React 19**, **TypeScript** (strict) |
| Styling | **Tailwind CSS v4**, CSS-first — **no `tailwind.config.js`**; all config + component classes live in `src/app/globals.css` |
| Database | Self-hosted **PostgreSQL** (with the **pgvector** extension) |
| ORM | **Prisma 6** — schema-push discipline (`prisma db push`), **no `prisma/migrations/` directory** |
| Data fetching | **TanStack React Query v5** (hooks in `src/hooks/use-*.ts`) |
| Validation | **Zod** — every request body; all schemas in `src/server/validators.ts` |
| Auth | **NextAuth** (Google OAuth) for web + a **per-user mobile JWT** path for a companion app |
| AI | **Anthropic SDK** default; **OpenAI-compatible** SDK for OpenAI / Gemini / local — provider chosen per workspace |
| Drag & drop | **@dnd-kit** (core + sortable) |
| PDF | server-side Chromium (`puppeteer-core` + `@sparticuz/chromium`) rendering a print route; `pdf-lib` for assembly |
| Deploy | **Docker Compose** (app container + Postgres/pgvector container) on a VPS; **GitHub Actions** builds an image to a registry and deploys on push to `main` |

Path alias: `@/*` → `src/*`.
</tech_stack>

<information_architecture>
### Public routes (no auth)
- `/` — marketing homepage (Gitwork branding, warm cream design)
- `/pulse-overview` — standalone public product page for Pulse (shareable, not in nav)
- `/api-docs` — REST API reference
- `/context` — structured project context for AI assistants (noindex)
- `/embed/pulse` — embeddable public Pulse "lite" scanner widget (iframe-able; SSRF-guarded + rate-limited; CORS `*`)

### Tokenized share family (the token in the URL IS the credential)
Each self-authenticates; none require a session. Middleware lets any first path segment of 16+
URL-safe chars through as a candidate share token.
- `/report/[token]` — public Pulse scan report
- `/onboarding/[token]` — public client onboarding flow (autosaves per step)
- `/docs/[token]` — public document (proposal / SLA / SOW …) view + a view-tracking beacon
- `/timeline/[token]` — public project timeline
- `/sign/[token]` — e-signature signer page
- `/vet/[token]` — DevSignal candidate assessment
- `/wiki/[slug]` and `/wiki/[slug]/[token]` — public client wiki
- `/brand/[token]` — brand-asset share
- `/invite/[token]` — team/user invite acceptance

### The internal app (`/app`) — exactly 8 top-level sidebar items, fixed order + module gate
| # | Label | Route | Module gate |
|---|---|---|---|
| 1 | **Foundry HQ** | `/app` | *(none — always visible)* |
| 2 | **Pulse** | `/app/pulse` | `pulse` |
| 3 | **Code** | `/app/code` | `codeclear` |
| 4 | **Docs** | `/app/docs` | `proposals` |
| 5 | **Portal** | `/app/portal` | `clients` |
| 6 | **Care** | `/app/care` | `support` |
| 7 | **Backstage** | `/app/backstage` | `backstage` |
| 8 | **Studio** | `/app/studio` | `studio` |

**Bottom rail (always rendered, outside the primary nav):** Handbook (`/app/handbook`), Settings
(`/app/settings/account`), a profile menu with the admin "View as" switcher, and an AI-spend readout.

**Label ≠ route aliases** (both resolve; middleware maps both prefixes to the same module):
`/app/code` ↔ `/app/codeclear`, `/app/portal` ↔ `/app/clients`, `/app/docs` ↔ `/app/proposals`,
`/app/care` ↔ `/app/support`.

### Module purposes (one line each)
- **Foundry HQ** `/app` — dashboard overview; role-aware (see below). Hosts the "On Your Desk"
  drawer and "The Monday Brief".
- **Pulse** `/app/pulse` — AI project-validation: 150+ deterministic production-readiness checks,
  gap analysis, GitHub fix-agent, continuous monitors, public lite-scan + lead funnel. Also **hosts
  Study** as an admin-only tool.
- **Code** `/app/code` — developer hiring pipeline: GitHub analysis, scoring, candidate management.
  Contains **DevSignal** (candidate assessments; separately gated by a `devsignal` feature perm).
- **Docs** `/app/docs` — document builder for PROPOSAL / SLA / SOW / MSA / NDA / CO / DSA /
  HANDOVER / REPORT / BRIEF: registry-driven sections, costing, timeline, markdown rich text,
  split-screen live preview, e-sign, comments, versions, AI authoring, link tracking + analytics
  (`/app/docs/analytics`).
- **Portal** `/app/portal` — client management + per-client detail pages. Hosts, inside each client:
  **Scribe** (AI meeting notes read from Google Meet "Notes by Gemini" Drive docs), **Tasks**
  (Kanban + list + Gantt, feature blocks, milestones, standups), and a client **Wiki**.
- **Care** `/app/care` — client support ops: conversations (the unit of triage), tickets, workflow
  rules, audit log, per-client analytics connectors, pgvector semantic search.
- **Backstage** `/app/backstage` — internal-ops **umbrella**: v1 is staff leave booking + expenses +
  HQ staffing alerts. Future internal tools slot under `/app/backstage/<slug>`.
- **Studio** `/app/studio` — brand social-asset creator (carousels, banners, posts); admin-only.
- **Study** `/app/study` — AI user research (multi-agent persona interviews, synthesis). **Not a
  sidebar item** — demoted into Pulse as an admin-only tool; the wizard reads `?scanId=`/`?clientId=`.
- **Settings** `/app/settings` — AI provider config, **Rate Card** tab (people rates feeding proposal
  costing), workspace branding, **Team** tab (permission matrix + `ClientAssignment` picker).
- **Handbook** `/app/handbook` — developer knowledgebase; write access enforced server-side.
- **Proof** `/app/proof` — document sign-off workflow; built but **hidden from nav**.

### The umbrella rule (load-bearing — do not violate)
There are only ever **8 top-level sidebar items**. Any new internal tool nests under Backstage or an
existing module as a tab / sub-route. **Never add a 9th.** Scribe (placed inside Portal) and Study
(demoted into Pulse) are the canonical precedents of features denied a top-level slot.

### Role-based dashboards & scoping
- **Foundry HQ is role-aware.** Developers see a task-focused `DevOverview` (their standup + their
  clients + their tasks). Admins/staff see a permission-filtered bento grid; Super-Admin sees all.
  Some controls are deliberately withheld from admins (e.g. the task roll-up publish belongs to the
  DevOps lead via a `tasks.publish` perm, not to admins).
- **View-as** (admins only): preview the platform as a Developer/Staff role or a specific user; an
  amber "Previewing as…" banner shows; nav and dashboards recompute against the previewed
  permissions. Preview permissions must never poison the persisted nav cache.
- **Client-scoping** via `ClientAssignment` (user↔client) and the `seeAllClients` flag; Care uses
  `SupportClientMembership`. Holders of `seeAllClients` see every client; everyone else is scoped to
  their assignments, both in what they see AND in mutation gates (defence in depth).

### Cross-app surfaces
- **"On Your Desk"** — a persistent pull-up drawer docked at the bottom of the whole `/app` shell,
  internal users only, a pure aggregator (no live AI): tabs for TODAY / TASKS / MEETINGS / INBOX
  (Gmail + Slack). Collapsed dock shows a mono summary (`N OVERDUE · N DOING · …`).
- **"The Monday Brief"** — a daily editorial digest that peeks at the top of the Desk's TODAY tab and
  opens a full-page overlay: painting hero, "push your work forward" CTA, top to-dos, updates, and a
  schedule. Also a pure aggregator; state persisted in `localStorage`.
</information_architecture>

<design_system>
This is the identity. Reproduce it faithfully. When this section and general taste conflict, this
section wins.

### THE signature — every card opens with a numbered mono header
Every card, panel, widget, and data surface opens with a numbered monospace header, no exceptions:

```
01 // WIDGET NAME
```

Rendered in **JetBrains Mono, 10px, weight 500, letter-spacing 1.2px, uppercase**, color `--text-3`,
in a 36px-tall header strip on the warm canvas with a hairline bottom border. An optional right slot
carries a status (`LIVE`/`ONLINE` → success green; counts → brand blue; dates → muted). This numbered
header is the single most recognizable Foundry element.

### Fonts — three families, three lanes, never mixed
- **Inter** (`--font-sans`) — ALL UI: body, labels, nav, buttons, captions.
- **DM Serif Display** (`--font-display`, weight 400 only) — large stat figures and hero headlines
  ONLY. This is the one place the platform reads as warm rather than clinical.
- **JetBrains Mono** (`--font-mono`) — widget headers, timestamps, data-unit labels, code.

(Load via `next/font/google` in `layout.tsx`, bound to those three CSS variables. Route-specific
extras are loaded `preload:false`: signature-script fonts for `/sign/[token]`; **Fraunces**
`--font-fraunces` for the Gitwork document theme; display fonts for Studio.)

### Color — real hex values
**Brand (the only interactive color is Gitwork Blue):** primary `#1D4ED8`, deep/pressed `#1E3A8A`,
bright (sparklines/data series/progress) `#3B82F6`, tint `#EFF6FF`, soft (badge bg) `#DBEAFE`.

**Light surfaces:** canvas `#FAFAF9` (**warm off-white — never pure white as a page background**),
surface `#F5F5F4`, raised card face `#FFFFFF`, brand-tinted panel `#EFF6FF`. Hairlines
`rgba(0,0,0,0.08)` (cards), `rgba(0,0,0,0.05)` (soft dividers), `rgba(0,0,0,0.14)` (inputs).

**Text:** ink `#0F172A`, charcoal `#1E293B`, slate `#475569`, steel `#64748B`, stone `#94A3B8`,
muted `#CBD5E1`.

**Semantic:** success `#16A34A` / soft `#DCFCE7`; warning `#D97706` / soft `#FEF3C7`; danger
`#DC2626` / soft `#FEE2E2`.

### Geometry & elevation
- Radius: **6px** for all controls (buttons, inputs, selects), **10px** for all cards / modals /
  panels. `9999px` (full round) is used for **status dots only** — nothing is pill-shaped.
- Flat widget cards carry a **1px hairline border and no shadow**. Shadows appear only on dropdowns
  (`0 4px 12px rgba(0,0,0,0.06)`) and modals/overlays (`0 12px 32px -4px rgba(0,0,0,0.10)`).
- Spacing on a 4px/8px base; bento grid gap 12px.

### CSS-first token system (in `globals.css`)
`@import "tailwindcss";` — no config file. Declare tokens on `:root` (and mirror the light set on
`[data-theme="light"]` so a subtree — guest deliverables, print/PDF — can force light):
- Surfaces: `--surface-canvas`, `--surface-0`, `--surface-1`, `--surface-2`, `--surface-brand`
  (+ `-soft` / `-strong`).
- Text: `--text-1` … `--text-4`. Borders: `--border-1` … `--border-3`.
- Brand ramp: `--brand-50` … `--brand-900`, plus `--brand-focus-ring rgba(29,78,216,0.16)`,
  `--brand-gradient`, `--signal-stripe`.
- Semantic `--success/-warning/-info/-danger` in `-500`/`-50` pairs; `--shadow-xs/-sm/-lg`.

**Dark mode** is driven by `data-theme="dark"` on `<html>` (set by an anti-flash inline script + a
theme provider), via a Tailwind v4 custom variant:
`@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`.

### The dark-mode gotcha — read this before writing any dark styles
- The dark shell is **true neutral black/grey** (`--surface-canvas #0B0B0C`, `--surface-0 #161617`,
  `--surface-1 #1E1E20`…), **NOT navy.** (Older docs describe a navy shell; the implementation is
  neutral. Follow the implementation.)
- The brand ramp **inverts** in dark: `--brand-500/600` become a *lighter* blue (~`#6BA0FF`) so accent
  *text* stays legible — which means the primary button *fill* becomes light and must pair with **dark
  text**. Handle that in an explicit dark override.
- Because **Tailwind v4 cascade-layer order beats specificity**, three unlayered dark-remap systems
  are required so third-party-shaped or hardcoded utilities don't produce invisible text:
  1. hardcoded `bg-white` and `border-[rgba(0,0,0,…)]` → remapped to tokens;
  2. hardcoded Tailwind status colors (`bg-red-50`, `text-emerald-700`, `border-blue-200`, …) →
     translucent tints / lighter text / translucent borders;
  3. neutral-scale text (`text-slate-600`, `text-[#0F172A]`, …) → remapped to `--text-*`.
  New UI should just use the tokens and avoid needing the remap.

### `@layer base` — the anchor reset must stay layered
```css
@layer base { a { color: inherit; text-decoration: none; } }
```
Keep it inside `@layer base`. An **unlayered** `a { color: … }` beats `text-{color}` utilities in
Tailwind v4's cascade and silently breaks colored links — this was a real production bug.

### `.app-select` — one specific footgun
Form controls (`.app-input`, `.app-input-compact`, `.app-select`, `.app-select-compact`,
`.app-textarea`) share a base: full width, `--border-1`, 6px radius, min-height 36px, focus ring
`0 0 0 4px var(--brand-focus-ring)`. Selects use `appearance:none` + an inline SVG chevron as a
`background-image`. **Set the field background with `background-color:` — never the `background`
shorthand** — or you wipe the chevron's `background-image`/`no-repeat` and it tiles across the field.
In dark mode, lift fields to `--surface-1` (so they don't dissolve into the `--surface-0` dialog
panel) and swap the chevron SVG to a lighter stroke.

### Class vocabulary to reuse verbatim
`widget-card` / `widget-card-dark`, `widget-header` / `widget-header-label` / `widget-header-right`,
`widget-stat` / `widget-stat-sm`, `widget-data-label` / `widget-data-label-bright`,
`widget-timestamp`, `widget-progress` (+ `__fill`), `signal-dot-live`, `signal-stripe`, `bento-grid`,
`app-card` / `app-surface` / `app-muted-card` / `app-subtle-panel` / `app-eyebrow` / `app-chip`,
`app-table` (+ `app-table-shell`), `app-dialog-panel` / `app-dialog-backdrop`,
`app-button-{primary|secondary|tertiary|link|hyperlink|danger|utility|dark}` +
`app-button-{xs|sm|md|lg|icon-sm|icon-md}`, `app-input` / `app-input-compact`, `app-select` /
`app-select-compact` / `app-select-chevron`, `app-textarea`, `app-checkbox`, `app-field-label`,
`app-field-hint`. Scoped themes: `proposal-document` (the editorial "financial-statement" doc look,
which remaps app tokens to a paper palette; `data-doc-theme="gitwork"` swaps in Fraunces + a purple
accent), `handbook-reader`, and an A4 paged-render system for print/PDF.

### Shared primitives — reuse, do not rebuild
- **`<Modal>`** — `open`, `onClose`, optional `title` (renders a `widget-header` strip + close X),
  `panelClassName`. Full a11y: `role="dialog"` + `aria-modal`, Escape-to-close, focus trap, focus
  restore on close, body scroll-lock, backdrop-click dismiss. Every dialog uses this.
- **`Button`** — a thin `forwardRef` wrapper mapping `variant`/`size`/`loading`/`leadingIcon`/
  `trailingIcon` to the `app-button-*` classes.
- **`useToast()`** — dependency-free provider mounted once; `{ toast, success, error, info }`;
  `aria-live="polite"` viewport, token-themed so it follows light/dark. Never add a toast library.
- **`Tooltip`**, and **`cn()`** (`@/lib/format`) — a trivial truthy-join (`.filter(Boolean).join(" ")`),
  NOT clsx/tailwind-merge.

### Responsive (see it as mandatory, not optional)
- Desktop↔mobile split is at **`lg` (1024px)**, not `md`. The sidebar is `hidden lg:flex`; mobile
  gets a top bar; content becomes `lg:grid lg:grid-cols-[280px_minmax(0,1fr)]` at `lg`. "Mobile" =
  anything `<1024px`, so **test the 640–1023 tablet band** too.
- `bento-grid` is 12 columns → 6 at `≤1023` → 1 at `≤639` (where `widget-stat` drops to 40px).
- Tables live inside `overflow-x-auto` and scroll; they never reflow.

### Signature widget card — exemplar
```tsx
<div className="widget-card">
  <div className="widget-header">
    <span className="widget-header-label">01 // PROJECT HEALTH</span>
    <span className="widget-header-right" style={{ color: "var(--success-500)" }}>LIVE</span>
  </div>
  <div className="p-4">
    <div className="widget-stat">98</div>
    <div className="widget-data-label">READINESS SCORE</div>
  </div>
</div>
```
</design_system>

<data_model>
Prisma 6 + self-hosted PostgreSQL. Two connection URLs: `DATABASE_URL` (app) and `DIRECT_URL`
(schema push). The production system is ~128 models / ~76 enums; build them per module, not up front.

**Datasource / generator:**
```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

**Domains (build in the `<build_order>` sequence):**
- **Platform** — `User`, `Workspace`, `WorkspaceMember`, `WorkspaceClient`. The workspace carries AI
  config, branding, the role→permissions matrix, and feature flags.
- **Docs** — `Document` (+ `DocumentSection`, `DocumentTemplate`, `DocumentVersion`,
  `SignatureRequest`/`Signer`/`Event`, `DocumentComment`, view-tracking `DocumentView` /
  `DocumentViewEvent`, `CostLineItem`, `TimelinePhase`, `Asset`, `CTA`, `Link`). Enums `DocumentType`
  (PROPOSAL/SLA/SOW/MSA/NDA/CO/DSA/HANDOVER/REPORT/BRIEF/OTHER) and `DocumentStatus`
  (DRAFT…ACCEPTED/DECLINED/ARCHIVED).
- **Pulse** — `PulseScan`, `PulseScanCheck`, `PulseMonitor`, isolated `PulseLiteScan` (public,
  TTL'd), `PulseLead`, `PulseCheckStat`.
- **Code** — `Candidate`, `Placement`, `Note`, `GitHubAnalysisRun`, scoring + DevSignal assessment
  models.
- **Portal** — `WorkspaceClient`, `Task` (+ `TaskComment`, `ClientAssignment`, `FeatureBlock`,
  `Milestone`), `Meeting` (+ `MeetingActionItem`) for Scribe, client wiki models.
- **Care** — `SupportClient`, `SupportConversation` (with a `vector(1536)` embedding column +
  HNSW index), `SupportMessage`, `SupportTicket`, `SupportWorkflowRule`, `SupportAuditLog`,
  `AccountConnection`.
- **Backstage** — `LeaveRequest`, `Expense`.
- **Study** — `Study`, `StudyResearchPlan`, `StudySession`, `StudyReport`.
- **Rate Card** — `RateCardPerson`. **Infra** — background `Job` queue, curator, retention models.

**Additive-only discipline (this is a hard constraint):** there is **no migrations directory**. The
build runs `prisma db push` **without `--accept-data-loss`**, so any destructive or non-additive diff
(dropped column/table/enum value, rename) causes the push to fail rather than lose data. Therefore:
new columns are **nullable or defaulted**, legacy columns are **kept**, and cross-module links are
loose nullable ids (no hard FK) matching the existing convention. Enable pgvector on boot
(`CREATE EXTENSION IF NOT EXISTS vector`).
</data_model>

<backend>
### API route shape (every route)
```ts
// src/app/api/<domain>/[id]/route.ts
import { apiOk } from "@/lib/api-response";
import { fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { thingUpdateSchema } from "@/server/validators";
import { updateThing } from "@/server/things";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;                        // Next 15: params is a Promise — await it
    const body = thingUpdateSchema.parse(await req.json()); // Zod validates every body
    return apiOk(await updateThing(user, id, body));
  } catch (e) {
    return fromError(e);                                 // universal catch
  }
}
```

### Response helpers (`src/lib/api-response.ts`)
- `apiOk<T>(data, init?)` → `NextResponse.json(data, { status: init?.status ?? 200 })`. POSTs that
  create return `apiOk(x, { status: 201 })`.
- `apiError(message, status = 500, details?)` → `{ error, details }` body.
- `fromError(error)` — maps `ZodError` → `apiError("Validation failed", 400, issues)`; if the error
  carries a numeric `.status` (our `UnauthorizedError`/`ForbiddenError`), uses it; else 500.

### Validators (`src/server/validators.ts`)
All Zod schemas, named `<domain><Action>Schema` (e.g. `clientCreateSchema`, `milestoneUpdateSchema`).
Update schemas `.refine(v => Object.keys(v).length > 0, …)` to require at least one field.

### Server modules
- `src/server/{domain}.ts` — one file per domain; imports the Prisma singleton
  `import { prisma } from "@/lib/prisma"`; takes an `EffectiveUser` as the first argument for any
  permission-scoped operation; uses `unstable_cache` / `revalidateTag` from `next/cache`; encrypts
  secrets at rest (AES-256-GCM helper in `src/lib/encryption.ts`).
- `src/server/{domain}-agents/{agent}.ts` — AI agents live here, never at the domain root (e.g.
  `pulse-agents/`, `care-agents/`, `study-agents/`).
- `src/lib/prisma.ts` — a hot-reload-safe global singleton.

### Client data layer
- `src/hooks/use-{domain}.ts` — React Query. A query-key factory object with tuple keys;
  `useMutation` with optimistic update (`getQueriesData`/`setQueriesData` + snapshot) and `onError`
  rollback; `invalidateQueries({ queryKey: ["<domain>"] })` in `onSettled`.
- `src/lib/api.ts` — thin typed fetchers over one wrapper:
```ts
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { ...viewAsHeaders(), ...(options?.headers as Record<string, string>) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed: ${res.status}`);
  return data as T;
}
```
`viewAsHeaders()` injects the `x-view-as-user` header from `localStorage` (only when an admin is
previewing a specific user).
</backend>

<security_model>
This is the section to get right. Enforce every gate on the server; the UI only mirrors it.

### Roles (`src/types/auth.ts`)
`SUPER_ADMIN` (rank 100, implicit-all, never stored as an explicit permission set) > `ADMIN` (80) >
`STAFF` (40) > `DEVELOPER` (20). Helpers: `roleRank`, `isAtLeast(role, min)`, `isSuperAdmin`,
`canManageRole(actor, target)` — **you can never act on a role ≥ your own.**

### Permission catalog
`PERMISSION_CATALOG` is the single source of truth, grouped by product. Each `PermissionDef` has
`id`, `label`, `description`, `category`, optional `highRisk`. Categories:
- **`module`** — gates a `/app/*` sidebar route (`pulse`, `codeclear`, `proposals`, `clients`,
  `support`, `backstage`, `studio`).
- **`field`** — gates buried sensitive data (`code.viewRates`, `docs.viewCosts`, `rateCard.view`,
  `clients.viewFinancials`). Enforced by **blanking values server-side**.
- **`action`** — gates write surface (`pulse.manage`, `docs.manage`, `clients.manage`); high-risk
  ones (`pulse.fixAgent`, `docs.share`, `clients.shareTimeline`) default Admin-only.
- **`feature`** — cross-cutting flags (`devsignal`, `study`, `studio`, `seeAllClients`,
  `ai.generate`, `mcp.connect`, `backstage.approve`, `tasks.publish`).
- **`settings`** — settings-surface gates.

`defaultOn` is opt-in: only `seeAllClients` and `docs.viewAdminTypes` default on; everything else is
off until granted.

### Live resolution (never trust a cached permission column)
`resolveEffectivePermissions(role, matrix, overrides)` = for SUPER_ADMIN, all ids; else
`(matrix[role] ∪ overrides.grant) \ overrides.revoke`, expanding legacy aliases, filtered to catalog
order. The workspace holds the role→ids matrix; each member holds `{grant, revoke}` overrides.
`requireAuthedUser` recomputes this **per request**, so a matrix edit takes effect with no re-login.

### Layered enforcement (defence in depth)
1. **Middleware** (`src/middleware.ts`):
   - `/app/*` gated by `MODULE_PATHS` (an ordered prefix→module list including the legacy aliases);
     unlisted paths (`/app`, `/app/settings`, `/app/team`, `/app/account-settings`) are open to any
     member; **admins/super-admins bypass the module gate** (never lock an admin out on a stale
     token). `/app/starters` is Super-Admin-only, checked *before* the admin bypass.
   - `/api/*` requires one of: the shared workspace API_KEY (Bearer or the `gitwork_api_session`
     cookie), a verified per-user mobile JWT, or a NextAuth session. `PUBLIC_API_PATHS` (~25
     prefixes: `/api/health`, `/api/auth`, `/api/sign`, `/api/docs`, `/api/onboarding`, `/api/vet`,
     `/api/public/pulse`, `/api/wiki`, `/api/webhooks/*`, `/api/cron`, …) bypass this because they
     self-authenticate by URL token / HMAC / bearer. Match on a path-segment boundary so siblings
     can't leak.
   - **Header-spoofing defense:** strip incoming `x-foundry-user-id/email/role` from every request;
     only re-set them from verified mobile-JWT claims for downstream handlers.
   - Mint the `gitwork_api_session` cookie on the `/app` response (httpOnly, sameSite lax, secure in
     prod, 12h) so browser fetches pass the API_KEY check. Enforce a `sessionVersion` check to bounce
     stale tokens. CORS wildcard only on public paths; authed routes get none.
2. **Route handlers** — write gates via `assertCan`; field gates by **omitting the data from the
   payload entirely** for unauthorized viewers (a scoped user must never *receive* the value, not
   merely have it hidden in the DOM).

### The `assertCan` invariant (`src/server/auth/effective-user.ts`)
`assertCan(user | null, check, label)` **no-ops when `user` is null** (a trusted API_KEY / server
caller) and throws `ForbiddenError` (403) only for a signed-in user lacking the permission. Same for
`assertAtLeastAdmin` and `assertSuperAdmin`. `UnauthorizedError` (401) and `ForbiddenError` (403)
carry a numeric `.status` that `fromError` propagates. Private helper convention:
`can(user, id) => isSuperAdmin(user.role) || user.permissions.includes(id)`, wrapped in named gates
(`canManageClients`, `canViewClientFinancials`, `canShareDocs`, …).

### View-as
`applyViewAs` swaps the effective user to a target member only when the caller is Super-Admin and an
`x-view-as-user` header is present — otherwise ignored (no escalation path). Preview permissions must
never poison the persisted nav cache.

### General posture
SSRF guard (reject private/reserved/loopback/metadata ranges; http/https only; no creds in URL) +
per-IP/per-host rate limiting on the public scan endpoints; secrets encrypted at rest; tokenized
share links revocable (rotate the token / `revalidateTag`); never put personal data in query strings.
</security_model>

<ai_conventions>
- **Never hardcode a model name.** Resolve config per workspace via `resolveAiConfig(workspace)`:
  reads `workspace.aiProvider` (`ANTHROPIC | OPENAI | GEMINI | LOCAL`) and returns
  `{ provider, apiKey, model, baseUrl }`. **Env keys take precedence** over workspace-stored keys
  (`process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey`). Gemini uses the OpenAI-compatible
  base URL; local defaults to an Ollama-style endpoint.
- **`DEFAULT_MODELS`** is the single fallback source (Anthropic → `claude-sonnet-5`, etc.). A
  `tier: "light" | "standard"` argument routes cheap work to `LIGHT_MODELS` (Haiku / mini).
- Shared resolver `completeText({ config, system, user, maxTokens, tier })` +
  `parseJsonObject<T>(raw)` (strips ```json fences, slices first `{` to last `}`, returns null on
  failure). On the Anthropic path, mark the system prompt with `cache_control: { type: "ephemeral" }`
  for prompt caching and surface `stop_reason === "refusal"` as an error.
- **The `ai.generate` gate:** `canGenerateAi(user) = isAtLeast(user.role, "ADMIN") ||
  user.permissions.includes("ai.generate")`. Assert it at the boundary of every token-spending route
  (`assertCan(await getEffectiveUserOrNull(req), canGenerateAi, "use AI …")`). Non-holders read
  cached AI output only. (Scribe meeting-note fetching is the documented exception and is not gated
  by `ai.generate`.)
</ai_conventions>

<build_order>
Build in this order, each phase to its exit criterion, keeping the build green throughout.

1. **Scaffold + design system.** Next 15 + TS + Tailwind v4 (CSS-first). Author `globals.css`
   (tokens on `:root` + `[data-theme="light"]`, the `@layer base` anchor reset, the `@layer
   components` widget/app vocabulary, dark-mode variant + the three remap systems). Fonts in
   `layout.tsx`. The shared primitives: `<Modal>`, `Button`, `useToast`, `Tooltip`, `cn()`.
   **Exit:** a demo bento page renders the signature widget card correctly in both light and dark.
2. **Data + persistence.** Prisma schema for the Platform domain, `prisma.ts` singleton, a
   `bootstrap.ts` that creates the default `User`/`Workspace`, pgvector enabled on boot.
   **Exit:** `prisma db push` runs clean; base records seed.
3. **Auth + shell.** NextAuth (Google) + mobile-JWT path; `middleware.ts`; `types/auth.ts` catalog +
   resolution; `effective-user.ts` (`requireAuthedUser`, `assertCan`, gates, view-as). The `/app`
   shell + sidebar filtered by permissions, with the `localStorage` nav cache and view-as banner.
   **Exit:** an unauthorized user is redirected; sidebar shows only permitted modules; view-as works.
4. **API foundation.** `api-response.ts`, `validators.ts`, `lib/api.ts` + `apiFetch`. Wire one CRUD
   domain end to end (hook → route → server) with optimistic update + rollback as the template.
   **Exit:** create/read/update/delete round-trips with optimistic UI.
5. **Modules, in dependency order.** Portal/clients **first** (most modules reference a client), then
   Docs, Pulse, Code, Care, Backstage, Studio. Nest Scribe / Tasks / Wiki inside Portal and Study
   inside Pulse. Each module: schema slice → server module → gated routes → hooks → design-faithful
   UI → public token page (if it has one) → verify. **Exit per module:** its slice meets
   `<definition_of_done>`.
6. **Cross-app surfaces.** The "On Your Desk" drawer, "The Monday Brief", and the role-based HQ
   dashboards (`DevOverview` vs the permission-filtered bento grid).
7. **Deploy.** Dockerfile + Compose (app + Postgres/pgvector), GitHub Actions to build an image and
   deploy to the VPS on push to `main`, host cron hitting `/api/cron/*` with a `CRON_SECRET`,
   scheduled `pg_dump` backups, and Let's Encrypt renewal.
</build_order>

<definition_of_done>
A slice is done only when all of these hold:
- `npx tsc --noEmit` is clean.
- `npm run build` (`prisma generate` → `prisma db push` → `next build`) is clean.
- The schema diff is **additive-only** (no dropped/renamed columns, tables, or enum values).
- Dark mode checked (no invisible text on the neutral shell) and the `lg` (1024px) breakpoint
  checked, including the 640–1023 tablet band.
- Accessibility checked on interactive surfaces (Modal focus trap + Escape, `aria-live` toasts,
  keyboard nav).
- **Server-side gating verified:** an unauthorized viewer's API payload *omits* every gated field
  (confirm the value isn't in the response, not just hidden in the UI).
- No hardcoded AI model names; all AI routes assert the `ai.generate` gate.
- A Conventional Commit message (`feat:`, `fix:`, `chore:`, `docs:` …).
</definition_of_done>

<anti_patterns>
Each is a real, load-bearing rule. Never do the thing; the reason follows.
- **Never add a `tailwind.config.js`** — config is CSS-first in `globals.css`; a config file
  fractures the source of truth.
- **Never unlayer the anchor reset** — an unlayered `a { color }` beats `text-{color}` utilities in
  Tailwind v4 and silently breaks colored links.
- **Never use the `background:` shorthand on `.app-select`** — it wipes the chevron SVG and the
  chevron tiles across the field. Use `background-color:`.
- **Never build new UI with raw `neutral/slate/gray/zinc/stone` text classes or `bg-white`** without
  the token remap — they don't flip and go invisible on the dark shell. Use `--text-*` / `--surface-*`.
- **Never assume a navy dark shell** — the implemented dark mode is neutral black/grey, and the brand
  ramp inverts (light-blue fill → dark button text).
- **Never add a 9th top-level sidebar item** — nest new internal tools under Backstage or an existing
  module (the umbrella rule).
- **Never hardcode an AI model** — resolve from workspace settings via `resolveAiConfig`.
- **Never merely hide sensitive data in the UI** — gate it server-side so it's absent from the
  payload for unauthorized viewers.
- **Never run `prisma db push --accept-data-loss`** or ship a non-additive schema change against a
  shared database — new columns nullable/defaulted, legacy columns kept.
- **Never ship a card without the `01 // WIDGET NAME` mono header** — it is the brand signature.
- **Never mix the three font lanes** — Inter for UI, DM Serif Display for stat/hero figures only,
  JetBrains Mono for headers/labels/timestamps/code.
</anti_patterns>

<output_format>
How to work:
- Build **one vertical slice at a time** and keep `tsc` and `next build` green between slices.
- Reuse the named tokens, classes, and primitives in this document before inventing anything; if you
  must add a pattern, say why.
- Use **Conventional Commits**; each commit should leave the build green.
- **Confirm before destructive or outward-facing actions** — schema drops, deletes, sending
  anything on a user's behalf, publishing public content.
- Treat the specifics in this document (tokens, class names, security invariants, IA) as
  authoritative — the same standing as `DESIGN.md`. When taste and this document conflict, this
  document wins.
- Be explicit about what is stubbed, deferred, or unverified. Don't claim a slice is done until it
  meets `<definition_of_done>`.
</output_format>
