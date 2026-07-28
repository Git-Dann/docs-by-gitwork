# Standing — Master Build Prompt

> **What this is.** A single, self-contained prompt for building **Standing** from an empty
> repository. Paste everything below the line into a capable coding agent pointed at a fresh repo.
> It is deliberately prescriptive: where it names a value, use that value; where it says "never",
> it means never, and states why.
>
> **Context first.** Read [`00-research.md`](00-research.md) for the evidence and
> [`01-concepts.md`](01-concepts.md) for why this product and not another. This document assumes
> both and does not re-argue them.
>
> **Relationship to Foundry.** Standing is a **separate product in a separate repository**. It
> deliberately mirrors Foundry's stack so the team is productive on day one, and `DESIGN.md` from
> the Foundry repo applies to it unchanged — copy it in. Several components are near-direct ports;
> they are named where they occur.

---

<role>
You are a senior full-stack product engineer building **Standing**, production-grade commerce
infrastructure for small businesses: data model, backend, cryptography, agent interfaces, frontend,
security, deployment.

You are building something that issues **legally binding commitments on a business's behalf,
without a human present**. Hold that thought throughout. The failure mode is not a broken page —
it is a plumber contractually bound to a job at a price they would never have agreed. Every design
decision in this document exists to make that impossible, and where a decision looks like
over-engineering, that is why.

When taste and this document conflict, this document wins.
</role>

<product_context>
**Standing is the seller-side mandate.** It turns a small business's terms — what work it does,
where, at what price, and when it has capacity — into **signed, expiring, bounded offers** that
anyone can request and rely on: a customer's AI agent, an AI phone receptionist, or a person on a
web page at 9:40pm.

The industry has built the buyer's half of this handshake (Google's AP2, Visa TAP, Mastercard
Verifiable Intent all prove what a *customer's* agent may do). Nobody built the seller's half.
Every agentic commerce rail assumes a catalog — a SKU with a price set in advance — which does not
describe the majority of small businesses, who sell **work** at a **quote**.

**Who it is for.** UK service SMBs that price by quote: trades, clinics, professional practices,
venues, creative studios, repair, events. 1–20 people. Construction is the largest UK sector by
business count (15.8%); professional/scientific/technical is second (13.7%).

**What the customer is buying.** Not "agentic commerce readiness". *"You stop losing the 9pm
enquiry."*

**The one-sentence product.** A business defines its Terms once; Standing answers on its behalf,
around the clock, with an offer it is actually willing to be bound by — and never with one it
isn't.
</product_context>

<legal_context>
Read this before writing a line. It is the reason the product is shaped the way it is.

1. **A quote accepted forms a binding contract.** Consumer Rights Act 2015. An *estimate* is not
   binding but the final charge must be reasonable. **These two words are not interchangeable and
   the UI must never treat them as such.**
2. **Automation is not a defence to contract formation.** The objective test (*Smith v Hughes*
   1871, reaffirmed by the Supreme Court): if a reasonable counterparty would understand the
   communications as assent, that is assent — whatever the issuer privately intended, and whoever
   or whatever composed them.
3. **The CMA's *Complying with consumer law when using AI agents* (9 March 2026)** applies to any
   UK business using AI in a customer-facing context, **whether it built the AI or bought it**. It
   requires: disclosure that the customer is dealing with AI where that might affect their
   decisions; testing before deployment; monitoring in production with human oversight for errors
   and hallucinations; rapid remediation; and accuracy on price, product and statutory rights.
   **Enforcement is up to 10% of worldwide turnover plus consumer compensation.**
4. **Deployer liability.** UK regulator guidance converges on a "reasonable oversight" standard:
   the deploying business is liable unless it can *prove* it had monitoring, auditing and safety
   systems. Standing's job is to be that proof.

**Therefore three product invariants, which are not negotiable and not configurable:**

- **Every machine-issued offer carries an AI-involvement disclosure.** Not a setting.
- **Every offer expires.** An offer with no expiry is an unbounded liability.
- **Every offer is bounded by a ceiling the business set in advance, enforced server-side.**
</legal_context>

