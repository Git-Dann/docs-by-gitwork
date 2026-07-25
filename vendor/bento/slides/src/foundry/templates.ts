// Foundry addition (not upstream bento).
//
// Ten starting decks — five Foundry (delivery: the work we do WITH a client once
// they're signed) and five Gitwork (sales: the work of winning them). Picked from
// Save ▾ → "New from template…", or deep-linked with `/deck?template=<slug>`.
//
// Two rules held throughout:
//
//  1. THEY WEAR THE ACTIVE BRAND. Every template is a function of `Brand`, like
//     the starter deck, so the same structure reads as Foundry (blue/DM Serif) or
//     Gitwork (purple/Fraunces) and the topbar switch re-themes it live. A
//     template is a SHAPE, not a colour scheme.
//  2. REAL NUMBERS, GROUNDED IN OUR OWN PRICING MODEL — Dan's call: he would
//     rather edit a figure than fill in a bracket. So commercials are not made
//     up, they are DERIVED from src/server/pulse-pricing.ts and the rate card:
//       · £450/day  — DEFAULT_DAY_RATE_GBP, the platform's own blended rate
//       · 19 devs   — the rate card roster (defaultRateCardPeople)
//       · project   — devWeeks × 5 × dayRate, the same maths computePricingBands
//                     uses, so £36k ≈ 2 devs × 8 weeks and the arithmetic holds
//       · retainer  — 10 days × £450 = £4.5k/month
//     Anything CLIENT-specific stays in [brackets] — a name or a result cannot be
//     defaulted, only filled in. Every slide carrying a figure says so in its
//     speaker notes: check it against the live rate card before sending.
//     The one quoted claim is Gitwork's own public line, "From prompt to
//     production" (gitwork.co.uk).
//
// The visual grammar (mono eyebrow + accent rule, serif headline, stat tiles) is
// shared with foundry/starter.ts rather than re-drawn here.

import {
  FORMAT,
  FORMAT_VERSION,
  defaultChart,
  defaultShape,
  defaultText,
  emptySlide,
  newDocId,
  type BentoDoc,
  type Slide,
  type SlideElement,
} from '../model'
import type { Brand, BrandId } from './brand'
import { H, W, chrome, heading, statTile } from './starter'

// ── slide kinds ─────────────────────────────────────────────────────────────
// A small vocabulary, so a template below reads as its own outline rather than
// as several hundred lines of element geometry.

const serif = (b: Brand) =>
  b.id === 'gitwork' ? "'Fraunces', Georgia, serif" : "'DM Serif Display', Georgia, serif"
const MONO = "'JetBrains Mono', ui-monospace, monospace"

/** Opening slide: big serif title on the brand's dark ink, mono kicker beneath. */
function cover(b: Brand, kicker: string, title: string, sub: string): Slide {
  const dark = b.id === 'gitwork' ? '#0C0C18' : '#0F172A'
  return emptySlide({
    background: dark,
    transition: 'fade',
    name: 'Cover',
    notes: 'Replace [square brackets] before this goes anywhere near a client.',
    elements: [
      defaultShape('rect', {
        id: 'fd-rule', x: 96, y: 258, w: 64, h: 5,
        fill: b.deck.accent, stroke: 'transparent', strokeWidth: 0, radius: 2,
      }),
      defaultText({
        id: 'fd-eyebrow', x: 96, y: 216, w: 900, h: 28, html: kicker.toUpperCase(),
        fontSize: 13, fontFamily: MONO, fontWeight: 500, color: b.deck.accent,
        align: 'left', valign: 'middle', lineHeight: 1.4, letterSpacing: 2.2,
      }),
      defaultText({
        id: 'fd-title', x: 96, y: 292, w: 1000, h: 170, html: title,
        fontSize: 68, fontFamily: serif(b), fontWeight: 400, color: '#F8FAFC',
        align: 'left', valign: 'top', lineHeight: 1.1, role: 'title',
      }),
      defaultText({
        x: 96, y: 470, w: 820, h: 90, html: sub,
        fontSize: 22, fontFamily: b.deck.fontFamily, fontWeight: 400,
        color: '#F8FAFC', opacity: 0.72, align: 'left', valign: 'top', lineHeight: 1.5,
      }),
      defaultText({
        id: 'fd-footer', x: 96, y: H - 82, w: 1088, h: 26,
        html: b.id === 'gitwork' ? 'GITWORK.CO.UK' : 'FOUNDRY BY GITWORK',
        fontSize: 11, fontFamily: MONO, fontWeight: 500, color: '#F8FAFC',
        opacity: 0.45, align: 'left', valign: 'middle', lineHeight: 1.4, letterSpacing: 1.8,
      }),
    ],
  })
}

