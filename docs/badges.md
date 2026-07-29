# Badges — "Foundry Approved" and the Pulse score

Two families of embeddable SVG mark:

- **Foundry Approved** — static art in `public/badge/`, for work Gitwork has built or audited.
- **Pulse score** — generated per request from a real scan at `/api/badge/pulse/[token]`.

Both are single self-contained SVG files. They fetch nothing, run no script, and carry the brand
type as outlined paths, so they render identically in an `<img>`, a README, an email, a PDF and a
social card.

---

## 1. Foundry Approved

Five options, all committed under `public/badge/`. Pick per placement; they are not ranked.

| File stem | What it is | Size | Use it for |
|---|---|---|---|
| `foundry-approved-seal` | Circular stamp, rotating legend, drawn tick | 160×160 | The hero mark. Client site footer, case study, proposal cover |
| `foundry-approved-plate` | The house `01 // WIDGET NAME` widget card | 268×132 | Anywhere it sits beside other Foundry UI — a dashboard, a report |
| `foundry-approved-shield` | shields.io-proportioned inline bar | auto×22 | READMEs, docs, a footer line beside other badges |
| `foundry-approved-monogram` | Square mark, Foundry "F" + tick lozenge | 56×56 | Avatar / favicon scale, a compact trust chip |
| `foundry-approved-lockup` | Horizontal certificate lockup | auto×72 | A site footer with room for a sentence |

Each has:

- a **dark variant** — suffix `-dark` (not on `shield`, which carries its own dark ground)
- an **animated variant** — suffix `-anim` (see §3)
- `monogram` additionally has **`-sm`**, which drops the tick lozenge

```html
<img src="https://foundry.gitwork.co.uk/badge/foundry-approved-seal.svg"
     width="120" height="120" alt="Foundry Approved">
```

### Size floors — measured, not guessed

- **Seal: 64px.** Below that the circular legend stops being legible.
- **Monogram: 24px.** Below that the tick lozenge degrades into a smudge — use
  `foundry-approved-monogram-sm.svg`, which is legible down to 16px.

### The copy is baked in

`AUDITED 2026-07-29` on the plate and lockup is real text in the art, not a variable. Change
`AUDIT_DATE` in `scripts/badge/generate.py` and regenerate. If per-client dates are ever wanted,
these should move behind a route the way the Pulse badge already is.

---

## 2. Pulse score

`GET /api/badge/pulse/<token>[.svg]` — public, no API key.

`<token>` is the **`PulseScan.shareToken`**, the same one that serves `/report/<token>`. Get it by
sharing a scan in Pulse; the badge and the report are public together and are revoked together.

```html
<!-- inline, next to other badges -->
<img src="https://foundry.gitwork.co.uk/api/badge/pulse/<token>.svg" alt="Gitwork Pulse score">

<!-- a linked trust card in a footer -->
<a href="https://foundry.gitwork.co.uk/report/<token>">
  <img src="https://foundry.gitwork.co.uk/api/badge/pulse/<token>.svg?style=card&theme=dark"
       width="300" height="200" alt="Gitwork Pulse score">
</a>
```

### Parameters

| Param | Values | Default | Notes |
|---|---|---|---|
| `style` | `shield` · `ring` · `card` · `bar` | `shield` | See the table below |
| `theme` | `light` · `dark` | `light` | Choose for the **host page's** background, not the viewer's OS |
| `motion` | `1` | off | Opt into the animated build — read §3 first |

| Style | Size | Shows |
|---|---|---|
| `shield` | auto×22 | `PULSE 92/100`, colour-banded, pulse-trace glyph |
| `ring` | 152×184 | Score ring + grade + `GITWORK PULSE` caption |
| `bar` | 320×62 | Slim footer readout — score, grade, progress track |
| `card` | 300×200 | Full widget card: ring, project, top four domain bars, VIEW REPORT |

### Behaviour worth knowing