<tech_stack>
Mirror Foundry so the team is instantly productive. Do not innovate here.

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, React 19, TypeScript |
| Styling | Tailwind CSS v4, CSS-first (**no `tailwind.config.js`**) |
| Database | PostgreSQL + Prisma ORM |
| Crypto | `jose` — Ed25519 (EdDSA) for offer signing, RFC 9421 verification for inbound |
| Data fetching | TanStack React Query v5 |
| Validation | Zod, all schemas in `src/server/validators.ts` |
| AI | Anthropic SDK via a shared provider resolver — **classification only, never pricing** |
| Payments | Stripe (deposits, holds) |
| Testing | Vitest. The rules engine is exhaustively unit-tested; this is not optional |
| Deploy | Docker Compose on a VPS, GitHub Actions on push to `main` |

Design system: **copy `DESIGN.md` from the Foundry repo and follow it unchanged**, including the
`NN // WIDGET NAME` mono card header, the three font lanes, and the token system. Standing is a
Gitwork product and should look like one.
</tech_stack>

<architecture>
The whole product is one pipeline, and the order is the safety property:

```
  request (any channel)
        │
        ▼
  ┌─────────────────┐   ONE narrow AI call. Turns free text into
  │  classify       │   {serviceId, params}. May pick only from THIS
  │  (AI, optional) │   business's services and answer only ITS questions.
  └─────────────────┘   Emits no price. Skipped entirely on structured input.
        │
        ▼
  ┌─────────────────┐   PURE. No I/O, no AI, no clock, no randomness.
  │  deriveOffer()  │   Rules in, decision out. The crown jewel.
  └─────────────────┘
        │
        ├── offer ──────▶ hold capacity ─▶ sign (Ed25519) ─▶ persist ─▶ log ─▶ return
        ├── escalate ───▶ hold capacity ─▶ notify human ──▶ return what IS safe to say
        ├── decline ───▶ log ─▶ return the reason
        └── insufficient ▶ return exactly which parameters are missing
```

**The inherited discipline.** This mirrors Foundry's Dispatch (`src/server/dispatch/`), which is
proven in production: deterministic resolution, deterministic evidence, and one narrow AI call that
may only *phrase*, never decide. Standing tightens it further — the AI here may only *classify*,
and it never touches an amount.

**The four-outcome union is the product.** Most systems in this space have two outcomes (a number,
or silence). Standing has four, and `escalate` is the one that makes it sellable to a nervous sole
trader: above the ceiling it still gives the caller a held slot and a coverage confirmation, and
gives the owner a scoped job. It just doesn't give anyone a price.
</architecture>

<data_model>
Prisma. Additive-only forever after the first deploy: new columns nullable or defaulted, legacy
columns kept. Never `--accept-data-loss`.

**Tenancy & identity**
- `Business` — the tenant. `slug` unique, `name`, `legalName`, `companyNumber`, `vatNumber`,
  `timezone`, `currency` (default `GBP`), `contactEmail`, `contactPhone`, `websiteUrl`, `status`.
- `BusinessKey` — signing keypair. `kid` unique, `publicKeyJwk` (Json), `privateKeyEnc` (AES-256-GCM
  at rest, key from `ENCRYPTION_KEY`), `alg` (`EdDSA`), `activeFrom`, `retiredAt`. **Rotatable, and
  a retired key still verifies historic offers** — this is why offers carry `kid` and are never
  re-signed.
- `User`, `BusinessMember` — owner/staff, role `OWNER | MANAGER | STAFF`.

**What the business sells**
- `Service` — `slug`, `name`, `description`, `pricingModel`
  (`FIXED | PER_UNIT | HOURLY | BANDED | FROM_PRICE_ONLY | SURVEY_REQUIRED`), `durationMinutes`,
  `bufferMinutes`, `leadTimeHours`, `isActive`.
  **`FROM_PRICE_ONLY` is the on-ramp**: a business that will not commit to a price still commits
  to a floor and a slot, which beats silence and is how most accounts will start.
- `ServiceQuestion` — the parameters a service needs to be priced. `key`, `label`, `type`
  (`number | choice | boolean | text | postcode | date`), `required`, `options` (Json),
  `affectsPrice`, `orderKey`. The classifier may answer **only** these.
- `PricingRule` — ordered rules per service. `kind`
  (`BASE | PER_UNIT | BAND | TRAVEL | SURCHARGE | DISCOUNT | FLOOR | CEILING | REQUIRE_SURVEY`),
  `params` (Json), `condition` (Json — evaluated against params), `orderKey`, `label`.
  `label` is what appears in the customer-facing derivation, so write it as prose.
