# Build checklist — run this before you open a PR

> The standing quality bar for anyone building in Foundry. It exists so a change ships correct the
> first time and nobody has to find the same four classes of defect by hand again.
>
> Related: [`docs/mobile-playbook.md`](mobile-playbook.md) is the *how* for responsive work —
> read it before touching layout. This file is the *gate*.

---

## 1. The one command

```bash
npm run verify
```

> ⚠️ **`verify` now runs `audit:ui --self-test` before `audit:ui`, because CI does and it
> previously did not.** That gap shipped a red PR with a green local run: a new audit rule was
> added without its self-test fixture, `npm run verify` passed locally, and CI failed on the
> separate self-test step. Local green must mean CI green, or the gate is theatre.

That runs, in order: `prisma generate` → `tsc --noEmit` → `eslint` → `vitest` →
`audit:dependencies` → `audit:ui --self-test` → `audit:ui`.
It needs no database, no secrets and no running server, so it works on a fresh clone
(`npm install` first).

A **`pre-push` hook** (`.husky/pre-push`) runs it automatically when you push to `main`, and refuses
the push if it fails. It deliberately does **not** fire on a feature-branch push: there, CI reports
on the PR *before* you merge, so a local gate would only slow you down. On `main` the deploy runs
*in parallel* with CI, so the hook is the only check that reports before production gets the change.
`git push --no-verify` bypasses it — on `main`, don't, unless you've just run `verify` yourself.

**CI runs the same chain plus a real `next build`** on every PR via
`.github/workflows/checks.yml`. If you're changing anything structural (a server/client boundary,
a route, `generateStaticParams`), run the build locally too — `tsc` won't catch those:

```bash
npx next build
```

Use `npx next build`, **not** `npm run build`: the npm script runs `prisma db push` first and would
mutate whatever database `DATABASE_URL` points at. For the same reason CI never calls the npm
script. (`next build` itself needs no database — it compiles and prerenders all 101 static pages
without one.)

---

## 2. What the UI audit checks, and why each rule exists

`npm run audit:ui` (`scripts/audit-ui-standards.mjs`) reads **source**, so it covers the
auth-gated `/app` screens that the runtime clipping audit can't reach. Every rule below is a
defect that has actually shipped here at least once.

| Rule | Fires when | Why it matters |
|---|---|---|
| `SELECT-CHEVRON` | a `<select>` has none of `app-select` / `app-select-compact` / `app-input` / `app-select-chevron` | A native `<select>` paints the OS chevron **inside** the box with no reserved padding, so a long value runs underneath it. This is the Deck bug in `CLAUDE.md` §30, and it recurred twice more in `starters` and `Care`. |
| `SELECT-PAD` | `app-select-chevron` with less than 24px right padding | That helper draws the arrow from 7px to 20px in from the right edge. Below `pr-6` the value sits under the chevron. |
| `TEXTAREA-PAD` | a `<textarea>` with horizontal padding but no vertical padding | A textarea is multi-line: with `px-3` alone the first line is flush against the top border. |
| `INPUT-PAD` | a text input that draws its own border but has no horizontal padding | Text flush against the border — the most common "padding in the text boxes" complaint. |
| `FIXED-WIDTH` | an unprefixed `w-[≥380px]` / `min-w-[≥380px]` with no cap, scroller, or desktop-only guard | Applies at every width, so it pushes a 390px phone sideways (`PAGE-X` in the mobile playbook). |
| `TABLE-SCROLL` | a table that **cannot shrink** (px `min-w`, fixed-px `<col>`, nowrap cells) with no scrollable ancestor | Tables scroll, they don't reflow. Note `overflow-hidden` is not a scroller — it clips the overflow away unreachably. |
| `MODEL-LITERAL` | a real model id hardcoded in `src/server/**` or `src/app/api/**` | `DEFAULT_MODELS` in `ai-provider.ts` is the single source of truth. A duplicated `?? "claude-sonnet-5"` keeps the old default when that table is bumped, so a workspace silently pays for the wrong model. |
| `WEAK-PRIVILEGE` | a value from `requireAuthedUserOrDefault` is then used to prove a role (`isAtLeast(x.role`, `assertSuperAdmin(x`, …) | That helper falls back to the **default workspace owner**, who is a Super Admin — so the check *passes* for an identity-less caller instead of returning 401. Its own docstring forbids this use. Use `requireAuthedUser` (throws 401 with no identity), then assert. Found live in `api/dev/sync-bigwedge-status`, July 2026. |
| `ROBOTS-DISALLOW-ALL` | a `MetadataRoute.Robots` file containing a bare `disallow: "/"` | De-indexes the whole origin, and flips Pulse's `aeo_ai_crawlers_allowed` from PASS to WARN because every AI crawler counts as fully blocked. Use path-scoped entries and keep `allow: "/"` as the base rule. One character between "tidy crawl rules" and "invisible to search". |
| `UNDEFINED-CLASS` | An `app-*` / `widget-*` / `button-*` class in a `className` that `globals.css` never defines. **The one UI defect nothing else can catch** — `tsc`, `eslint` and `vitest` never look inside class strings, and `audit:clipping` needs a reachable page. DESIGN.md documented `button-primary` while the implementation was `app-button app-button-primary`, so every button in the Provenance register shipped with no background, border or padding, and icons stacked above their labels. Scoped to our own prefixes, so Tailwind utilities are never flagged. |
| *(vitest)* `design-md-classes` | The **doc direction** of the same guard: every `app-*` / `widget-*` class DESIGN.md names must exist in `globals.css`. `UNDEFINED-CLASS` stops you *using* a class that isn't there; this stops the spec *telling* you to. DESIGN.md had drifted to seven fictional class names, and one component comment proved a second build had hit the trap and worked around it silently. Names deliberately cited as absent live in a justified `DELIBERATELY_ABSENT` map, with a second test that fails if one of them ever gets implemented. |

