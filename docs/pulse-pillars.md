# Pulse pillars — six subscores, published weights

> The rollup a client reads. `src/server/pulse-checks/pillars.ts` is the implementation;
> this is the part that has to survive being screenshotted into someone else's deck.

---

## Why six numbers on top of 1,645 checks

Pulse grades **1,645 checks across 28 categories in 12 domains**. That is a better measurement
than any competitor's six-bucket rollup, and a worse conversation: a client opens the report,
sees one number and then a wall, and has no answer to *"which part of this is the problem?"*

Pillars add the conversation without giving up the measurement. They are a **presentation
rollup over the same checks the health score already uses** — not a second scoring system, and
not a second place to add checks.

## The six

| Pillar | Weight | The question it answers |
|---|---:|---|
| **Security & secrets** | 30 | Can someone take something that isn't theirs? |
| **Access & data** | 15 | Does the right person see the right data, and can they pay you? |
| **Code & maintainability** | 15 | Can the next developer change this safely? |
| **Reliability & performance** | 15 | Does it stay up, stay fast, and tell you when it doesn't? |
| **Legal & compliance** | 15 | Can this ship in the markets it targets? |
| **Experience & reach** | 10 | Can people find it, use it, and trust it? |

The weights are a **judgement**, and they are published so they can be argued with rather than
buried in a formula:

- **Security dominates** because its failures are unbounded. A leaked key or an injectable query
  costs the client their users' data, not a conversion point.
- **Access control is separated from security** rather than folded into it, because "who can see
  what" fails differently and is fixed by different people — product decisions, not a dependency
  bump.
- **Experience carries the most categories and the least weight**, on purpose. It is the widest
  surface and the most recoverable: a missing OG tag is a morning's work, an exposed database is
  an incident.

## Three properties that make it honest

**1. Nothing is hand-maintained.** Every category is assigned to exactly one pillar, and a test
fails if a category is missing or double-assigned. Add a category to `categories.ts` and the
compiler sends you here.

**2. Weight is redistributed, never assumed.** A pillar with no applicable checks — an iOS app
has no SEO checks, a CLI has no accessibility checks — is **dropped, and its weight shared across
the pillars that did apply**. Scoring it on nothing, or scoring it zero, is the "we could not
look" → "it is not there" inversion this codebase keeps finding. A dropped pillar is **named** in
the report, with its points explicitly accounted for.

That is why the report shows the **effective** weight, not the published one: it is the weight
that actually produced the number on screen.

**3. It reuses score v3 directly.** `computePillarBreakdown` delegates every check to
`computeScoreBreakdown`, so severity, evidence strength, confidence, correlation damping, unknown
states and score eligibility are evaluated once. A pillar total that disagreed with the headline
would be worse than no rollup at all.

## Where they appear

- **The report** — `NN // WHERE IT STANDS`, on the **Overview** tab, directly under the headline
  score. That is where the reader asks "which part of this is the problem?", which is the question
  the rollup exists to answer; on the Checks tab it would have sat above the wall it is meant to
  save you reading.

  Derived at render, never stored: it describes the checks on that page, so a snapshot would be
  correct exactly once. (The opposite call from a Countermark, which freezes because it records
  what was true at a moment.)
- **The Pulse badge**, `?style=card` — the top four by published weight.

  The badge previously rolled the 12 report domains up and took the top four *by weight*, so
  which dimensions it showed varied between clients, and between two scans of the same client as
  check counts moved. A mark someone puts in their own footer has to mean the same thing every
  time it renders.

## Changing a weight

Weights are quoted to clients and screenshotted into decks, so treat a change as a published
revision, not a tweak:

1. Change it in `PILLARS` (`pillars.ts`). The sum must stay 100 — a test enforces it.
2. Update the table above, **and the rationale** — a weight without a stated reason is the thing
   this document exists to avoid.
3. Expect existing reports to re-render at different pillar scores. The headline health score is
   unaffected: pillars are a rollup of it, never an input to it.