- `CoverageArea` — `kind` (`POSTCODE_PREFIX | RADIUS | NAMED_REGION`), `value`, `travelBandId`,
  `isExcluded`. Exclusions win over inclusions.
- `CapacityWindow` — recurring availability. `weekday`, `startTime`, `endTime`, `capacity`.
- `CapacityException` — one-off closures and extra availability.
- `CalendarConnection` — `provider` (`GOOGLE | OUTLOOK | ICS | JOBBER | HOUSECALL | MANUAL`),
  tokens, `lastSyncedAt`.

**The risk envelope — `Mandate`, one per business**

The most important table in the product. Read every field as a liability control.

| Field | Meaning |
|---|---|
| `enabled` | Master switch |
| `killSwitch` | Immediate stop; every request returns `escalate`. Must be reachable in one click from every admin screen |
| `autoBindCeilingMinor` | **The number.** Above it Standing never issues a price |
| `priceFloorMinor` | Never issue below this, whatever the rules compute |
| `offerTtlSeconds` | Default 1800. Max 86400 — hard cap in code, not config |
| `holdTtlSeconds` | Capacity hold lifetime; ≤ `offerTtlSeconds` |
| `requireVerifiedAgentAboveMinor` | Above this, an unverified caller gets `escalate`, not an offer |
| `maxOffersPerHour`, `maxBoundValuePerDayMinor` | Blast radius caps. A bug or an attack cannot bind the business more than this in a day |
| `blackoutRules` (Json) | Dates, weekdays, postcodes, service combinations |
| `escalationPolicy` (Json) | Who is notified, how, and how fast |
| `allowAnonymousOffers` | Whether an unidentified caller gets anything beyond coverage + availability |

**The primitive — `Offer`**
`token` unique (URL-safe, the credential for the public page), `businessId`, `serviceId`, `status`
(`ISSUED | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN | SUPERSEDED`), `params` (Json),
**`derivation` (Json — the ordered, human-readable arithmetic that produced the price)**,
`priceMinor`, `currency`, `validFrom`, `validUntil`, `conditions` (Json), `exclusions` (Json),
`holdId`, `depositMinor`, `requiredIdentity`, `channel`
(`MCP | WEB | WIDGET | EMAIL | PHONE | API`), `requesterKind` (`HUMAN | VERIFIED_AGENT |
UNVERIFIED_AGENT`), `requesterIdentityId`, `disclosureText`, **`jws`** (the detached signature over
the canonical offer), `kid`, `supersedesId`.

> **An issued offer is immutable.** Changing one means issuing a new offer and marking the old
> `SUPERSEDED`. This is the same semantics as Foundry's `SignatureRequest.documentSnapshot`, which
> freezes what was committed to at the moment of commitment so later edits cannot change it.

- `Hold` — a real capacity reservation. `startsAt`, `endsAt`, `releasesAt`, `status`. Released by
  the expiry job, never implicitly.
- `Acceptance` — `offerId`, `acceptedAt`, `acceptorKind`, `acceptorIdentity`, `proof` (Json — the
  signed mandate / verified signature / human confirmation), `depositPaymentId`.
- `Escalation` — `reason` (`ABOVE_CEILING | SURVEY_REQUIRED | UNPRICEABLE | BLACKOUT |
  IDENTITY_REQUIRED | KILL_SWITCH`), `scopedJob` (Json), `heldSlotId`, `notifiedAt`, `resolvedAt`,
  `resolution`.
- `AgentIdentity` — observed callers. `keyid`, `provider`, `verificationMethod`
  (`WEB_BOT_AUTH | NONE`), `verifiedAt`, `firstSeenAt`, `trustLevel`, `requestCount`.
- **`OfferEvent`** — the audit spine. `offerId`, `kind`, `at`, `actor`, `payload` (Json),
  `prevHash`, `hash`. **Hash-chained and append-only.** `hash = sha256(prevHash ‖ canonical(event))`.
  A break in the chain is detectable, which is what turns a log into evidence.
- `RequestLog` — every inbound request including the declines and the junk, for rate limiting and
  for proving the monitoring obligation.
</data_model>

<rules_engine>
`src/core/derive-offer.ts`. **The whole product's credibility is in this one file.**

```ts
export function deriveOffer(request: OfferRequest, terms: ResolvedTerms): OfferDecision
```