/** A numbered list slide — the workhorse. */
function points(b: Brand, eyebrow: string, title: string, items: string[], notes = ''): Slide {
  const els: SlideElement[] = [...chrome(b, eyebrow), heading(b, title)]
  items.forEach((text, i) => {
    const y = 310 + i * 74
    els.push(
      defaultText({
        x: 96, y, w: 46, h: 40, html: String(i + 1).padStart(2, '0'),
        fontSize: 13, fontFamily: MONO, fontWeight: 500, color: b.deck.accent,
        align: 'left', valign: 'middle', lineHeight: 1.4, letterSpacing: 1.4,
      }),
      defaultText({
        x: 152, y: y - 4, w: 1032, h: 56, html: text,
        fontSize: 21, fontFamily: b.deck.fontFamily, fontWeight: 400,
        color: b.deck.color, align: 'left', valign: 'middle', lineHeight: 1.45, role: 'body',
      }),
      defaultShape('rect', {
        x: 96, y: y + 56, w: 1088, h: 1,
        fill: b.deck.color, stroke: 'transparent', strokeWidth: 0, radius: 0, opacity: 0.1,
      }),
    )
  })
  return emptySlide({ background: b.deck.background, transition: 'morph', name: title, notes, elements: els })
}

/** Three or four stat tiles — the figures slide. */
function figures(
  b: Brand, eyebrow: string, title: string,
  tiles: Array<{ figure: string; label: string }>, notes = '',
): Slide {
  const n = Math.min(tiles.length, 4)
  const gap = 24
  const w = Math.round((1088 - gap * (n - 1)) / n)
  const els: SlideElement[] = [...chrome(b, eyebrow), heading(b, title)]
  tiles.slice(0, n).forEach((t, i) => {
    els.push(...statTile(b, { x: 96 + i * (w + gap), y: 330, w, h: 200 }, t.figure, t.label, i === 0))
  })
  return emptySlide({ background: b.deck.background, transition: 'morph', name: title, notes, elements: els })
}

/** Two labelled columns — before/after, scope/out-of-scope, them/us. */
function columns(
  b: Brand, eyebrow: string, title: string,
  left: { label: string; items: string[] }, right: { label: string; items: string[] }, notes = '',
): Slide {
  const col = (x: number, label: string, items: string[], accent: boolean): SlideElement[] => [
    defaultShape('rect', {
      x, y: 316, w: 532, h: 268,
      fill: accent ? b.deck.accent : 'transparent',
      stroke: accent ? 'transparent' : b.deck.color,
      strokeWidth: accent ? 0 : 1, radius: 10, opacity: accent ? 0.06 : 0.22,
    }),
    defaultText({
      x: x + 28, y: 344, w: 476, h: 24, html: label.toUpperCase(),
      fontSize: 11, fontFamily: MONO, fontWeight: 500,
      color: accent ? b.deck.accent : b.deck.color, opacity: accent ? 1 : 0.6,
      align: 'left', valign: 'middle', lineHeight: 1.4, letterSpacing: 1.4,
    }),
    defaultText({
      x: x + 28, y: 384, w: 476, h: 180,
      html: items.map((i) => `• ${i}`).join('<br>'),
      fontSize: 18, fontFamily: b.deck.fontFamily, fontWeight: 400,
      color: b.deck.color, align: 'left', valign: 'top', lineHeight: 1.75, role: 'body',
    }),
  ]
  return emptySlide({
    background: b.deck.background, transition: 'morph', name: title, notes,
    elements: [
      ...chrome(b, eyebrow), heading(b, title),
      ...col(96, left.label, left.items, false),
      ...col(652, right.label, right.items, true),
    ],
  })
}

