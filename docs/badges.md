# Badges — "Foundry Approved" and the Pulse score

Three families of embeddable SVG mark:

- **Foundry Approved** — static art in `public/badge/`, for work Gitwork has built or audited.
- **Pulse score** — generated per request from a real scan at `/api/badge/pulse/[token]`.
- **Countermark** — the embeddable face of an Provenance attestation, at
  `/api/badge/countermark/[token]`. See `docs/provenance.md` for the product itself.

**Install one from Settings → Labs → Badge studio.** Pick a mark, set the ground it will sit
on, and copy the snippet. For a Pulse badge the studio also picks the scan and, if the report
isn't shared yet, shares it for you — that is what mints the token the badge needs.

Both are single self-contained SVG files. They fetch nothing, run no script, and carry the brand
type as outlined paths, so they render identically in an `<img>`, a README, an email, a PDF and a
social card.

---

## 0. Names

Every mark has a **permanent code**. Use it — in a review, in Slack, in a commit — rather than
describing the artwork. `src/lib/badge/catalog.ts` is the source of truth and a unit test keeps
it honest against what is actually committed.

| Code | Name | Code | Name |
|---|---|---|---|
| `FA-01` | The Seal | `PS-01` | Score shield |
| `FA-02` | Instrument plate | `PS-02` | Score ring |
| `FA-03` | Certificate lockup | `PS-03` | Score bar |
| `FA-04` | Shield | `PS-04` | Score card |
| `FA-05` | Monogram | | |
| `CM-01` | Mark shield | `CM-03` | Certificate card |
| `CM-02` | Validity disc | | |

Codes are permanent. Retiring a mark retires its code with it — never reuse a number, or a stale
reference resolves to the wrong thing instead of failing.

## 1. Foundry Approved

Five options, all committed under `public/badge/`. Pick per placement; they are not ranked.

| Code | File stem | What it is | Size | Use it for |
|---|---|---|---|---|
| `FA-01` | `foundry-approved-seal` | Circular stamp, rotating legend, drawn tick | 160×160 | The hero mark. Client site footer, case study, proposal cover |
| `FA-02` | `foundry-approved-plate` | The house `01 // WIDGET NAME` widget card | 268×132 | Anywhere it sits beside other Foundry UI — a dashboard, a report |
| `FA-03` | `foundry-approved-lockup` | Horizontal certificate lockup | auto×72 | A site footer with room for a sentence |
| `FA-04` | `foundry-approved-shield` | shields.io-proportioned inline bar | auto×22 | READMEs, docs, a footer line beside other badges |
| `FA-05` | `foundry-approved-monogram` | Square mark, Foundry "F" + tick lozenge | 56×56 | Avatar / favicon scale, a compact trust chip |

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

| Code | Style | Size | Shows |
|---|---|---|---|
| `PS-01` | `shield` | auto×22 | `PULSE 92/100`, colour-banded, pulse-trace glyph |
| `PS-02` | `ring` | 152×184 | Score ring + grade + `GITWORK PULSE` caption |
| `PS-03` | `bar` | 320×62 | Slim footer readout — score, grade, progress track |
| `PS-04` | `card` | 300×200 | Full widget card: ring, project, top four domain bars, VIEW REPORT |

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

## 2b. Countermark

`GET /api/badge/countermark/<token>[.svg]` — public, no API key. `<token>` is the
`Countermark.token` that serves `/countermark/<token>`, so the badge is exactly as public as the
certificate and shows strictly less.

`?style=shield|disc|card` · `?theme=light|dark` · `?motion=1`

| Code | Style | Size | Shows |
|---|---|---|---|
| `CM-01` | `shield` | auto×22 | `COUNTERMARK · CERTIFIED`, or the status word once it stops asserting |
| `CM-02` | `disc` | 152×184 | A ring burning down the validity window, days left in the middle |
| `CM-03` | `card` | 300×200 | Grade, subject, standard, seal state, link to verify |

### Three rules the renderer enforces, and why

Provenance exists because an unverifiable claim about software is worth nothing, and a badge is the
most likely place for such a claim to get overstated. So:

1. **Validity dominates grade.** A LAPSED, REVOKED or SUPERSEDED mark asserts nothing, so it
   never leads with its grade — it leads with the status word, muted, and the shield is struck
   through. A badge still reading CERTIFIED three months after expiry is the exact failure the
   product prevents.
2. **INCOMPLETE is not NOT_CERTIFIED.** "We could not establish this" and "this is provably
   broken" never share a colour — INCOMPLETE is neutral, NOT_CERTIFIED is danger. Same rule as
   `CLAUDE.md` §35.
3. **An unsealed mark says so.** With no `ASSAY_SIGNING_SECRET` configured the certificate cannot
   be verified, so the badge carries an UNSEALED marker instead of passing for a signed one.

Each rule has unit tests named after it.

### It is cached for 60 seconds, not 5 minutes

Unlike the Pulse badge, this one is **time-dependent**: it renders days remaining and flips
VALID → EXPIRING → LAPSED on its own, with no write to invalidate against. `max-age=60,
must-revalidate`, and deliberately no `s-maxage` — a CDN holding a lapsed mark as certified is
the failure mode that matters.

A revoked mark keeps resolving and says REVOKED rather than 404ing. That is Provenance's behaviour and
is preserved here: someone handed a mark needs to discover it was withdrawn, not get a 404 they
might read as a mistake.

---

## 2a. Embed with `<img>`, not by pasting the SVG inline

Every badge is authored assuming it is **its own document**, which is what `<img src="…">` gives
it. Pasting the SVG source straight into a page breaks that assumption twice over, and both
failures are silent:

- **`id` collisions.** Badges carry internal ids (`#c` clip path, `#sh`/`#g`/`#mg` gradients). Two
  inlined badges on one page means every `url(#c)` resolves to the *first* `#c` in the document, so
  the second badge picks up the first one's clip and gradients.
- **class collisions.** Animation targets are plain class names — `mark`, `ring`, `bar`, `fig`,
  `tick`, `dot`. A host page with its own `.mark` or `.bar` rule will restyle the badge's insides,
  and a host script doing `querySelectorAll(".mark")` will match `<g>` elements inside the badge.
  (This is not hypothetical — it bit the showcase page built for these badges, where a card class
  and a badge's internal class shared a name.)

If a surface genuinely needs inline SVG — a React component, an email template — namespace the ids
and scope the selectors at the point of inlining. Everywhere else, use `<img>`.

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