**Pure.** No database, no network, no AI, no `Date.now()`, no `Math.random()`. The clock is passed
in (`request.now`). It is therefore fully unit-testable and fully deterministic, and identical
inputs always produce an identical decision — which is what lets you replay any historic offer and
prove why it was made.

**Returns a discriminated union. Four outcomes, never a fifth:**

```ts
type OfferDecision =
  | { kind: "offer";        priceMinor: number; derivation: DerivationLine[];
                            conditions: string[]; exclusions: string[]; ttlSeconds: number }
  | { kind: "escalate";     reason: EscalationReason; scopedJob: ScopedJob;
                            canStillSay: SafeStatement[] }
  | { kind: "decline";      reason: DeclineReason; explanation: string }
  | { kind: "insufficient"; missing: MissingParam[] }
```

**Evaluation order — fixed, and each step can only narrow:**

1. **Kill switch / mandate disabled** → `escalate: KILL_SWITCH`.
2. **Service known and active?** → else `decline`.
3. **All required params present?** → else `insufficient`, naming each missing param and its
   question. *Never* substitute a default for a missing price-affecting parameter.
4. **In coverage?** Exclusions beat inclusions → else `decline: OUT_OF_AREA`.
5. **Blackout?** → `decline` or `escalate` per rule.
6. **`SURVEY_REQUIRED` service or a `REQUIRE_SURVEY` rule fires** → `escalate: SURVEY_REQUIRED`.
7. **Capacity available in the requested window?** → else `insufficient` with alternatives.
8. **Compute price** by walking `PricingRule`s in `orderKey`, each appending a `DerivationLine`
   (`{label, kind, detail, deltaMinor, runningMinor}`).
9. **Apply `FLOOR`** — then the mandate's `priceFloorMinor`. The mandate wins.
10. **Above `autoBindCeilingMinor`?** → `escalate: ABOVE_CEILING`. **This check is here, in pure
    code, after the arithmetic. It is not a prompt, not a setting read at render time, and not
    enforceable anywhere else.**
11. **Requester identity below `requireVerifiedAgentAboveMinor`?** → `escalate: IDENTITY_REQUIRED`.
12. **Rate/blast-radius caps exceeded?** → `escalate`.
13. Otherwise → `offer`, with `ttlSeconds` from the mandate.

**`canStillSay`** is what makes `escalate` a real answer rather than a shrug. It carries only what
is independently true: `COVERED`, `SLOT_HELD` (with the actual slot), `TYPICAL_RANGE` (only if the
business has explicitly published one — never inferred), `CALLBACK_WITHIN` (from the escalation
policy).

**Testing bar.** Every rule kind, every decision branch, every ordering interaction, and a
property test asserting **no input can produce an `offer` above the ceiling or below the floor**.
If that property test is missing, the product is not built.
</rules_engine>

<classification>
`src/server/classify.ts`. One narrow AI call, and it is the only AI in the product.

**Its entire job:** free text → `{ serviceId, params, unresolved[] }`.

**Hard constraints, enforced in code after the call, not asked for in the prompt:**
- It may return **only** a `serviceId` from this business's active services. Anything else → drop.
- It may fill **only** keys declared as that service's `ServiceQuestion`s. Extra keys → drop.
- Values must typecheck against the question's type and options. Bad values → move to `unresolved`.
- **It never emits an amount, a currency, a discount or a date range.** If the response contains a
  price-shaped field, discard the whole response and return `insufficient`. Validate this; do not
  trust the prompt.
- Low confidence or anything unresolved → `insufficient`, listing the questions. A clarifying
  question is a good outcome; a guess is a liability.

**Cost discipline**, mirroring Foundry's Dispatch and Foreman: one `tier: "light"` (Haiku) call,
small token cap, stable system prompt so it is prompt-cached, and the whole call wrapped in a
response cache keyed on `(businessId, serviceCatalogHash, normalisedText)`. A repeated question
against an unchanged catalogue costs nothing.

**Skipped entirely** when the caller sends structured input — which every MCP caller does. Most
production traffic should never reach the model.
</classification>

<cryptography>
**Outbound — signing offers.**
- Ed25519 (`EdDSA`) via `jose`. Canonicalise the offer with JCS (RFC 8785) before signing; a
  signature over an ambiguous serialisation proves nothing.
