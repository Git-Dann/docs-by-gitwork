# Foundry — Gitwork Costing & Quote Tool (Super-Admin) — Build Prompt

> **Recommendation up front.** This should be built as a **Super-Admin-only tool _inside_ Foundry**,
> not a standalone app and not a public feature. Three reasons: (1) the costing engine already exists
> in the codebase (`src/server/pulse-pricing.ts` + Rate Card + FX + `CostLineItem`) and is only
> missing a standalone entry point — a separate app would re-implement all of it; (2) its output is a
> fixed-price quote, which is exactly what the **Docs** module produces, so it should feed a proposal
> rather than live apart; (3) it exposes **internal cost, blended rates, and margin** — the most
> sensitive financial data in the platform — which is already governed by Foundry's field-permission
> gates and Super-Admin model (`dan@gitwork.co.uk` is an auto-provisioned Super Admin).
>
> **What this is.** A feature-build prompt in Foundry's conventions. Paste it into a coding agent
> working in the `docs-by-gitwork` repo. It reuses existing primitives by name; where it says
> "reuse", do not re-implement. Treat its specifics as authoritative alongside `CLAUDE.md`,
> `DESIGN.md`, and `BUILD-PROMPT.md`.

---

<role>
You are a senior full-stack engineer working in the existing **Foundry by Gitwork** codebase
(Next.js 15, React 19, TS, Tailwind v4 CSS-first, Prisma 6 + Postgres, TanStack Query, Zod). You are
adding one tool: a **Costing & Quote** estimator for Gitwork. Follow every convention in `CLAUDE.md`,
`DESIGN.md`, and `BUILD-PROMPT.md`. Reuse existing primitives; ship a vertical slice; verify before
claiming done.
</role>

<context>
**Gitwork's business model (this drives the whole design).** Gitwork is a UK-led (Manchester) agency
with an Islamabad build studio. Every release is reviewed, QA'd, and deployed by a **UK senior
engineer**, with one named UK owner accountable. It sells **fixed scope, fixed price, fixed
timeline** — the client sees the whole plan and a firm price before any code is written. It is
explicitly **anti-retainer and anti-"body-shop billing"**: no hourly treadmills, no surprise invoices.

**Why a costing tool.** Committing to a fixed price safely requires costing the work *internally*
first: estimate the effort, apply Gitwork's **blended cost** (cheaper Islamabad build hours + a UK
senior-review overhead on top), add a **target margin**, and emit a client-facing fixed price and
timeline. Today Foundry can only do this as a side effect of a Pulse scan. Gitwork needs to cost an
engagement from a brief or a scope on demand — the "free 30-minute audit → fixed price" motion.

**Who uses it.** The owner and any Super Admin. Internal cost and margin are never shown to clients,
developers, or non-financial staff.
</context>

<what_exists_reuse>
Reuse these — do not rebuild. (Paths are current in the repo.)

- **The estimator engine — `src/server/pulse-pricing.ts`:**
  - `blendedDayRateGbp(workspaceId, config)` — pulls non-archived Rate Card people, optionally narrows
    to a seniority band (regex on `RateCardPerson.area`), `normalizeToMonthly` each, converts USD→GBP,
    takes the **median monthly**, ÷ `WORKING_DAYS_PER_MONTH`, rounds to £5. Falls back to
    `DEFAULT_DAY_RATE_GBP = 450`.
  - `computePricingBands(estimate, dayRateGbp)` — turns effort (dev-weeks) into 1/2/3-dev price +
    calendar-week bands using efficiency factors `{1:1.0, 2:0.85, 3:0.75}`.
  - `computePricingBandsForWorkspace(workspaceId, pricingConfigRaw, estimate)` — one-call wrapper.
  - `resolvePricingConfig` — validates `PulsePricingConfig` (`fxFromUsd`, `dayRateOverrideGbp?`,
    `seniority?`).
- **Rate Card — `src/server/rate-card.ts`:** `normalizeToMonthly(sourceRate, billingPeriod)`
  (DAY×21.67 / WEEK×4.333 / MONTH passthrough), `WORKING_DAYS_PER_MONTH = 21.67`,
  `serializeRateCardPerson`, `listRateCardPeople`. `RateCardPerson.sourceRate` is the **internal
  cost** rate; `tier`, `area` (seniority/skills string), `archivedAt`.
- **FX — `src/server/fx.ts`:** `getUsdToGbpRate()` / `FxRate` (12h cached, graceful null).
- **Cost persistence + math — `CostLineItem` (Prisma), `src/lib/sections/costing.tsx`
  (subtotal/discount/tax/total math in the Preview), `src/server/proposals.ts` (`normalizeSubtotal`,
  `getDefaultCostsPayload`, `serializeProposal({ canViewCosts })` which blanks costs server-side).**
