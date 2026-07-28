# Three product concepts — and the one to build

> Companion to [`00-research.md`](00-research.md), which holds the evidence and the sourcing.
> This document is for deciding. It sets out three products Gitwork could build outside Foundry,
> at enough depth to argue with, and recommends one.
>
> All three are **standalone SaaS**: their own brand, sold direct, not tied to Foundry and not
> requiring the buyer to be a Gitwork client. Gitwork's existing client book is distribution and a
> design partner pool, not a dependency.

---

## The one-paragraph version

The last eighteen months built the buyer's half of a handshake — AP2, Visa TAP, Mastercard
Verifiable Intent all let a customer's AI agent carry cryptographic proof of what it's allowed to
buy. **Nobody built the seller's half.** There is no way for a business to state, in a form a
machine can verify and rely on, what it is willing to be bound to. That's fine for Shopify, whose
merchants have a catalog of fixed prices. It is useless for the majority of the small business
economy, which sells *work* at a *quote*. And the reason nobody has fixed it is that a
machine-issued quote is legally binding on the business, which since 9 March 2026 the CMA holds
liable at up to 10% of worldwide turnover — even when a third party built the agent. **The missing
product is not a data feed. It's a bounded, provable, expiring commitment.** That is concept A, and
it's the one to build.

---

# Concept A — **Standing**

### *The seller-side mandate*

> **Name.** From *standing offer* — the legal term for an offer held open for acceptance, which is
> exactly the primitive being productised. It also carries "in good standing". Alternates if it
> doesn't land: **Warrant** (an authority to act), **Kerb** (the front of a business), **Chit** (a
> signed note that commits the issuer). All fit the Gitwork register — Foundry, Pulse, Deck,
> Scribe, Foreman, Dispatch: short, English, occupational.

## The problem, concretely

It's 9:40pm. Someone's boiler has failed. They ask ChatGPT to sort it. ChatGPT can find twelve
plumbers in SW19 and can tell the customer roughly what a boiler swap costs in general. What it
cannot do — for any of the twelve — is find out whether *this* plumber covers that postcode, has
Tuesday free, will do that specific job, what *they* charge for it, and hold the slot.

So the customer gets a list of phone numbers, which is what Yell did in 1998. The plumber loses the
job to whoever answers first in the morning. And the twelve businesses have no idea it happened —
this doesn't show up in analytics as a lost lead, because it was never a visit.

Now run it forward. When the customer's assistant *can* get a real answer from three of the twelve,
the other nine stop existing. Not "rank lower" — **stop existing**, because the assistant has no
reason to surface a business it cannot get an answer from.

## Why the business won't just fix it themselves

Because doing it naively is legally reckless, and the owner is right to refuse. Under the Consumer
Rights Act a quote accepted forms a binding contract; automation is not a defence to formation; and
the CMA's March 2026 guidance makes the business responsible for whatever its AI says, monitored,
tested and evidenced, at up to 10% of turnover. Handing a language model your rate card and your
diary is an unbounded liability with no audit trail.

**So the blocker is not plumbing. It is that no small business will write a machine a blank
cheque.** The product is the thing that makes the cheque bounded.

## The product

A hosted service where a business defines its **Terms** once, and Standing answers on its behalf —
to anyone, human or machine, at any hour — with a **Standing Offer**.

### The primitive: a Standing Offer

A signed object. Not a message, not an estimate, not a lead — a commitment with edges:

| Field | Why it's there |
|---|---|
| **Scope of work** | The specific job, in the business's own service vocabulary |
| **Price, and the derivation that produced it** | Never a number from a model. An arithmetic trail: base + units × rate + travel band − discount. Contestable, explainable, auditable |
| **Validity window** | It **expires**, usually in minutes. This is the primary safety mechanism: an offer that dies cannot become an open-ended liability |
| **Conditions and exclusions** | What would void it, stated up front rather than discovered on site |
| **Capacity hold** | A real slot, actually reserved, actually released on expiry |
| **Deposit terms** | What is payable to convert the offer into a booking |
| **Eligibility** | Geography, property type, whatever the rules require |
| **Issuer signature** | Ed25519/JWS, so the business can prove what it did and did not commit to |
| **Required counterparty identity** | Higher-value offers can require a verified agent (Web Bot Auth) or a verified human |
| **AI-involvement disclosure** | Mandated by the CMA where it might affect the customer's decision. Not optional, not a setting |

### The Terms: what the business actually configures

Once, in plain language plus structure:

- **Services** — what it does, and how each is priced: fixed, per-unit, hourly, banded, or
  from-price-only.
- **Coverage** — where, and what travel costs.
- **Capacity** — from the diary it already keeps.
- **Floors and blackouts** — never below £X; never a bank holiday; never that postcode; never that
  job type without a survey.