- Signature is **detached**, stored in `Offer.jws`, carrying `kid`.
- Public keys at **`/.well-known/jwks.json`**, per-business at `/{business}/.well-known/jwks.json`
  if hosted on the business's own domain. Retired keys stay published — historic offers must remain
  verifiable.
- Publish a tiny public verifier (`/verify`) where anyone can paste an offer and check it. Cheap to
  build, and it is the whole trust story made tangible.

**Inbound — Web Bot Auth (RFC 9421).**
- Verify `Signature` / `Signature-Input` on inbound requests against the caller's published
  directory (e.g. `https://anthropic.com/.well-known/http-message-signatures-directory`). Cache
  directories with a TTL; a fetch failure means *unverified*, never *verified*.
- Live at Cloudflare's edge since March 2026, with Anthropic, OpenAI, Perplexity and Common Crawl
  enrolled — so this is real coverage today, not speculative.
- Map `keyid` → `AgentIdentity`, set `trustLevel`, and let the mandate grant more to a verified
  caller than an anonymous one. **This is the feature that makes higher-value auto-binding safe.**

**Never treat a self-declared identity as verification.** A `User-Agent` claiming to be ChatGPT is
a string an attacker controls. Only a validated signature sets `VERIFIED_AGENT`.
</cryptography>

<agent_surface>
**MCP server** at `/api/mcp` (per-business, resolved by subdomain or path). Streamable HTTP.
Port the auth pattern from Foundry's `src/server/mcp/auth.ts` + `src/server/oauth.ts`.

| Tool | Returns |
|---|---|
| `describe_business` | What it does, where, how it prices, what it needs to know, and **what it will and won't commit to** |
| `list_services` | Services with pricing model and the questions each needs |
| `check_coverage` | `{covered, travelBand?, reason?}` for a postcode |
| `get_availability` | Real slots for a service in a window |
| `request_offer` | The four-outcome union. Never throws for a business reason — `decline` is a result, not an error |
| `hold_slot` | Reserve without pricing (the escalation path) |
| `accept_offer` | Booking + deposit link. Idempotent on offer token |
| `get_offer` / `withdraw_offer` | Status and issuer-side withdrawal (only while `ISSUED`) |

Read-only tools are open (subject to rate limits); `request_offer` and above respect the mandate's
identity thresholds.

**Discovery — belt and braces, in priority order:**
1. **`schema.org` `Service` + `Offer` JSON-LD in the HTML** of the business's own pages. This is
   what agents actually read.
2. **`/.well-known/ai-catalog.json`** (the Google-plus-ten standard shipped 17 June 2026) pointing
   at the MCP endpoint.
3. **`/.well-known/mcp.json`** and an A2A agent card.
4. `agents.md`.

> **Never make a well-known file the discovery strategy.** `llms.txt` was hit **84 times out of
> 62,100 AI bot visits** in a 90-day study, and SE Ranking found its presence *reduced*
> citation-prediction accuracy. Declarative files are a supplement for the minority of callers that
> look for one. Traffic comes from the page and from the channels below.
</agent_surface>

<human_surface>
Everything below carries revenue **today**, at current agentic adoption levels. Build it; do not
treat it as secondary.

- **Public offer page `/o/[token]`** — the token is the credential, `noindex`. Shows the price,
  **the full derivation in plain English**, conditions, exclusions, the held slot, a live countdown
  to expiry, Accept / Decline, and the AI disclosure. Port the tokenised-page pattern from
  Foundry's `/docs/[token]`.
- **Embeddable widget** — one script tag on the business's existing site. Same engine, same offers.
  Self-contained, no external requests beyond its own origin.
- **Email reply path** — an enquiry email in, an offer link out.
- **Phone** — a webhook API the existing AI-receptionist vendors (Bland, Retell, Vapi, Sameday,
  Jobber's and Housecall's own) can call to get a **real price**, which is exactly what they
  currently cannot do and hand to a human for. Standing is their supplier, not their competitor.
- **Owner app** — the Terms editor (services, questions, pricing rules with a **live preview
  showing the derivation as you type**, coverage map, capacity, and the mandate with the ceiling
  front and centre), the escalation inbox with one-tap price-and-send, the offer ledger, and the
  kill switch on every screen.

**Copy rule, legally load-bearing:** an `offer` is a **quote** and the UI says quote. An
`escalate` result is **not** a quote and must never be worded as one. A published typical range is
an **estimate** and must be labelled as such. Do not let a designer smooth these words together.
</human_surface>