- **A revoked token 404s**, deliberately. Unshare the report and the badge breaks — a badge that
  kept rendering would be advertising a claim nobody can check. It is not a soft "unavailable"
  image, because that would hide the revocation from the person who performed it.
- **Bands match the report exactly** — `≥75` green, `≥50` amber, else red; `≥90 EXCELLENT`,
  `≥75 GOOD`, `≥50 NEEDS WORK`, else `AT RISK`. Mirrored from `HealthScoreRing`
  (`src/components/document-cover.tsx`) and locked by a unit test, so the badge can never
  contradict the report it links to.
- **Cached 5 minutes** (`s-maxage=300`, `stale-while-revalidate=86400`) and read through the
  `pulse-report-<token>` cache tag the share route already revalidates, so unsharing takes effect
  promptly rather than after the TTL.
- **Out-of-range scores are clamped, not rejected.** A 500 on a client's page is worse than a
  rounded number.
- The `card`'s domain bars are the top four domains by scored weight, from
  `computeScoreBreakdown` — the same maths as the headline score.

---

## 3. Static vs animated — the one real gotcha

**Motion is off by default, and that is not conservatism.**

A CSS animation inside an `<img>` does not simply fail to apply when it cannot run. The browser
*starts* it and freezes the timeline at `t=0`, so an entrance animation renders its **hidden first
frame**. No `animation-fill-mode` fixes this: "frame 0" and "finished" are contradictory states by
definition.

That happens wherever a page is rasterised without ever being scrolled:

- a full-page screenshot where the badge is below the fold
- social / OG card renderers
- print-to-PDF

It was found here exactly that way — the Pulse badges rendered blank in a full-page screenshot
while the same files were perfect in isolation.

So:

- **Static** (default) — for someone else's site, a README, an email, anything you do not control.
- **Animated** (`-anim`, or `?motion=1`) — for Foundry's own surfaces, where a person scrolls the
  badge into view and the browser starts the timeline right then.

The two builds share one geometry: the static build is the animated one with the `<style>` block
removed. That is only safe because **every base style already equals the finished state** — the
`entrance()` helper in both `scripts/badge/generate.py` and `src/lib/badge/pulse-badge.ts` encodes
stagger in keyframe percentages rather than `animation-delay`, precisely so no resting state is
ever hidden. Keep that invariant. `prefers-reduced-motion` exercises it: `animation: none` must
leave a correct badge, which is why the reduced-motion block does nothing else.

---

## 4. Regenerating

```bash
pip install fonttools brotli uharfbuzz     # build-time only
python3 scripts/badge/generate.py
```

Writes `public/badge/*.svg` and `src/lib/badge/glyphs.ts`. **Both are committed** — nothing runs
Python at build or request time.

### Why the type is outlined

An SVG in an `<img>` is an isolated document: it cannot fetch a webfont and does not inherit the
host page's CSS. `font-family: 'DM Serif Display'` there silently falls back to whatever the viewer
has — and Georgia's numerals are old-style, so a score would render with a descending "9".

So type is outlined to paths, shaped through HarfBuzz for correct kerning, from the base64 woff2
already vendored for Deck (`vendor/bento/slides/src/foundry/fontdata.ts`). One copy of the brand
fonts in the repo, zero embedded font bytes in the output.

The dynamic route cannot shell out to Python, so it composes from a generated glyph table
(`src/lib/badge/glyphs.ts`, ~15KB): JetBrains Mono is strictly monospaced, so any label composes
from a fixed advance, and DM Serif carries digits only, which is all the score figure needs. The
table is **caps-only** — mono labels are uppercase per `DESIGN.md` anyway, and it halves the module.

A consequence worth knowing: the dynamic `card` sets its grade in mono where the static plate uses
Inter, because Inter is not in the table. If a badge ever needs mixed-case sans, extend
`MONO_CHARS` / add an Inter block in `generate.py` rather than reaching for `<text>`.