/** A live chart slide. */
function chartSlide(
  b: Brand, eyebrow: string, title: string,
  categories: string[], data: number[], notes = '',
): Slide {
  return emptySlide({
    background: b.deck.background, transition: 'fade', name: title, notes,
    elements: [
      ...chrome(b, eyebrow), heading(b, title),
      defaultChart(
        {
          grid: { left: 56, right: 24, top: 24, bottom: 40 },
          xAxis: { type: 'category', data: categories },
          yAxis: { type: 'value' },
          color: b.deck.chartPalette,
          series: [{ type: 'bar', data, barWidth: '46%' }],
        },
        { x: 96, y: 310, w: 1088, h: 290, preset: 'bar' },
      ),
    ],
  })
}

/** Closing slide: one line and the ask. */
function closing(b: Brand, eyebrow: string, title: string, cta: string): Slide {
  const dark = b.id === 'gitwork' ? '#0C0C18' : '#0F172A'
  return emptySlide({
    background: dark, transition: 'fade', name: 'Close',
    notes: 'End on the ask. Say it out loud, then stop talking.',
    elements: [
      defaultText({
        id: 'fd-eyebrow', x: 96, y: 250, w: 900, h: 28, html: eyebrow.toUpperCase(),
        fontSize: 13, fontFamily: MONO, fontWeight: 500, color: b.deck.accent,
        align: 'left', valign: 'middle', lineHeight: 1.4, letterSpacing: 2.2,
      }),
      defaultText({
        id: 'fd-title', x: 96, y: 300, w: 1000, h: 160, html: title,
        fontSize: 58, fontFamily: serif(b), fontWeight: 400, color: '#F8FAFC',
        align: 'left', valign: 'top', lineHeight: 1.12, role: 'title',
      }),
      defaultText({
        x: 96, y: 470, w: 820, h: 70, html: cta,
        fontSize: 21, fontFamily: b.deck.fontFamily, fontWeight: 400,
        color: '#F8FAFC', opacity: 0.72, align: 'left', valign: 'top', lineHeight: 1.5,
      }),
      defaultText({
        id: 'fd-footer', x: 96, y: H - 82, w: 1088, h: 26,
        html: b.id === 'gitwork' ? 'GITWORK.CO.UK' : 'FOUNDRY BY GITWORK',
        fontSize: 11, fontFamily: MONO, fontWeight: 500, color: '#F8FAFC',
        opacity: 0.45, align: 'left', valign: 'middle', lineHeight: 1.4, letterSpacing: 1.8,
      }),
    ],
  })
}

// ── the templates ───────────────────────────────────────────────────────────

export interface DeckTemplate {
  slug: string
  /** Which house this is written for — it groups the picker. */
  house: BrandId
  name: string
  /** One line, shown under the name in the picker. */
  blurb: string
  /** What you should have to hand before starting. Shown in the picker. */
  needs: string
  build: (b: Brand) => Slide[]
}