<security_model>
- Token-in-URL is the credential for `/o/[token]` — high entropy, `noindex`, `Referrer-Policy:
  no-referrer`, revocable.
- Mandate thresholds are **server-side constraints in pure code**. Never a client-supplied value,
  never a prompt instruction, never re-read at render time.
- Rate limit per IP, per agent identity, and per business. `RequestLog` records declines too.
- Private keys AES-256-GCM at rest. `ENCRYPTION_KEY` from env, never in the repo, never logged.
- Webhook and inbound-signature verification over **raw bytes** before parsing — port
  `src/server/slack/signature.ts` from Foundry.
- PII minimisation: an offer needs a postcode and a job, not a name and a full address. Collect the
  rest at acceptance.
- `OfferEvent` is append-only. No update path, no delete path, in code or in the admin UI.
</security_model>

<build_order>
Each phase to its exit criterion, build green throughout.

1. **The rules engine, alone.** `src/core/` — types, `deriveOffer`, and the full test suite. No
   database, no framework, no UI. **Exit:** every rule kind and every branch covered, plus the
   property test proving no input yields an offer above the ceiling or below the floor. *Write
   nothing else until this is green — everything downstream is a delivery mechanism for it.*
2. **Persistence + offers + signing.** Prisma schema, Ed25519 keypair generation, JCS
   canonicalisation, JWS signing, `/.well-known/jwks.json`, the hash-chained `OfferEvent` log, and
   the expiry/hold-release job. **Exit:** an offer can be issued from a seeded business, verified
   from its published key, and expires on schedule releasing its hold.
3. **The public offer page** `/o/[token]` with accept/decline. **Exit:** a human can be shown an
   offer, see the derivation, and accept it — end to end, no agent involved.
4. **Terms admin.** Services, questions, pricing rules with live derivation preview, coverage,
   capacity, mandate, kill switch. **Exit:** a real business's pricing can be configured by hand in
   under an hour without touching the database.
5. **MCP surface + discovery.** The tool set, JSON-LD emission, `ai-catalog.json`. **Exit:** Claude
   and ChatGPT can both connect, describe the business, and request an offer.
6. **Web Bot Auth.** Inbound RFC 9421 verification, `AgentIdentity`, identity-gated thresholds.
   **Exit:** a verified caller and an anonymous one demonstrably get different outcomes at the same
   price point.
7. **Escalation + notification.** The inbox, push/SMS/email to the owner, one-tap price-and-send.
   **Exit:** an above-ceiling request holds a slot, reaches the owner in under a minute, and can be
   converted to an offer in one tap.
8. **Deposits.** Stripe on acceptance. **Exit:** an accepted offer takes a real deposit.
9. **Classification.** The AI layer, last — the product must work fully without it. **Exit:** free
   text produces the same decision as the equivalent structured input, and a price-shaped model
   response is discarded.
10. **Evidence export.** The signed, hash-chain-verified pack of what was committed and what was
    refused. **Exit:** a pack exports, and a tampered chain fails verification loudly.
11. **Deploy.** Docker Compose, GitHub Actions on `main`, host cron for expiry/holds/sync,
    `pg_dump` backups, Let's Encrypt.

**Phase 10 is concept C in embryo.** Build it properly; it is a second product later.
</build_order>

<definition_of_done>
A slice is done only when all hold:
- `npx tsc --noEmit` clean; `eslint` clean; `vitest` green.
- `npx next build` clean. **Never `npm run build` against a live database** — it runs
  `prisma db push`.
- Schema diff **additive-only**.
- Dark mode and the 1024px breakpoint checked, including the 640–1023 band.
- Modal focus trap, Escape, `aria-live`, keyboard nav on interactive surfaces.
- **Any new path that can issue an offer is covered by the ceiling property test.** A new issuing
  path that bypasses `deriveOffer` is a defect regardless of what it returns.
- No hardcoded AI model names.
- Conventional Commit message.
</definition_of_done>

<anti_patterns>
Each is load-bearing. Never do the thing; the reason follows.

- **Never let a model produce a price.** It classifies. Arithmetic is code. A model that can name a
  number can name the wrong one, and the business is bound by it.
- **Never let the auto-bind ceiling live anywhere but pure code, evaluated after the arithmetic.**
  A ceiling in a prompt is a suggestion. A ceiling checked at render time is bypassed by the API.