- **Proposal generation from an estimate — `src/server/pulse.ts` `generateProposalFromScan` +
  `buildCostPayload(llm, pricingBands)`:** the exact pattern for turning a priced band into a
  `Document` (type PROPOSAL) with seeded `CostLineItem`s, sections, and a timeline. Mirror it.
- **Types — `src/types/pulse.ts`:** `EngagementEstimate` (weeksLow/High, priceLow/High, phases,
  confidence), `PricingBand`, `PulsePricingConfig`.
- **Permission gates — `src/server/auth/effective-user.ts`:** `canViewCosts`, `canViewRateCard`,
  `canViewClientFinancials`, plus `assertSuperAdmin(user | null)` / `isSuperAdmin`. Field-blanking
  DTO pattern (`serialize*`) is the enforcement model — never hide-only in the client.
- **Client financials (reference, not reused directly) — `src/server/client-metrics.ts`:**
  `businessDaysBetween` (GB holidays), dominant-currency logic.
- **AI resolver — `src/server/ai-provider.ts`:** `resolveAiConfig` / `completeText` /
  `parseJsonObject`; the `ai.generate` gate (`canGenerateAi`).
</what_exists_reuse>

<the_gap>
What is genuinely new (everything else is wiring existing parts):
1. **A standalone, interactive estimator** not tied to a Pulse scan or an existing document.
2. **An explicit cost→margin→price model.** The existing engine collapses cost and price into one
   blended day rate. Gitwork needs the two separated: `RateCardPerson.sourceRate` is **cost**; the
   tool applies a **target margin** to derive the client price, and shows both to the Super Admin.
3. **The Gitwork blended-delivery cost model:** a cheaper build rate (Islamabad) **plus a UK
   senior-review overhead** (a configurable % of build effort, or a per-phase review allocation, at
   a UK senior cost rate). This is Gitwork's actual delivery shape and must be a first-class lever.
4. **Persistence for saved estimates** and a one-click **"Create proposal from this estimate"** that
   reuses the `buildCostPayload` pattern to hand off to Docs.
</the_gap>

<placement>
- **Sidebar: none.** Respect the umbrella rule — there are only 8 top-level items; never add a 9th.
- **Entry points (Super-Admin-gated):**
  - A **"New estimate"** action on the **Docs** list (`/app/docs`) and a dedicated route
    `/app/docs/costing` (or `/app/docs/estimates`). Docs is the right home because an estimate's
    natural next step is a proposal.
  - Optionally surface a compact "Estimate" tile on Foundry HQ **only** for Super Admins.
- Gate the route in `src/middleware.ts` behind the Super-Admin check (like `/app/starters`), and gate
  every API route and the UI with `assertSuperAdmin` / `isSuperAdmin`.
</placement>

<data_model>
Additive only (nullable/defaulted; `prisma db push` runs without `--accept-data-loss`).

- **`model CostingEstimate`** (workspace-scoped): `id`, `workspaceId`, `createdById`, `name`,
  `clientId String?` (loose link to `WorkspaceClient`, no hard FK — cross-module convention),
  `brief String?`, `estimate Json` (an `EngagementEstimate`), `pricingConfig Json`
  (`GitworkCostingConfig`, below), `bands Json` (`PricingBand[]`), `chosenBandDevs Int?`,
  `marginPercent Decimal(5,2)?`, `internalCostGbp Decimal(12,2)?`, `clientPriceGbp Decimal(12,2)?`,
  `generatedDocumentId String?`, timestamps. Index `(workspaceId, createdAt)`.
- **`GitworkCostingConfig`** (extends the existing `PulsePricingConfig` shape; store on the estimate
  and a workspace default on `Workspace.costingConfig Json?`): `fxFromUsd`, `dayRateOverrideGbp?`,
  `buildSeniority?`, `ukReviewOverheadPercent` (default e.g. 15), `ukReviewDayRateGbp?`
  (blended UK senior cost day rate; else derive from Rate Card `area ~ /senior|lead|principal/i`),
  `targetMarginPercent` (default e.g. 50), `contingencyPercent?` (default e.g. 10).
- No changes to `RateCardPerson` / `CostLineItem` / `Document` beyond the existing
  `Document`↔estimate link via `CostingEstimate.generatedDocumentId`.
</data_model>

<pricing_engine>
New pure module **`src/server/costing.ts`** built on `pulse-pricing.ts`. Keep it deterministic and
unit-testable (no AI, no I/O in the math functions).