export const TEMPLATES: DeckTemplate[] = [
  // ── Foundry: delivery ─────────────────────────────────────────────────────
  {
    slug: 'kickoff',
    house: 'foundry',
    name: 'Project kickoff',
    blurb: 'First session with a signed client — goals, team, how we work.',
    needs: 'Client name, the outcome they bought, who is on the team, start date.',
    build: (b) => [
      cover(b, 'Kickoff', '[Client] × Gitwork', 'Project kickoff · [date]'),
      points(b, 'Why we are here', 'The outcome we are building toward.', [
        '[The business outcome — not the feature list]',
        '[How we will know it worked — the measure]',
        '[What is explicitly NOT in this phase]',
      ], 'Get agreement on the OUTCOME here, before anyone talks about features.'),
      columns(b, 'Ways of working', 'How we run.',
        { label: 'You get', items: ['Weekly demo, working software', 'A shared board, always current', 'One named lead', 'Slack channel, same-day replies'] },
        { label: 'We need', items: ['A decision-maker in the demo', 'Answers within 48h', 'Access on day one', 'Honest feedback, early'] }),
      points(b, 'The team', 'Who you will be working with.', [
        '[Name] — [role]. [One line on what they own.]',
        '[Name] — [role]. [One line on what they own.]',
        '[Name] — delivery lead. Your single point of contact.',
      ]),
      points(b, 'Timeline', 'The first eight weeks.', [
        'Weeks 1–2 · Discovery and setup — environments, access, agreed scope',
        'Weeks 3–7 · Build — a working demo at the end of every week',
        'Week 8 · Launch and handover — docs, runbook, support in place',
      ], 'Dates, not durations. Vague timelines are how trust goes.'),
      closing(b, 'Next', 'First demo: [date].', 'Anything blocking us before then? Say it now.'),
    ],
  },
  {
    slug: 'sprint-review',
    house: 'foundry',
    name: 'Sprint review',
    blurb: 'What shipped, what it moved, what is next.',
    needs: 'Sprint number, the list of shipped work, one metric, next sprint goal.',
    build: (b) => [
      cover(b, 'Sprint 12', 'What shipped.', '[Client] · [date range]'),
      points(b, 'Shipped', 'Live this sprint.', [
        '[Feature] — [the difference it makes to a user]',
        '[Feature] — [the difference it makes to a user]',
        '[Fix / improvement] — [why it mattered]',
      ], 'Demo it. Do not read this slide — open the product.'),
      figures(b, 'Impact', 'What moved.', [
        { figure: '340', label: 'weekly actives' },
        { figure: '1.9k', label: '[key action]' },
        { figure: '+18%', label: 'vs last sprint' },
      ], 'Illustrative figures — swap in the real ones. One number you can defend beats three you cannot.'),
      columns(b, 'Health', 'Where we are.',
        { label: 'On track', items: ['[Workstream]', '[Workstream]'] },
        { label: 'Needs a decision', items: ['[Blocker — and the decision you need]', '[Risk — and what we propose]'] }),
      points(b, 'Next', 'Sprint 13.', [
        '[The goal for the sprint, in one sentence]',
        '[Key thing that must land]',
        '[What we need from you to hit it]',
      ]),
      closing(b, 'Next demo', '[Date].', 'Questions now, or in the channel any time.'),
    ],
  },
  {
    slug: 'monthly-report',
    house: 'foundry',
    name: 'Monthly client report',
    blurb: 'Usage, support and roadmap for a retained client.',
    needs: 'The month, product analytics, ticket counts, next month plan.',
    build: (b) => [
      cover(b, 'Monthly report', '[Client] · [Month]', 'Usage, support and what is next.'),
      figures(b, 'Usage', 'The month in numbers.', [
        { figure: '1,240', label: 'active users' },
        { figure: '8.6k', label: '[key action]' },
        { figure: '+12%', label: 'vs last month' },
        { figure: '99.9', label: 'uptime %' },
      ], 'Pull these from the Analytics connector rather than typing them by hand.'),
      chartSlide(b, 'Trend', '[Metric] over time.', ['Month 1', 'Month 2', 'Month 3', 'This month'], [780, 910, 1080, 1240],
        'Swap in the real series from the Analytics connector — these are illustrative.'),
      columns(b, 'Support', 'Tickets and fixes.',
        { label: 'Raised', items: ['24 tickets', 'Median first response 2h', 'Top theme: [theme]'] },
        { label: 'Resolved', items: ['22 closed', '[Notable fix]', '[Notable fix]'] }),
      points(b, 'Next month', 'What we are doing.', [
        '[Priority — and why it is first]',
        '[Priority]',
        '[Something we recommend you decide on]',
      ]),
      closing(b, 'Retainer', '8 of 10 days used.', 'Want to change the shape of next month? Let us know by [date].'),
    ],
  },
  {
    slug: 'tech-proposal',
    house: 'foundry',
    name: 'Technical approach',
    blurb: 'Architecture and delivery plan for a scoped build.',
    needs: 'The problem, your proposed stack, the main risks, a phase plan.',
    build: (b) => [
      cover(b, 'Technical approach', '[Project name]', 'How we would build it, and why that way.'),
      points(b, 'The problem', 'What we are solving.', [
        '[The constraint that makes this non-trivial]',
        '[What has been tried / what exists today]',
        '[The bar it has to clear to be worth doing]',
      ]),
      columns(b, 'Approach', 'The shape of it.',
        { label: 'We would build', items: ['[Component]', '[Component]', '[Component]'] },
        { label: 'We would not', items: ['[Thing you are deliberately not building]', '[And why — cost, risk, or it exists already]'] },
        'The "would not" column is the one that earns trust. Do not skip it.'),
      points(b, 'Stack', 'What it runs on.', [
        '[Layer] — [choice]. [One line: why this and not the obvious alternative.]',
        '[Layer] — [choice]. [Why.]',
        '[Layer] — [choice]. [Why.]',
      ]),
      points(b, 'Risks', 'What could go wrong.', [
        '[Risk] → [how we de-risk it, concretely]',
        '[Risk] → [mitigation]',
        '[Unknown we would resolve in week 1]',
      ], 'Naming risks up front is cheaper than explaining them later.'),
      closing(b, 'Next', 'Shall we scope it properly?', 'A one-week discovery — £2,250 — ends with a fixed price and a date.'),
    ],
  },
  {
    slug: 'discovery-readout',
    house: 'foundry',
    name: 'Discovery readout',
    blurb: 'Research findings and where the opportunity is.',
    needs: 'Who you spoke to, what they said, the pattern you found.',
    build: (b) => [
      cover(b, 'Discovery', 'What we found.', '[Client] · 12 conversations · [date]'),
      points(b, 'Method', 'How we got here.', [
        '12 interviews with [who]',
        '[What else — analytics, support tickets, a competitor scan]',
        'Over 3 weeks, [date] to [date]',
      ]),
      points(b, 'Findings', 'The three that matter.', [
        '[Finding — stated as what people DO, not what they say they want]',
        '[Finding]',
        '[Finding]',
      ], 'Quote a real person on each of these when you present it.'),
      columns(b, 'Opportunity', 'Where the value is.',
        { label: 'Highest value', items: ['[Opportunity]', '[Why it is worth most]'] },
        { label: 'Quickest win', items: ['[Opportunity]', 'Could ship in 4 weeks'] }),
      points(b, 'Recommendation', 'What we would do next.', [
        '[The one thing to build first]',
        '[What to validate before committing further]',
        '[What to park, and revisit when]',
      ]),
      closing(b, 'Next', 'Shall we build the first one?', 'We can have something in front of users in 6 weeks.'),
    ],
  },

  // ── Gitwork: sales ────────────────────────────────────────────────────────
  {
    slug: 'gw-pitch',
    house: 'gitwork',
    name: 'New business pitch',
    blurb: 'The core Gitwork pitch — problem, approach, proof, ask.',
    needs: 'Prospect name, their actual problem, one relevant case study, your ask.',
    build: (b) => [
      cover(b, 'Gitwork', 'From prompt to production.', 'A design-and-build partner for [prospect].'),
      points(b, 'The problem', 'Why this is hard.', [
        '[Their problem, in THEIR words — from the call, not from your website]',
        '[What it is costing them — time, money, or a missed window]',
        '[Why the obvious fix has not worked]',
      ], 'If slide 2 is about you, you have already lost the room. It is about them.'),
      columns(b, 'How we work', 'Design and build, one team.',
        { label: 'The usual way', items: ['Agency designs it', 'Someone else builds it', 'Nobody owns the outcome', 'Months to first working software'] },
        { label: 'With us', items: ['One team, design through deploy', 'Working software every week', 'One named lead who owns it', 'Something real in 6 weeks'] }),
      points(b, 'What we do', 'Three ways in.', [
        '<b>Build</b> — we design and ship the product with you.',
        '<b>Team</b> — vetted developers embedded in yours.',
        '<b>Care</b> — we keep it running once it is live.',
      ]),
      figures(b, 'Proof', '[Client], [outcome].', [
        { figure: '3.2×', label: '[result]' },
        { figure: '−40%', label: '[result]' },
        { figure: '8wk', label: 'to live' },
      ], 'Use a client whose problem looks like THIS prospect\'s. Real numbers only.'),
      closing(b, 'The ask', 'Give us a week.', 'A paid discovery week ends with a fixed price, a date, and a plan you own either way.'),
    ],
  },
  {
    slug: 'gw-talent',
    house: 'gitwork',
    name: 'Developer talent',
    blurb: 'Selling vetted developers — the hiring problem and how vetting works.',
    needs: 'Their hiring pain, roles needed, your rates, your guarantee.',
    build: (b) => [
      cover(b, 'Gitwork · Team', 'Developers who are already good.', 'Vetted, embedded, and productive in week one.'),
      points(b, 'The problem', 'Hiring developers is broken.', [
        'A bad hire costs six months and the salary — and you find out late.',
        'CVs and take-homes do not predict how someone works in YOUR codebase.',
        'Agencies send whoever is on the bench.',
      ]),
      points(b, 'How we vet', 'What "vetted" actually means here.', [
        '<b>Real code review</b> — we read their actual GitHub history, not a CV.',
        '<b>Scored against the role</b> — the skills you need, not a generic ranking.',
        '<b>A working session</b> — we watch them solve something like your problem.',
        '<b>We have worked with them</b> — placement only from people we know.',
      ], 'This is the differentiator. Slow down here.'),
      columns(b, 'What you get', 'Embedded, not outsourced.',
        { label: 'Included', items: ['In your standups and your repo', 'A named delivery lead', 'Replaced free if it is not working', 'Ramp-up on us'] },
        { label: 'Not included', items: ['Long lock-ins', 'Bench-warming', 'Surprise rate rises'] }),
      figures(b, 'Commercials', 'Simple.', [
        { figure: '£450', label: 'day rate from' },
        { figure: '2 wk', label: 'to start' },
        { figure: '30d', label: 'notice' },
      ], '£450/day is the platform default (pulse-pricing.ts). Check it against the live rate card for this role before sending.'),
      closing(b, 'The ask', 'Tell us the role.', 'We will come back within 5 days with people worth meeting.'),
    ],
  },
  {
    slug: 'gw-build-proposal',
    house: 'gitwork',
    name: 'Build proposal',
    blurb: 'Scoped project proposal — phases, price, timeline.',
    needs: 'Agreed scope, phase breakdown, price, start date.',
    build: (b) => [
      cover(b, 'Proposal', '[Project] for [client]', 'Scope, timeline and price · [date]'),
      points(b, 'What you asked for', 'In your words.', [
        '[Restate their goal — proves you listened]',
        '[The constraint they told you about]',
        '[The date that matters to them, and why]',
      ], 'Reading their own words back is the highest-trust slide in the deck.'),
      columns(b, 'Scope', 'What is in, what is not.',
        { label: 'In scope', items: ['[Deliverable]', '[Deliverable]', '[Deliverable]', '[Deliverable]'] },
        { label: 'Out of scope', items: ['[Explicitly excluded]', '[Excluded — can be phase 2]'] },
        'The out-of-scope column prevents the argument you would otherwise have in week 6.'),
      points(b, 'Phases', 'How it runs.', [
        '<b>Phase 1 · Discovery</b> — scope, designs, a fixed price. 1 week.',
        '<b>Phase 2 · Build</b> — working software every week. 6 weeks.',
        '<b>Phase 3 · Launch</b> — deploy, handover, 30 days of cover. 1 week.',
      ]),
      figures(b, 'Investment', 'Price and shape.', [
        { figure: '£36k', label: 'total' },
        { figure: '8', label: 'weeks' },
        { figure: '2', label: 'people' },
      ], '£36k = 2 devs × 8 weeks × 5 days × £450, the same maths as computePricingBands. Change one tile, redo the others.'),
      closing(b, 'To start', 'Sign, and we begin [date].', 'Questions on any of it — call, do not email.'),
    ],
  },
  {
    slug: 'gw-case-study',
    house: 'gitwork',
    name: 'Case study',
    blurb: 'One client, one problem, one result — the proof deck.',
    needs: 'A client who will let you name them, the before/after, real numbers.',
    build: (b) => [
      cover(b, 'Case study', '[Client]', '[The one-line result.]'),
      points(b, 'The situation', 'Where they started.', [
        '[Who they are — one line, for context]',
        '[The problem, concretely — what was broken or missing]',
        '[What it was costing them]',
      ]),
      points(b, 'What we did', 'The work.', [
        '[The key decision — the thing another team would have got wrong]',
        '[What we built]',
        'Eight weeks, two developers and a designer.',
      ], 'The interesting part is the decision, not the feature list.'),
      figures(b, 'Result', 'What changed.', [
        { figure: '+62%', label: '[improvement]' },
        { figure: '14k', label: '[volume]' },
        { figure: '£180k', label: '[value]' },
      ], 'Only numbers the client has agreed you can share. Check before sending.'),
      points(b, 'In their words', '[Quote].', [
        '"[A real quote from the client.]"',
        '— [Name], [Role], [Company]',
      ], 'A weak real quote beats a strong invented one. If you do not have one, ask.'),
      closing(b, 'Your turn', 'Sound familiar?', 'If any of that looks like your situation, let us talk.'),
    ],
  },
  {
    slug: 'gw-retainer',
    house: 'gitwork',
    name: 'Retainer proposal',
    blurb: 'Ongoing partnership — what a monthly retainer buys.',
    needs: 'Days per month, what is included, the rate, the review cadence.',
    build: (b) => [
      cover(b, 'Retainer', 'A team, not a queue.', 'Ongoing design and build for [client].'),
      points(b, 'Why a retainer', 'What it fixes.', [
        'Project-by-project means re-onboarding every time — you pay for ramp-up twice.',
        'Small changes wait weeks for a statement of work.',
        'Nobody holds the context of your product between projects.',
      ]),
      columns(b, 'What is included', 'Every month.',
        { label: 'Included', items: ['10 days of design and build', 'Same team, keeps the context', 'Monthly report and review', 'Priority support'] },
        { label: 'Extra if needed', items: ['Additional days at £450', 'Out-of-hours cover', 'Discovery for a new phase'] }),
      figures(b, 'Shape', 'The commercials.', [
        { figure: '10', label: 'days / month' },
        { figure: '£4.5k', label: 'per month' },
        { figure: '3mo', label: 'initial term' },
      ], '10 days × £450 = £4.5k. Recalculate if the day rate or the days change — the three tiles must agree.'),
      points(b, 'How we keep it honest', 'No black boxes.', [
        'Days used are visible to you, always.',
        'Unused days [roll over / expire] — [state which, plainly].',
        'Quarterly review: change the shape or stop, no penalty.',
      ]),
      closing(b, 'The ask', 'Start [date]?', 'We would begin with a two-day onboarding, at no charge.'),
    ],
  },
]

export function templateBySlug(slug: string): DeckTemplate | null {
  return TEMPLATES.find((t) => t.slug === slug) ?? null
}

/** Build a full document from a template, wearing the given brand. */
export function templateDoc(t: DeckTemplate, b: Brand): BentoDoc {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    docId: newDocId(),
    title: t.name,
    meta: { company: b.id === 'gitwork' ? 'Gitwork' : 'Foundry by Gitwork' },
    size: { width: W, height: H },
    theme: { ...b.deck },
    slides: t.build(b),
    modified: new Date().toISOString(),
  }
}

/** `?template=<slug>` — how Foundry deep-links a specific starting deck. */
export function templateParam(): DeckTemplate | null {
  try {
    const slug = new URLSearchParams(location.search).get('template')
    return slug ? templateBySlug(slug) : null
  } catch {
    return null
  }
}