- **The auto-bind ceiling** — *the single most important number in the product.* Below it,
  Standing commits on the business's behalf. Above it, it does not.

### What happens above the ceiling — the bit that makes it sellable

It does **not** guess, and it does not go quiet. It gives the caller the three things that are
still true and safe: **"yes, we cover you"**, **"yes, Tuesday 8am is held for 45 minutes"**, and
**"a human will confirm the price"** — and it pushes the owner a notification with the job already
scoped. The customer's agent gets a real, actionable answer. The business commits to nothing.

That single behaviour is what lets a nervous sole trader switch it on.

## The five architectural rules

Directly inherited from what already works inside Foundry's Dispatch
(`src/server/dispatch/` — deterministic resolution, deterministic evidence, one narrow AI call
that may only *phrase*, never decide):

1. **Bounded mandate, never an open cheque book.** The ceiling is a server-side constraint, not a
   prompt instruction. No model output can exceed it.
2. **The price comes from rules, not from a model.** The LLM's only job is turning "my boiler's
   packed in" into `{service: boiler_replacement, property: flat, urgency: next_48h}`. Every number
   after that is arithmetic. *(Foundry's `computePackageCosting` in `src/server/costing.ts` is
   already exactly this shape: a pure function returning a price plus a `priceBasisLabel` — the
   derivation. The pattern is proven in production.)*
3. **Everything expires.** Short TTL by default. Nothing hangs, nothing accumulates.
4. **Everything is signed and logged, immutably.** Which produces the CMA evidence trail as a
   by-product rather than a feature. *(Foundry's `SignatureRequest.documentSnapshot` already freezes
   exactly what was committed to at the moment of commitment, so later edits can't change it. Same
   semantics, same solution.)*
5. **Unknowns are declared, never guessed.** If the Terms don't cover it, the offer says so. A
   business that occasionally says "I can't price that without seeing it" is trusted; one that
   guesses is sued.

## Channels — and why this is not mistimed

The research is clear that agentic transaction volume is thin and will stay thin for a while (§5 of
`00-research.md`). **So Standing is channel-agnostic by design: one rules engine, four mouths.**