Model (all GBP after FX):
1. **Build cost day rate** = `blendedDayRateGbp(workspaceId, { ...config, seniority: config.buildSeniority })`
   — treat the Rate Card `sourceRate` as internal **cost**.
2. **Effort** comes from an `EngagementEstimate` (dev-weeks + phases). Reuse `computePricingBands` for
   the 1/2/3-dev calendar-week + effort split and efficiency factors.
3. **Internal cost** for a chosen team size:
   `buildCost = devDays × buildCostDayRate`;
   `ukReviewCost = buildCost × (ukReviewOverheadPercent/100)` **or** `ukReviewDays × ukReviewDayRateGbp`;
   `contingency = (buildCost + ukReviewCost) × (contingencyPercent/100)`;
   `internalCost = buildCost + ukReviewCost + contingency`.
4. **Client price** from target margin: `clientPrice = internalCost / (1 − targetMarginPercent/100)`
   (round to a sensible band, e.g. nearest £250). Derive and surface the **effective margin** and
   **markup** so the Super Admin sees both.
5. **Fixed timeline** = the chosen band's calendar weeks (already computed by `computePricingBands`),
   optionally snapped to whole weeks; expose per-phase weeks for the proposal timeline.
6. Return a `GitworkCostingResult`: `{ bands, chosen: { devs, weeks, internalCost, clientPrice,
   marginPercent, markupPercent, breakdown: { buildCost, ukReviewCost, contingency } } }`.

Add a workspace convenience wrapper `computeGitworkCosting(workspaceId, config, estimate)` mirroring
`computePricingBandsForWorkspace`.
</pricing_engine>

<backend>
Follow the standard route shape (`export const dynamic = "force-dynamic"`, `await params`, Zod parse,
`apiOk`/`fromError`). All routes **Super-Admin only**.

- `src/server/costing.ts` — the engine (above) + CRUD: `createEstimate`, `updateEstimate`,
  `listEstimates`, `getEstimate`, `deleteEstimate`, `recomputeEstimate`, and
  `createProposalFromEstimate(user, estimateId)` (reuse the `buildCostPayload` / `generateProposalFromScan`
  pattern to mint a `Document` of type PROPOSAL with seeded `CostLineItem`s + timeline, then set
  `CostingEstimate.generatedDocumentId`).
- Validators in `src/server/validators.ts`: `costingEstimateCreateSchema`,
  `costingEstimateUpdateSchema` (`.refine` non-empty), `gitworkCostingConfigSchema`,
  `engagementEstimateInputSchema`.
- Routes under `src/app/api/costing/`:
  `GET/POST /api/costing/estimates`, `GET/PATCH/DELETE /api/costing/estimates/[id]`,
  `POST /api/costing/estimates/[id]/recompute`, `POST /api/costing/estimates/[id]/proposal`,
  and `POST /api/costing/preview` (compute bands from a config + estimate without persisting).
  Every handler: `const user = await requireAuthedUser(req); assertSuperAdmin(user);`.
- Optional AI assist route `POST /api/costing/estimates/[id]/scope` — gated by BOTH `assertSuperAdmin`
  AND `assertCan(user, canGenerateAi, "AI scoping")`: takes the free-text `brief`, uses `completeText`
  + `parseJsonObject` to produce an `EngagementEstimate` (phases + dev-weeks + confidence). Mark the
  system prompt `cache_control: ephemeral`. Non-generators can still cost a manually-entered scope.
- Hooks in `src/hooks/use-costing.ts` (React Query: query-key factory, optimistic update + rollback,
  `invalidateQueries(["costing"])`); fetchers in `src/lib/api.ts` via `apiFetch`.
</backend>

<frontend>
Design-system faithful (see `DESIGN.md` / `BUILD-PROMPT.md` `<design_system>`). Every panel opens with
the `01 // WIDGET NAME` mono header; Inter/DM Serif Display/JetBrains Mono lanes; bento layout;
`app-*` / `widget-*` classes; `<Modal>`, `Button`, `useToast`; tables in `overflow-x-auto`; light +
dark (neutral shell) verified.

Screen: `/app/docs/costing` (Super-Admin only; render a clean "not available" state otherwise, and
never fetch). Panels:
- **`01 // SCOPE`** — name, optional client picker (reuse client list), free-text brief; a manual
  phase/effort editor (phase name, dev-weeks, role/seniority) with `@dnd-kit` sortable rows; an
  **"AI scope this"** button (only if `canGenerateAi`) that fills the phases.
- **`02 // COST INPUTS`** — the `GitworkCostingConfig` levers: build seniority band, FX, UK-review
  overhead %, UK senior day rate, contingency %, **target margin %**, day-rate override. Prefill from
  `Workspace.costingConfig`. Use `app-input`/`app-select` (mind the `background-color` chevron rule).