- **Never issue an offer without an expiry.** An offer with no `validUntil` is an unbounded
  liability that outlives the price it was based on.
- **Never mutate an issued offer.** Supersede it. The old one must remain verifiable exactly as
  issued, or the signature proves nothing.
- **Never issue a machine-composed offer without the AI-involvement disclosure.** CMA, 9 March
  2026. Not a setting, not a tier feature.
- **Never use "quote" and "estimate" interchangeably in user-facing copy.** One binds the business,
  one doesn't. This is a legal distinction, not a style choice.
- **Never trust a self-declared agent identity.** Only a validated RFC 9421 signature sets
  `VERIFIED_AGENT`. A `User-Agent` header is attacker-controlled.
- **Never make a `.well-known` file the discovery strategy.** 84 hits in 62,100 bot visits. It is a
  supplement.
- **Never release a capacity hold implicitly.** Explicit expiry job or explicit release. A hold
  that vanishes silently double-books a real person's Tuesday.
- **Never write to `OfferEvent` without extending the hash chain**, and never add an update or
  delete path to it. An editable log is not evidence.
- **Never let "we don't know" become a guessed price.** `insufficient` and `escalate` exist for
  this. A clarifying question is a good outcome.
- **Never let a bulk or admin path issue offers around `deriveOffer`.** Every offer, from every
  channel, through the same function — that single fact is the entire safety argument.
- **Never log or export a private key, and never re-sign a historic offer with a rotated key.**
- **Never sign a non-canonical serialisation.** JCS first, always.
</anti_patterns>

<verification>
**Standing has an advantage Foundry does not: it can be verified for real.** There is no
auth-gated client data in the core loop, so a public dev deployment is safe — which means the
acceptance test is the actual product, not a proxy for it.

1. **Point Claude and ChatGPT at the live MCP endpoint and transact.** Ask an assistant to find out
   whether the demo business can do a job next Tuesday and what it costs, and have it come back
   with a real, signed, verifiable offer. That is the demo, the acceptance test and the sales
   collateral in one artefact.
2. **Verify a signature independently** — `/verify`, from a different machine, against the
   published JWKS.
3. **Adversarial pass, and treat it as a release gate.** Try to make it commit to something it
   shouldn't: prompt-inject the free-text field; request a job just under and just over the
   ceiling; request out of area; request during a blackout; supply a price in the input; replay an
   expired offer token; accept the same offer twice; forge a Web Bot Auth signature; and hammer the
   rate limits. **Every one of these must fail closed**, and every one belongs in the test suite.
4. **Tamper with an `OfferEvent` row directly in the database** and confirm the evidence export
   fails verification loudly.
5. **Five real businesses, Terms written by hand**, before any of it is generalised — a trade, a
   clinic, a professional practice, a venue, a creative studio. Whether the rules engine can
   express real pricing is the only question that matters, and it cannot be answered by design.
</verification>

<output_format>
- Build **one vertical slice at a time**; keep `tsc`, `eslint`, `vitest` and `next build` green
  between slices.
- Reuse the named patterns from Foundry before inventing anything — they are cited in this document
  by file path and they are already in production.
- Conventional Commits; each commit leaves the build green.
- **Confirm before destructive or outward-facing actions** — schema drops, deletes, anything sent
  on a business's behalf, anything published.
- Be explicit about what is stubbed, deferred or unverified. Do not claim a slice is done until it
  meets `<definition_of_done>`.
- **When a decision trades safety against convenience, take safety and say so in the commit
  message.** This product signs commitments on behalf of people who will not read the code.
</output_format>

---

## Deferred, and deliberately so

- **ACP / UCP adapters.** Behind the same `Offer` object, added per surface when that surface is
  worth supporting. Not in v1 — the protocols are still moving and UK coverage is last in the
  rollout order.
- **AP2 mandate consumption.** Reading a *buyer's* signed mandate to auto-accept within its
  guardrails is the obvious phase two and completes the handshake in both directions.
- **Multi-party offers**, subcontracting, marketplaces.
- **Negotiation.** Standing issues; it does not haggle. Counter-offers are a phase-three question
  and a materially harder liability problem.
- **Non-UK jurisdictions.** The legal model in `<legal_context>` is England and Wales. Every market
  needs its own review before a single offer is issued in it.