**Revenue today**, on channels that already carry traffic:
- A hosted offer page on a token link — the shape of Foundry's `/docs/[token]`.
- An embeddable widget on the business's existing site.
- Email reply.
- The phone (via the AI-receptionist vendors that already exist — Standing is the thing they call
  to get a *price*, which is precisely what they currently can't do and hand off to a human for).

**Correct shape for the rails when they land:**
- An MCP endpoint, which is now the native transport for ACP anyway.
- `/.well-known/ai-catalog.json`, as a supplement — never the discovery strategy (see §6.1 of the
  research; `llms.txt` got 84 hits out of 62,100 bot visits).
- `schema.org` `Offer`/`Service` in the HTML agents actually read.
- Web Bot Auth verification of inbound callers, so a verified Anthropic or OpenAI agent can be
  granted more than an anonymous one.
- ACP/UCP adapters behind the same offer object, added per surface when a surface is worth it.

**The pitch the business hears is not "prepare for agentic commerce".** It is *"you stop losing the
9pm enquiry."* The protocol support is why the same purchase still works in 2028.

## Why Gitwork, specifically

This is not adjacency-hunting. Every hard component exists in production in Foundry today, verified
in the code:

| What Standing needs | What Foundry already runs |
|---|---|
| An authenticated MCP server agents can call | `src/server/mcp/` — 1,960-line handler, 28 tools, **plus a full OAuth 2.1 authorisation server** (`src/server/oauth.ts`, `/api/oauth/token`, consent flow) |
| A pure pricing function returning price + derivation | `computePackageCosting` in `src/server/costing.ts`; `src/server/rate-card.ts` with tier rates and FX |
| Freezing what was committed to, at the moment of commitment | `SignatureRequest.documentSnapshot` — the exact semantics, already shipped |
| An immutable log of a legal commitment | `SignatureEvent` / `SignatureSigner` |
| Tokenised public pages for a counterparty with no account | `/docs/[token]`, `/sign/[token]`, `/timeline/[token]` |
| Verifying signed inbound HTTP requests | `src/server/slack/signature.ts` — HMAC over raw bytes |
| Deterministic-first AI with a no-AI floor and declared blind spots | `src/server/dispatch/` |
| Grading a site for agent-readiness (the wedge) | `src/server/pulse-checks/ai-readiness.ts` — already ships an `ai_ai_act_disclosure` check |

Plus the thing money can't buy: **a client book of exactly these businesses to design with.**

## Business model

- **Wedge — free, and Gitwork can build it in days.** *"What can an AI agent actually do with your
  business?"* Point Pulse at a site, produce a graded report: can an agent tell what you sell, where
  you work, whether you're free, what it costs, and can it commit to anything. Almost every result
  is a zero. Pulse already has the scanner and the `ai-readiness` check family.
- **Core — per-business subscription.** Tiered on services and offer volume. UK SMB software price
  points: £39–£149/mo.
- **Usage — a fee per *committed* offer.** Aligns exactly with value: charged when the business is
  actually bound, not when a crawler wanders past.
- **Deposits** — Stripe, with the standard cut.
- **Later, and worth more than all of it: the evidence layer** (see concept C) sold to insurers and
  brokers.

## What would have to be true

- A small business will define its pricing rules explicitly. **This is the real adoption risk** —
  many trades price partly on instinct. Mitigation: the from-price-only tier requires nothing but a
  minimum, still beats silence, and the ceiling makes it safe.
- Getting live capacity in is easy enough. Google/Outlook calendar covers most; Jobber/Housecall/
  simPRO covers the rest; and a hand-maintained weekly pattern covers the tail.
- Enough demand arrives through *some* channel to matter. Today that's phone and web, not protocol.

## What kills it

- **A platform absorbs it.** Stripe's ACP already has extensions and native MCP transport; adding
  a quote primitive is not beyond them. **Mitigation:** own the rules-and-liability layer, not the
  payment rail. Stripe will not underwrite a plumber's auto-bind ceiling, and the value here is the
  guardrails and the evidence, not the money movement. Being a good ACP/UCP citizen is the strategy,
  not the threat.
- **Field-service software ships it natively.** Jobber and Housecall Pro already have AI
  receptionists. **Mitigation:** they're US-centric, they cover a fraction of the long tail, and the
  liability layer is not their instinct. Also: be their *supplier*.
- **Timing is wrong anyway.** Mitigated structurally by channel-agnosticism — see above.
- **One bad auto-bind destroys trust.** Mitigated by the ceiling, the TTL and the rules-not-model
  pricing — but it needs a genuinely conservative default and a visible kill switch.

---

# Concept B — **The buying agent**

### *SMB as purchaser*

## The observation

Every rail in the research is being built for agents buying **from** businesses. Nobody is building
the small business **as buyer**. And the SMB-as-buyer problem is not information — comparison sites
have existed for twenty years — it is that **nobody does anything**. Renewal is the path of least
resistance, so businesses drift onto rollover rates and loyalty-penalty premiums indefinitely.

Agentic rails change that specific thing: an agent can now *act*, not merely compare.

## The size of the bleed

- UK insurance loyalty tax: **£1.2bn/yr**; 5+ year home policies ~70% above new-customer pricing.
- Business energy: lapsed contracts roll to out-of-contract rates; broker uplift commissions
  **0.5–3p/kWh**, i.e. **£1,000–£2,500/yr** on 50,000 kWh — usually invisible to the business.
- 5.7m UK SMEs; **2,790 brokers** registered with the Energy Ombudsman's ADR scheme.
- **Ofgem's Non-Domestic Market Review** now forces commission disclosure on request and on the
  contract — a live regulatory tailwind for a transparent alternative.

## The product

A standing mandate the owner signs once — *"re-tender everything, switch anything that saves more
than £X with no service loss, tell me before you commit above £Y"* — over the whole recurring cost
base: energy, insurance, broadband, mobile, card acquiring, waste, software. Continuous rather than
annual. Transparent fee instead of hidden uplift.

## Verdict: **no**

The clearest ROI story of the three and genuinely contrarian, but the wrong business for Gitwork:

- It is a **brokerage**, with FCA introducer/appointed-representative surface for insurance and
  Ofgem's regime for energy. That is a compliance and licensing build, not a software build.
- **Almost nothing Gitwork has already built transfers.** Standing reuses eight production systems;
  this reuses none.
- The incumbents (Bionic, Utility Bidder) have brand, panel relationships and supplier agreements —
  a distribution moat, not a technology one.
- Charging transparently in a market that runs on hidden commission is a *worse* unit economics
  story until you have scale.

Keep it on file. If someone with a broking background turns up, it's a real company. It isn't
Gitwork's.

---

# Concept C — **The recorder**

### *Evidence and certification for SMB AI*

## The observation

The CMA's March 2026 guidance makes every UK business that deploys an AI agent liable for what it
says, at up to 10% of turnover, **even where a third party built it** — with obligations to test,
monitor, oversee and remediate. Meanwhile every small business in the country is switching on AI
receptionists, AI chat and AI quoting with **no evidence trail whatsoever**. Asked to demonstrate
reasonable oversight, essentially none of them could.

## The thing that makes it a business rather than a worthy idea

**A market has already formed that will pay for the artefact.**

- **Armilla** — Lloyd's coverholder, first standalone AI liability policy at Lloyd's (April 2025,
  underwritten by Chaucer) — **bundles independent AI system certification into every policy**,
  informed by 500+ evaluations.
- **Counterpart** — expanded affirmative AI coverage for small business (Nov 2025) with explicit
  Tech E&O and defined triggers for hallucination and misclassification, applying **whether the
  insured builds or merely deploys** third-party agentic models.
- Pre-2026 policies largely treat AI error as technical failure (uncovered) rather than professional
  error (covered).

**So the buyer is the underwriter and the broker, not the plumber.** Selling governance software to
a sole trader does not work and never has. Reducing their premium, or making them insurable at all,
does.

## The product

A tamper-evident recorder that sits across whatever AI the business has switched on: every
customer-facing AI interaction captured, hash-chained, retained; a policy layer that enforces
disclosure and escalation; a continuous conformance check against the CMA's actual obligations
(disclosed, tested, monitored, remediated); and — the saleable output — an **evidence pack** an
insurer, a broker or an ombudsman will accept.

## Verdict: **build it, but as an outcome of A, not instead of A**

It is the lowest-timing-risk and most immediately saleable of the three. But look at what it is:
a system that records, bounds and proves what a business's AI committed to.

**That is Standing's audit log with a cover sheet.** A business that only ever commits through
signed, expiring, bounded offers has the evidence trail *by construction* — every commitment
scoped, priced by rule, disclosed, logged immutably, provably within a ceiling the business set in
advance. The hard part of concept C is getting the data; concept A generates it as exhaust.

Built the other way round you have a recorder with nothing to record but other vendors' chat logs,
competing with enterprise governance platforms on their turf.

**Recommendation: build A. Ship C as Standing's evidence export, then sell that to the risk market
as a second product once there's a corpus.**

---

# The comparison

Scored 1–5, higher is better. Weights reflect what actually determines whether a small team ships
something that works.

| | **A · Standing** | **B · Buying agent** | **C · Recorder** |
|---|:--:|:--:|:--:|
| **Novelty** — is this a new primitive? | **5** — the missing half of a handshake the whole industry built | 3 — new application of new rails to an old market | 2 — new for SMB, exists for enterprise |
| **Gap is real & evidenced** | **5** | 4 | 4 |
| **Fit with what Gitwork already built** | **5** — eight production systems | 1 | 3 |
| **Time to first revenue** | 3 — needs the rules engine right | 2 — licensing before revenue | **4** |
| **Timing risk** | 3 — mitigated by channel-agnosticism | 4 | **5** — regulator-forced |
| **Defensibility at scale** | **4** — rules + liability + evidence corpus | 2 — brokerage moats are relationships | 2 |
| **Ceiling** | **5** — infrastructure for a market that doesn't exist yet | 3 | 2 — a compliance line item |
| **Regulatory burden on us** | 4 — we enable, we don't advise | **1** — FCA + Ofgem | 3 |
| **Total** | **34** | 20 | 25 |

---

# Recommendation

**Build Standing. Design it so the recorder falls out of it.**

Three reasons, in order of weight.

1. **It is the only one of the three that is a new primitive rather than a better tool.** Concepts B
   and C are good businesses in categories that already exist. Standing is infrastructure for a
   market that hasn't formed yet, at the moment the rails around it are being laid by Google, Visa,
   Mastercard, Stripe and Cloudflare — all of whom built the buyer's half and none of whom built the
   seller's.

2. **The unfair advantage is real and specific, not a story.** Eight production systems transfer,
   verified in the code: the MCP server and its OAuth provider, the pure costing function that
   already returns a price plus its derivation, the snapshot-at-commitment semantics, the immutable
   commitment log, tokenised counterparty pages, signed-request verification, the deterministic-AI
   discipline from Dispatch, and a scanner that already grades AI readiness. Plus a client book of
   exactly the businesses this is for.

3. **It earns money at today's adoption level.** The single biggest risk in this space is building
   for 2029. Standing's channel-agnostic design means the rules engine sells on the phone and the
   web page today, and the protocol surface is why the same customer is still a customer when UCP
   reaches the UK.

The honest counter-argument, stated plainly: **concept C would make money sooner and more
predictably.** If the priority is near-term revenue over category creation, build C first. But C is
downstream of A, and building it first means building the harder half of it — data acquisition —
for someone else's agents.

## First moves, in order

1. **Build the free agent-readiness report on Pulse.** Days of work on an existing scanner. It is
   the wedge, the lead source, and the demand test. If businesses don't care that they score zero,
   that's worth learning before any of the rest.
2. **Take five clients from the book** across genuinely different pricing shapes — a trade, a
   clinic, a professional practice, a venue, a creative — and write their Terms **by hand**. Whether
   the rules engine can express real pricing is the only question that matters, and no amount of
   design answers it.
3. **Then build**, to [`02-build-prompt-standing.md`](02-build-prompt-standing.md).
