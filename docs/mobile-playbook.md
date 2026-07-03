# Mobile / Responsive Fix Playbook — Foundry by Gitwork

> **Read this before touching any layout, spacing, or responsive class.** It is the operating
> standard for mobile/responsive work in this repo. The goal is that a mobile fix ships correct
> the first time — verified, and checked for what else it might affect — so nobody has to
> double-check it. Do **not** silo a fix to the one screen in the screenshot: reason about its
> blast radius first.

---

## 1. Repo facts (know these before editing)

- **Breakpoints are standard Tailwind**: `sm` = 640px, `lg` = 1024px. The app's own CSS keys off
  exactly these (`@media (max-width: 639px)` and `(max-width: 1023px)` in `globals.css`).
- **The desktop ↔ mobile split is at `lg` (1024px), not `md`.** In `src/components/app-shell.tsx`:
  the sidebar is `hidden lg:flex`, the mobile top bar + page-title bar are `lg:hidden`, and the
  content only becomes the two-column `lg:grid lg:grid-cols-[280px_minmax(0,1fr)]` at `lg`. So
  **"mobile" here means anything below 1024px — phones *and* portrait tablets.** Test both ends.
- **The "On Your Desk" dock is fixed to the viewport (~48px tall).** Content reserves space for it
  with `pb-12` on the content wrapper. It overlays the bottom of every `/app` page and expands to
  a full-height `<Modal>` sheet on mobile (`src/components/desk/`). Any bottom-anchored UI must not
  hide behind it or fight it for z-index (dock is `z-40`; modals sit above).
- **Main content padding**: `<main>` is `px-6 pb-8 pt-6 sm:px-8`. Don't add redundant outer padding.
- **Tailwind v4 is CSS-first — there is no `tailwind.config.js`.** Config + component classes live
  in `src/app/globals.css`. The anchor/reset rules **must** stay inside `@layer base { … }` — an
  unlayered `a { color: … }` beats `text-{color}` utilities because of cascade-layer priority
  (this cost a real bug once; see `CLAUDE.md` §8).

## 2. Shared primitives — change one, you touch many pages

Grep every usage before editing any of these; a change here is never local:

| Primitive | Where | Watch for |
|---|---|---|
| `widget-card` | globals.css `@layer components` | Base card for nearly every panel. |
| `widget-header` | globals.css | Fixed **36px** tall. `widget-header__label` is `white-space: nowrap`; the **status** text on the right can wrap — this is the usual "header clipped / text overflow" culprit when a card is forced narrow. Fix by giving the card more width (stack the grid) rather than shrinking the label. |
| `app-table` | globals.css | Must live inside a `overflow-x-auto` wrapper. Tables do **not** reflow — they scroll. Don't try to make a wide table fit a narrow column; give it full width on mobile. |
| `bento-grid` | globals.css / HQ dashboard | Already responsive (12→6 cols at 1023, 1 col at 639). Mirror this pattern, don't reinvent it. |
| `<Modal>` | `src/components/ui/modal.tsx` | Focus trap, Escape, scroll-lock, ARIA. Reuse it; don't hand-roll dialogs. |
| Design tokens | `DESIGN.md` | Mono caps for labels (`widget-data-label`), DM Serif Display for stat numbers, JetBrains Mono for timestamps. **Never "fix" a layout by dropping the type system.** |

## 3. Process for every mobile fix — no shortcuts

1. **Reproduce from the evidence.** Map each complaint in the screenshot to the exact element and
   class in source. Note the **viewport** it breaks at (< 640 vs < 1024).
2. **Blast-radius check *before* editing** — the "don't silo it" step:
   - Is the target a **shared component or shared CSS class** (§2)? If yes, grep every caller and
     reason about each, not just the screen in the screenshot.
   - **Will the mobile change regress desktop?** Unprefixed utilities apply at *all* widths — every
     responsive edit is checked at both the base and `lg+`.
   - **Siblings/children**: a `grid-cols` change reflows the whole row; a flex change moves every
     child. Account for all of them.
   - **The fixed dock + modals**: does the change collide with, or hide behind, the Desk dock or a
     Modal sheet?
3. **Implement to the house style.** Mobile-first, responsive Tailwind, reuse tokens/primitives,
   match the surrounding code's idiom.
4. **Verify — not "it looks right in the diff":**
   - **There are no per-branch preview deploys.** Production runs on the **Fasthosts VPS** and only
     `main` is deployed — there is **no hosted preview of a branch** to look at before merge. (Vercel
     is not used; do not reach for a "preview URL".) So pre-merge verification is entirely local +
     reasoning:
   - Fresh clones have **no `node_modules`** — run `npm install` once, then **`npx tsc --noEmit`
     and `npm run build`** so real breakage is caught, not eyeballed. If you can only static-check,
     say so explicitly in the report.
   - Reason through every responsive change at **both** ends (base < 640, and `lg` ≥ 1024) — the
     desktop split is at `lg`, so also sanity-check the 640–1023 tablet band.
   - **Visual confirmation:**
     - **Public pages** (marketing `/`, `/pulse-overview`, `/embed/*`, `/docs/[token]`,
       `/timeline/[token]`, `/report/[token]`) can be driven with **Playwright — Chromium is
       preinstalled at `/opt/pw-browsers/chromium`** — at real mobile viewports (e.g. 390×844,
       768×1024) and screenshotted.
     - **`/app` pages are auth-gated (Google OAuth only — no password/bypass), and there is no
       preview env**, so they **can't be self-screenshotted today**. Until the planned **staging
       environment** exists, hand the user a precise, minimal capture list — the exact page,
       the 2–3 viewports, and the specific elements to check — never "please check everything."
       Once staging is available, drive Playwright against it for gated pages too.
5. **Report the blast radius, not just the fix**: what changed, every place that shares the code
   and why it's safe, desktop-regression status, and the verification actually run (with output).

## 4. Standing rules

- Branch → PR → **squash-merge to `main`** (merge/rebase disabled). `main` **auto-deploys to the
  Fasthosts VPS** via GitHub Actions (`.github/workflows/deploy.yml`, ~6 min). This is the only
  deployed environment — **there are no branch previews**. See `CLAUDE.md` §23.
- Never declare something "done and verified" unless it was actually exercised. If it was only
  static-checked, say exactly that.
- Purely presentational Tailwind changes are low-risk, but still get the blast-radius check —
  a shared class is never "just one screen."