**Run the self-test before trusting a clean report.** The rules are heuristics over source, and a
clean pass from a rule that has stopped firing is worse than no rule:

```bash
npm run audit:ui -- --self-test    # asserts each rule fires on the defect AND stays quiet on the fix
npm run audit:ui -- --rule=SELECT-CHEVRON
npm run audit:ui -- --warn-only    # report without failing the exit code
```

### When the audit is wrong

These are heuristics, and a false positive means the *rule* needs narrowing — not that the finding
should be silenced at the call site. Every exclusion in the script carries a comment saying why
(`ai-pricing.ts` is a rate card; `pulse-checks/` sniffs model names in scanned HTML; the starters
catalog uses `claude-*` slugs as tags). Add to those lists with a reason, and add a self-test case
proving the rule still fires on the real defect.

---

## 3. What the audit cannot see — still on you

The static audit and the clipping audit between them catch "unreachable" and "unpadded". They do
**not** catch "looks wrong". Two real examples from `CLAUDE.md` §30 that no detector found:

- A split control whose two halves disagreed on their corner radius, so the seam read as a cropped
  edge. Nothing was clipped; a screenshot caught it.
- A native `<select>` at 110px wide whose value ran under the chevron. Recoverable, so the clipping
  audit stayed quiet by design.

So for any visual change:

1. **Blast-radius check first** — is the thing you're editing a shared primitive
   (`widget-card`, `widget-header`, `app-table`, `<Modal>`, a field class in `globals.css`)? Grep
   every caller. See `docs/mobile-playbook.md` §2.
2. **Both ends of the split** — the desktop ↔ mobile break is at `lg` (1024px), not `md`. Check
   base (<640), the 640–1023 tablet band, and `lg+`. Unprefixed utilities apply at *all* widths.
3. **Run the clipping audit on anything reachable** —
   `npm run audit:clipping http://localhost:3000/<path>`, self-test it first. Public pages
   (`/`, `/pulse-overview`, `/api-docs`, `/context`, `/embed/*`, `/docs/[token]`,
   `/timeline/[token]`, `/report/[token]`, `/login`) can be driven headlessly; Chromium is
   preinstalled.
4. **Deck** has its own gate: `npm run deck:verify` (and rebuild + commit `public/deck/index.html`
   if you touched `vendor/bento`).

---

## 4. Verification honesty

**There is no staging environment.** Production is the Fasthosts VPS and only `main` deploys to it
(`CLAUDE.md` §23) — Vercel is not in the production path.

⚠️ **But a Vercel branch preview IS built for every PR, and it IS reachable.** This file used to
say there were none, and that was simply wrong — measured on PR #612 in Aug 2026: `/pulse-overview`,
`/embed/pulse` and `/api/health` all answered 200, `/` redirected to `/portal/login` as designed.
Vercel being "vestigial" (§23) means production DNS no longer points at it; it does not mean the
preview does not exist. The URL is in the `vercel[bot]` comment on the PR.

What that does and does not buy you:

- **Public routes can be verified per-branch.** `npm run audit:clipping <preview-url>/pulse-overview`
  is a real runtime check on the actual branch — no longer something that has to wait for staging.
- **`/app` pages still cannot be self-screenshotted.** The preview is auth-gated exactly like
  production. Use the `renderToStaticMarkup` + compiled-CSS technique (`CLAUDE.md` §39.1) for those.
- **The preview is backed by NEON, not the VPS Postgres.** Vercel's env still carries the Neon URLs
  kept for rollback (§23), so anything you write there lands in the rollback database and is not
  production data — and its build runs `prisma db push` against it.
- **Some public paths have real side effects.** `POST /api/public/pulse/scan` permanently burns
  that email's one free scan, writes a `PulseLead`, and emails the admins. Reachable is not free.
- Never call something "verified" that wasn't actually exercised. `npm run verify` output is the
  evidence; paste it. If a change only got a typecheck and a reasoned read, say exactly that, and
  hand over a precise capture list — the page, the 2–3 viewports, the specific elements — never
  "please check everything".

---

## 5. AI cost discipline

Foundry pays per token, so this is a correctness concern, not a preference:

- **Never hardcode a model.** Resolve through `resolveAiConfig(workspace)`; fallbacks come from
  `DEFAULT_MODELS`. Enforced by `MODEL-LITERAL`.
- **Prefer `completeText()`** from `src/server/ai-provider.ts` for new calls — it marks the system
  prompt with `cache_control: ephemeral`, routes `tier: "light"` to Haiku, and records usage via
  `recordAiUsage` for the cost dashboard. A raw `new Anthropic()` call site gets none of that for
  free.
- **Cache the response, not just the prompt.** Anthropic prompt caching only applies above a
  ~1024-token system prompt, so for short prompts the win is a *response* cache — the
  `AiResponseCache` / `getCachedAiResponse` pattern, keyed on a hash of the inputs (see
  `proof/analyse`, the Curator, the Foreman).
- **Expensive agent passes default OFF** and skip entirely when there is nothing to review — the
  Curator's consolidation and the Foreman's narrative are the reference implementations.
