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
| `widget-card` | globals.css `@layer components` | Base card for nearly every panel. ⚠️ **It is `overflow: hidden`.** Anything inside it that is wider than the card is not merely off-screen, it is **unreachable** — there is no scrollable ancestor to get to it, and the page does not scroll sideways either, so a page-X check reports clean while the content is simply gone. Any wide child (a column grid, a table, a chart) must bring its own `overflow-x-auto`. |
| `widget-header` | globals.css | Fixed **36px** tall. `widget-header__label` is `white-space: nowrap`; the **status** text on the right can wrap — this is the usual "header clipped / text overflow" culprit when a card is forced narrow. Fix by giving the card more width (stack the grid) rather than shrinking the label. |
| `app-table` | globals.css | Must live inside a `overflow-x-auto` wrapper. Tables do **not** reflow — they scroll. Don't try to make a wide table fit a narrow column; give it full width on mobile. **A column grid is a table** for this purpose — a `grid` with fixed `px` columns needs the same wrapper, and the header row must sit inside the **same** scroller as the rows or the two desync the moment anyone scrolls. Give the wrapper's inner frame a `min-w-[…]` generous enough that the `1fr` content column stays readable: sized to only what the columns strictly need, the flexible column is crushed to nothing and every value ellipses, which defeats the point of scrolling. |
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
5. **Run the clipping audit** (§3a) on whatever you can reach. "It looked right in the
   screenshot" is how cut-off UI keeps shipping — the audit checks the whole DOM, in states a
   screenshot never covers.
6. **Run `npm run audit:ui`** (§3b). It reads source rather than a rendered page, so unlike the
   clipping audit it covers the auth-gated `/app` screens too — which is where most of this repo's
   field-padding and chevron defects have actually been.
7. **Report the blast radius, not just the fix**: what changed, every place that shares the code
   and why it's safe, desktop-regression status, and the verification actually run (with output).

---

## 3a. The clipping audit — `npm run audit:clipping <url>`

`scripts/audit-clipping.mjs` exists because "I opened the UI and it was cut off" kept being found
by hand. It drives a page in headless Chromium at four viewports and walks every rendered element
for the five ways content goes missing without anyone noticing in review:

| | |
|---|---|
| `CLIPPED` | an ancestor's overflow cuts it off **and that ancestor cannot scroll** to reveal it |
| `OFFSCREEN` | a fixed/sticky panel rendering outside the viewport, unreachable by scrolling |
| `COLLAPSED` | it has text but zero height/width — a container that closed up |
| `TRUNCATED` | text ellipsed/cut with no `title` **and** no scroll, so the value is unreadable anywhere |
| `PAGE-X` | the page scrolls sideways — **and it names the element responsible** |

```bash
npm i --no-save playwright-core          # not a repo dep; Chromium is preinstalled
npm run audit:clipping -- --self-test    # proves the detector still fires (do this first)
npm run audit:clipping http://localhost:3000/api-docs
npm run audit:clipping http://localhost:3000/ --viewports=390x844,1280x620
```

**On a local macOS machine none of that works, and the three reasons are all
non-obvious** (worked out 2026-08-22 while auditing the live `/production-ready`):

1. `npm i --no-save playwright-core` **fails outright** with `EBADENGINE`. It is not
   playwright's engines field — it is this repo's own: `package.json` pins
   `engines: {node: "22.x"}`, so npm refuses *any* install here on a newer node.
   Add `--engine-strict=false`.
2. Do **not** install it into a Claude Code worktree. Those share one `node_modules`
   by symlink, so an install lands in the tree other sessions are running tests
   against. Install into a scratch directory instead.
3. `NODE_PATH` does **not** help — the script is ESM, which ignores it. Copy the
   script next to the install and run it from there.

```bash
mkdir -p /tmp/pwtools && cd /tmp/pwtools
printf '{"name":"pwtools","private":true}\n' > package.json
npm i --engine-strict=false playwright-core
cp /path/to/repo/scripts/audit-clipping.mjs .
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node audit-clipping.mjs https://foundry.gitwork.co.uk/production-ready
```

`CHROMIUM_PATH` is honoured by `findChromium()` ahead of everything else, so a normal
system Chrome works and no browser download is needed. Verified clean at 390 · 768 ·
1280x620 · 1440 against the live `/production-ready` and `/embed/pulse`, with
`--self-test` passing first.

⚠️ **A page that failed to load is not a clean page, and the script used to say it was.** `total`
counted findings only, so a run where every `goto()` errored printed `0 finding(s)` and **exited
0** — byte-identical to a genuine pass, on a run that audited nothing. It now reports how many
combinations were actually audited, says plainly that the failures prove nothing, and exits 1.
Read the ERROR lines before believing a clean summary.

**It is deliberately quiet** about content that is *meant* to be out of view: `display:none`,
`visibility:hidden`, `opacity:0`, `aria-hidden`, sr-only nodes, closed disclosures (`aria-expanded`,
`<details>`, a `collapsed`/`closed` class, a zero-size rail), SVG internals, fixed-canvas artboards
(a slide crops what hangs off it by design), and **anything a scrollable ancestor can bring into
view** — scrollable-but-clipped is normal UI, not a defect. Each of those exclusions is a heuristic,
so a suspiciously clean report deserves one look at the panel in question.

Two rules learned the hard way, both encoded in the script:

- **`overflow:hidden` is not scrollable.** The browser still reports `scrollWidth`/`scrollHeight`
  past the box, so testing those alone excuses the single most common way UI disappears. Only
  `auto`/`scroll` means a person can reach it.
- **`innerWidth` lies on mobile.** When content forces a page wider than the device, mobile
  browsers widen `innerWidth` to fit it — so it reports nothing past the edge while the user is
  scrolling sideways. Measure against `documentElement.clientWidth`.

**Run it before claiming a responsive fix is verified.** For Deck (`/deck`) it is already wired into
`npm run deck:verify`, which drives eight editor states (dialogs, popovers, a full props rail,
present mode) at four viewports — 1280×620 is in the list on purpose, because a short laptop
viewport is where dialogs run off the bottom with nothing to scroll. `/app` pages stay unreachable
until there's a staging environment; point the script at them the day there is one.

## 3b. The static standards audit — `npm run audit:ui`

`scripts/audit-ui-standards.mjs` is the companion to §3a. The clipping audit is the better
detector — it drives a real page — but it can only see pages it can reach, and **every `/app` page
is auth-gated with no staging environment**. So the defects that keep being found by hand (a value
tucked under a select's chevron, copy jammed against the top edge of a textarea, a fixed pixel
width that drags a phone sideways) had no gate at all on the screens where most of them live.

This one reads the **source**, so it covers all 500+ components including the gated ones, and needs
no browser and no server.

```bash
npm run audit:ui -- --self-test        # do this first — proves each rule still fires
npm run audit:ui                       # exits 1 on any finding
npm run audit:ui -- --rule=SELECT-PAD  # one rule
npm run audit:ui -- --warn-only        # report, don't fail
```

Rules: `SELECT-CHEVRON` · `SELECT-PAD` · `TEXTAREA-PAD` · `INPUT-PAD` · `FIXED-WIDTH` ·
`TABLE-SCROLL` · `MODEL-LITERAL`. Each one, and the reasoning behind it, is tabulated in
[`docs/build-checklist.md`](build-checklist.md) §2.

**The two audits are complementary, and neither is sufficient alone.** The static one knows the
house field classes but has never seen a layout; the runtime one measures real boxes but can't log
in. Both are blind to "this looks wrong" — a mismatched corner radius on a split control, or a
`<select>` whose value is *recoverable* but visually cramped, are screenshot findings (see
`CLAUDE.md` §30, "two layout defects the audit could not see").

**Both are wired into CI** (`.github/workflows/checks.yml`) — `audit:ui` on every PR; the clipping
audit stays manual/`deck:verify` until there's a staging environment to point it at.

## 3c. The height chain — a `lg:`-only bound means the phone cannot scroll

The app shells frame themselves as `h-[100dvh] overflow-hidden` and make `<main
overflow-auto>` the scroll container. That only works while **every ancestor
between the root and `<main>` has a bounded height**. Break the chain anywhere and
`<main flex-1>` resolves against `auto`, grows to fit its content, and the root's
`overflow-hidden` clips it — with **nothing** scrollable, page or main. Content
below the fold becomes unreachable rather than merely awkward.

The trap is a bound that is applied at `lg:` only:

```
"min-h-0 flex-1 w-full lg:grid lg:grid-rows-[minmax(0,1fr)]"   ← desktop-only bound
```

That reads as correct because the desktop grid row genuinely does bound `<main>`.
Below `lg` the element is a plain block, so nothing does. This shipped in
`app-shell.tsx` and was found by a developer being unable to scroll their My Day
list on a phone — measured at 390×844, `<main>` was **2504px tall in an 844px
viewport with `main-scrolls=false` and `page-scrolls=false`**.

**The rule:** if a shell bounds its height with a `lg:` grid, it must ALSO set a
mobile display mode and let the column claim it:

```
wrapper  "flex min-h-0 w-full flex-1 flex-col lg:grid lg:grid-rows-[minmax(0,1fr)]"
column   "flex min-h-0 flex-1 flex-col …"
```

`flex-1` is inert on a grid item, so the same classes are correct at both sizes.

**Neither audit can see this.** `audit:ui` reads source patterns and
`audit:clipping` needs a reachable URL — and `/app` is auth-gated with no staging.
It is caught instead by `src/components/__tests__/shell-scroll-chain.test.ts`,
which asserts the mechanism on both `app-shell.tsx` and `demo-shell.tsx`. When you
touch a shell's height chain, the honest check is still to render it and measure:
`main.scrollHeight > main.clientHeight` at 390px, or the page scrolling instead.

## 4. Standing rules

- Branch → PR → **squash-merge to `main`** (merge/rebase disabled). `main` **auto-deploys to the
  Fasthosts VPS** via GitHub Actions (`.github/workflows/deploy.yml`, ~6 min). That is the only
  **production** environment — but a **Vercel branch preview is built for every PR and is
  reachable**, so `audit:clipping` CAN be pointed at a public route on your own branch — from a
  normal machine; it does not complete from a Claude Code sandbox. It is Neon-backed and `/app` is
  auth-gated on it; read `docs/build-checklist.md` §4 in full before relying on it.
- Never declare something "done and verified" unless it was actually exercised. If it was only
  static-checked, say exactly that.
- Purely presentational Tailwind changes are low-risk, but still get the blast-radius check —
  a shared class is never "just one screen."