- **`03 // PRICING BANDS`** — the 1/2/3-dev bands from the engine as `widget-stat` figures (client
  price) with `widget-data-label`s (weeks, devs). Selecting a band sets `chosenBandDevs`.
- **`04 // MARGIN & COST` (internal, Super-Admin)** — the breakdown: build cost, UK-review cost,
  contingency, **internal cost**, **client price**, effective **margin %** + **markup %**. Style as an
  instrument readout; make it visually distinct as internal-only.
- **Actions** — Save estimate; **"Create proposal"** (mints the Docs PROPOSAL and links it; toast +
  deep-link to the new doc).
Estimates list (saved `CostingEstimate`s) with name/client/price/date and open/duplicate/delete.
</frontend>

<security>
- **Super-Admin only, enforced at three layers:** middleware route gate (before any admin bypass, like
  `/app/starters`), `assertSuperAdmin(user)` in every `/api/costing/*` handler, and
  `isSuperAdmin` in the UI (skip the fetch for non-super-admins).
- **Internal cost and margin must never reach a client-facing surface.** They are absent from the
  proposal share view (`/docs/[token]`) and any non-super-admin payload. The generated proposal
  carries only the **client price** as `CostLineItem`s (respecting the existing `canViewCosts`
  blanking in `serializeProposal`) — never the cost/margin breakdown.
- FX + Rate Card reads are server-side; no rates or cost figures in query strings or logs.
- The AI scoping route additionally requires `canGenerateAi` (token spend) and reads cache when the
  caller lacks it.
</security>

<build_order>
1. **Engine + tests.** `src/server/costing.ts` pure functions on top of `pulse-pricing.ts`; unit tests
   for cost→margin→price, UK-review overhead, contingency, and band selection. Exit: `npm test` green.
2. **Schema + persistence.** `CostingEstimate` model + `Workspace.costingConfig`; `db push` clean.
3. **API + hooks.** Validators, `/api/costing/*` routes (Super-Admin gated), `use-costing.ts`,
   `lib/api.ts` fetchers. Exit: preview + CRUD round-trip via the hook.
4. **UI.** The `/app/docs/costing` screen + estimates list, design-system faithful, gated.
5. **Proposal handoff.** `createProposalFromEstimate` reusing `buildCostPayload`; wire the button.
6. **AI scoping (optional).** The `scope` route + button, double-gated.
7. **Entry points + middleware gate.** Docs-list action, optional HQ tile, `/app/docs/costing` in
   `MODULE_PATHS` as Super-Admin-only.
</build_order>

<definition_of_done>
- `npx tsc --noEmit` and `npm run build` clean; new engine unit tests pass; schema diff additive-only.
- Super-Admin gate verified at all three layers; a non-super-admin gets no cost/margin in any payload
  and cannot reach the route or the APIs (403).
- The generated proposal shows only the client price (cost/margin never appear in `/docs/[token]`).
- Dark mode + `lg` breakpoint + a11y (`<Modal>`, `aria-live` toasts) checked; `01 // …` headers on
  every panel; no mixed font lanes; `.app-select` uses `background-color`.
- No hardcoded AI model; AI scoping asserts `ai.generate`.
- Conventional Commit(s), build green between slices.
</definition_of_done>

<anti_patterns>
- **Never re-implement the estimator** — build on `pulse-pricing.ts` / `normalizeToMonthly` / `fx.ts`.
- **Never conflate cost and price** — `RateCardPerson.sourceRate` is cost; client price is
  cost-plus-margin. Show both to the Super Admin; ship only the price to the client.
- **Never leak internal cost or margin** to a client-facing surface, a developer, or a non-financial
  staff payload — gate server-side, not just in the UI.
- **Never add a 9th top-level sidebar item** — the tool lives under Docs / HQ as a Super-Admin entry.
- **Never model this as a retainer/hourly billing tool** — Gitwork sells fixed scope/price/timeline.
- Plus the standing Foundry footguns (see `BUILD-PROMPT.md` `<anti_patterns>`): no `tailwind.config.js`,
  layered anchor reset, `background-color` on `.app-select`, token-based dark styles, additive schema,
  the `01 // WIDGET NAME` signature, no hardcoded models.
</anti_patterns>

<output_format>
Build one slice at a time, keeping `tsc`/`build`/tests green. Reuse the named primitives before
inventing anything. Confirm before destructive actions. Be explicit about what is stubbed or deferred.
Treat this document as authoritative alongside `CLAUDE.md`, `DESIGN.md`, and `BUILD-PROMPT.md`.
</output_format>
