# New product research — the agentic web and the small business

> **What this is.** The evidence base behind the three product concepts in
> [`01-concepts.md`](01-concepts.md). Compiled July 2026. It exists so the concepts can be argued
> with on the facts rather than on taste.
>
> **How to read the sourcing.** Every claim is linked. Sources are tagged:
> **[P]** primary (the organisation that produced the data or the rule — Cloudflare, GOV.UK,
> Stripe, Google, Gartner, Lloyd's coverholders), **[S]** secondary (a reporter or analyst
> summarising a primary source), **[V]** vendor (a company with a commercial interest in the
> number being true). **Treat [V] figures as directional only.** Where a number is a *forecast*
> rather than a *measurement* it says so explicitly — this field is thick with projections
> presented as facts, and several of the most-quoted numbers in agentic commerce are vendor TAM
> estimates dressed as observations.

---

## 1. The web's readership has flipped

The population reading the average business website is now majority machine.

| Measure | Value | Date | Source |
|---|---|---|---|
| Automated share of all HTML traffic | **57.5%** | Jun 2026 | Cloudflare CEO, via [ppc.land](https://ppc.land/cloudflare-exposes-ai-crawlers-hitting-sites-50000-times-per-visitor/) **[S of P]** |
| Bot share of all web traffic | ~53% | 2026 | Imperva Bad Bot Report, via [Lyrie](https://lyrie.ai/research/research/2026-05-02-bad-bot-report-2026-internet-no-longer-human) **[S of P]** |
| AI crawler requests that were *search*-purpose (i.e. could return a citation) | **under 10%** | May 2026 | [technologychecker](https://technologychecker.io/blog/ai-crawler-statistics) **[S]** |
| Training crawlers as share of AI bot traffic | 50.6% | Jun 2026 | Cloudflare Radar, via [digitalapplied](https://www.digitalapplied.com/blog/ai-crawler-bot-traffic-statistics-2026-data-reference) **[S of P]** |

**Crawl-to-refer ratios** — pages scraped per visitor sent back:

| Crawler | Ratio | Source |
|---|---|---|
| Anthropic (Claude) | **10,300 : 1** | Cloudflare Radar, 31 May 2026, via [alphamatch](https://www.alphamatch.ai/blog/ai-crawlers-drain-web-economy-on-premise-ai-2026) **[S of P]** |
| OpenAI | ~848 : 1 | Cloudflare Radar **[S of P]** |
| Perplexity | ~186 : 1 | Cloudflare Radar **[S of P]** |
| Google | ~5 : 1 | Cloudflare Radar **[S of P]** |

> ⚠️ These ratios vary substantially by measurement window — one source cites Anthropic at 4,580:1
> over a different period. The *order of magnitude* is the robust finding, not the digits. Quote
> them as "thousands to one", not as "10,300".

**Where the humans are going.** ChatGPT ~1.1bn monthly users, Gemini ~662m, Claude ~245m
([Momentic](https://momenticmarketing.com/blog/top-ai-chatbots), Jul 2026 **[S]**). ChatGPT's share
of AI chatbot web visits fell below 50% for the first time in June 2026
([TechCrunch](https://techcrunch.com/2026/06/16/chatgpts-market-share-slips-below-50-for-first-time/) **[S]**)
— the point being that this is now a *multi-surface* market, not one company's product.

AI browsers — ChatGPT Atlas, Perplexity Comet, Gemini-in-Chrome — are **forecast** at 1–3% of
browser share during 2026, i.e. 25–100m people
([IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-atlas-openai-browser) **[S, forecast]**).
Chrome still holds ~71%. The material fact is not the share; it is that for those users the thing
arriving at your website *is an agent wearing a browser*, and it behaves like a customer.

**Consistent finding across sources:** transactional and local queries remain Google-dominant;
informational queries have moved to assistants. The agentic transaction layer is arriving *after*
the agentic research layer, not with it.

---

## 2. The rails that got built — and the shape they were built in

Eighteen months of very serious infrastructure. Every piece of it assumes a **catalog**: an item
with an identifier, a price set in advance, and stock.

| Rail | Owner | What it does | Status (Jul 2026) |
|---|---|---|---|
| **ACP** — Agentic Commerce Protocol | Stripe + OpenAI | Agent-initiated cart and checkout at a merchant | Four releases since Sep 2025; payment handlers, scoped tokens, extensions, built-in buyer auth, **native MCP transport** ([Stripe](https://stripe.com/blog/10-lessons) **[P]**) |
| **UCP** — Universal Commerce Protocol | Google | Discovery → purchase → post-purchase across Search, Gemini, YouTube, Maps | Expanded at I/O 2026; extensible capability schemas ([Google](https://business.google.com/us/accelerate/announcements/universal-commerce-protocol-powered-features-on-google/) **[P]**, [ucp.dev](http://ucp.dev/) **[P]**) |
| **AP2** — Agent Payments Protocol | Google | Cryptographically signed **buyer** mandates — "buy tickets under $200" | Open protocol ([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) **[P]**, [Descope explainer](https://www.descope.com/learn/post/ap2) **[S]**) |
| **TAP** — Trusted Agent Protocol | Visa | Signed HTTP messages proving an agent legitimately acts for a named user | Live; merchants validate against Visa public keys ([Visa](https://corporate.visa.com/en/sites/visa-perspectives/security-trust/the-threats-landscape-of-agentic-commerce.html) **[P]**) |
| **Verifiable Intent** | Mastercard | Tokenised credential binding agent + user + spend cap + merchant category + time window | Live **[S]** |
| **Web Bot Auth** | Cloudflare / IETF, on RFC 9421 | Agent providers publish signing keys at a well-known URL; sites verify request signatures | **Production at Cloudflare's edge since March 2026.** Anthropic, OpenAI, Perplexity, Common Crawl verified. AWS WAF support since Nov 2025 ([Cloudflare](https://blog.cloudflare.com/signed-agents/) **[P]**, [repo](https://github.com/cloudflare/web-bot-auth) **[P]**, [AWS](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-waf-web-bot-auth-support) **[P]**) |
| **`/.well-known/ai-catalog.json`** | Google + 10 others | One index pointing at a site's MCP server, A2A agent card and API | Shipped **17 June 2026** **[S]** |
| **x402** | Coinbase-originated | Machine-to-machine micropayment over HTTP 402 | See §5 for the volume reality |

### 2.1 Who is actually enrolled

This is the part that matters for a small business, and it is unambiguous. Coverage is going to
**platforms and named verticals**:

- **Retail** — Shopify merchants auto-enrolled at no platform cost; Etsy US sellers from day one;
  Glossier, Vuori, SKIMS. **Nonexistent at Amazon, Walmart, Target.**
- **Hotels** — Booking.com, Expedia, Hilton, Marriott, IHG, Accor.
- **Food** — DoorDash, Uber Eats, Square, Toast.
- **Geography** — US first; Canada and Australia next; **the UK explicitly later**
  ([Search Engine Land](https://searchengineland.com/google-expands-universal-commerce-protocol-and-launches-new-agentic-shopping-tools-478113) **[S]**).

If you are a plumber in Wimbledon, a two-partner accountancy practice, a physiotherapy clinic or a
wedding photographer, **none of this touches you, and nothing on any published roadmap will.**

---

## 3. The gap: only half the handshake exists

The industry has built the **buyer-side mandate** with real care. AP2, Visa TAP and Mastercard
Verifiable Intent all answer the same question: *what is this customer's agent authorised to do,
and can the merchant prove it?* Signed, scoped, tamper-evident, auditable.

**There is no seller-side equivalent.** No standard, no product, and no vendor building one, for
the mirror-image question: *what is this business willing to be bound to, and can the agent prove
it?* Nothing lets a business state, in a form a machine can verify and rely on:

> *"I will do a boiler swap in SW19 next Tuesday for £840, held for 30 minutes, subject to these
> three conditions."*

### 3.1 Why the gap exists: services are priced, not listed

A catalog holds *prices*. A service business issues *quotes* — derived from the job, the calendar,
the travel radius and the rate card. The protocols cannot express that. As the merchant guidance
puts it, protocols standardise how merchants expose catalogs — "pricing, availability,
specifications, shipping options" — and "if product data isn't structured for machine consumption,
agents can't find or evaluate offerings"
([commercetools](https://commercetools.com/blog/agentic-commerce-protocol-acp-deep-dive-guide) **[V]**).
Bespoke and custom-quote workflows are consistently described as out of scope.

`schema.org` has the vocabulary — `Offer`, `PriceSpecification`, and even
[`QuoteAction`](https://schema.org/QuoteAction) ("an agent quotes/estimates/appraises an
object/product/service with a price") — but it is **descriptive markup, not a transaction
primitive**. There is nothing to accept, nothing to hold, nothing signed, and nothing anyone is
bound by.

### 3.2 The size of the population this excludes

UK, from the Department for Business and Trade's Business Population Estimates
([money.co.uk](https://www.money.co.uk/business/business-statistics/small-business-statistics) **[S of P]**):

- **5.69m** UK businesses; **5.68m** are SMEs.
- **Construction** is the largest sector by business count — **15.8%**.
- **Professional, scientific and technical** is second — **13.7%**, or 819,465 businesses; on a
  broader definition including legal, consulting, accountancy, compliance, HR and advisory,
  **~1.9m firms, over a third of all UK service-sector businesses**
  ([createsales](https://www.createsales.co.uk/uk-business-outlook-2026-2030-professional-services/) **[S]**).
- Wholesale/retail including vehicle repair — 548,515.

Overwhelmingly these price by quote. **The agentic commerce stack, as built, addresses almost none
of them.**

### 3.3 What exists adjacent to the gap, and why none of it closes it

| Thing | What it does | Why it isn't this |
|---|---|---|
| [Agentic Storefront](https://agenticstorefront.com/) (ForkPoint) **[V]** | Enter a store URL, see what agents can and can't read/buy | **Diagnostic only.** Tells you you're invisible; doesn't make you transactable |
| [Your Next Store](https://yournextstore.com/blog/mcp-servers-for-ecommerce) **[V]** | Native `/api/mcp` on every store | Their own ecommerce platform; catalog-shaped |
| AI booking agents — Jobber AI Receptionist, Housecall Pro CSR AI, Sameday **[V]** | Answer the phone, read live FSM availability, book | **Books time; does not price work.** They hand off to a human for anything non-standard, and they are a *channel*, not a commitment |
| AI quoting tools — SUPERAGENT (insurance, launched 11 Feb 2026), DealHub, Peak **[V]** | Help a *human seller* produce a quote faster | Seller-productivity tools. Nothing is exposed to the customer's agent, nothing is signed, nothing binds |
| Stripe Agentic Commerce Suite **[P]** | Connected accounts become "agent-ready" — discovery, checkout, payments, fraud | Catalog and checkout. The **rules and liability** layer is out of scope and Stripe has not signalled otherwise |

Nobody is building the counterparty layer. The nearest thing to it — AP2's mandate — was built for
the other side of the table.

---

## 4. Why nobody has built it: this is a liability problem, not a plumbing problem

The technical work here is a weekend. The reason no small business has pointed ChatGPT at its
calendar and rate card is that doing so is legally reckless, and correctly so.

### 4.1 A machine-issued quote binds the business

- Under the **Consumer Rights Act 2015**, a quote is a fixed offer; the moment the customer accepts
  it — in writing, by text, or by letting work begin — a binding contract exists at that price
  ([Sprintlaw](https://sprintlaw.co.uk/articles/is-a-quote-legally-binding-understanding-contract-formation-for-uk-businesses/) **[S]**).
  An *estimate* is not binding, but the final charge must still be reasonable.
- **Automation is not a defence to contract formation.** The objective test runs back to
  *Smith v Hughes* (1871) and was reaffirmed by the Supreme Court: what matters is whether the
  communications, viewed as a whole, objectively show agreement on essential terms and an intention
  to create legal relations. A party who conducts itself such that a reasonable counterparty would
  understand it to be assenting **is treated as assenting, whatever it privately intended**
  ([Lexology, on agentic AI and English contract law](https://www.lexology.com/library/detail.aspx?g=93c1d0f7-5b4a-4cde-9ede-ac011a50f2a8) **[S]**).

### 4.2 The CMA has already ruled on who is responsible

**[P — this is the single most load-bearing source in this document.]**
The Competition and Markets Authority published
[**Complying with consumer law when using AI agents**](https://www.gov.uk/government/publications/complying-with-consumer-law-when-using-ai-agents/complying-with-consumer-law-when-using-ai-agents)
on **9 March 2026**. It applies to UK businesses using AI in customer-facing contexts **whether
they built the AI or bought it**. Obligations:

- **Disclose** when a customer is dealing with an AI rather than a person, where that fact might
  affect their decisions.
- **Test before deployment** and configure agents to comply with the relevant legislation.
- **Monitor** agents in production, with human oversight to catch errors and hallucinations.
- **Remediate fast** when something goes wrong.
- Be accurate on pricing, product information and consumers' statutory rights.

**Enforcement: fines up to 10% of worldwide turnover, plus consumer compensation.**

Separately, UK regulator guidance of March 2026 is reported as placing responsibility on the
deploying business **even where a third party supplied or designed the agent**, with many
jurisdictions converging on a "reasonable oversight" standard — the deployer is liable unless it
can *prove* it had monitoring, auditing and safety systems in place
([Clifford Chance](https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2026/02/agentic-ai-and-the-liability-gap-your-contracts-may-not-cover.html) **[S]**).

### 4.3 And the insurance doesn't cover it

Policies written before 2026 generally treat AI error as *technical failure* (not covered) rather
than *professional error* (covered); new ISO exclusions may strip generative-AI liability out of
general liability entirely. Model providers' terms disclaim liability for outputs. See §7 for the
market that has formed in response.

**The conclusion that drives the product design:** what unlocks agent-facing commerce for a small
business is not a data feed. It is a **bounded, provable, expiring commitment** — a mandate the
business grants, with a ceiling it cannot exceed and a record it can produce afterwards.

---

## 5. Reality check — how much of this is actually happening

Deliberately included, because the timing risk is the main thing that could make a product here
wrong.

- **x402:** 165m+ transactions across 69,000 active agents by April 2026 — but **roughly half of
  that volume appears to be testing**, cumulative value ~$50m, average ~30p per call. It is
  calibrated for sub-cent micropayments, not retail purchases
  ([RZLT](https://www.rzlt.io/blog/agentic-payments-2026-x402-explainer) **[S]**).
- **ACP:** "early adoption was thin, only a handful of merchants shipped against the first
  release" **[S]**.
- **Conversion:** AI-referred traffic converts ~**86% worse** than affiliate traffic, attributed to
  merchant infrastructure not being built for agents **[V — treat as directional]**.
- **Forrester, mid-2026:** the category "has crossed from research demo into shipping
  infrastructure", but "the adoption gap between infrastructure availability and genuine commercial
  volume is large"
  ([Forrester](https://www.forrester.com/blogs/the-state-of-agentic-commerce-in-mid-2026/) **[P]**).
- **Dynatrace:** roughly half of agentic AI projects remain stuck in proof-of-concept **[V]**.
- **Regulation as brake:** consumer-protection law written for humans is expected to slow agentic
  commerce independently of the technology
  ([Center for Data Innovation, Mar 2026](https://datainnovation.org/2026/03/agentic-commerce-is-coming-but-regulation-meant-for-humans-will-slow-it-down/) **[S]**).

**Forecasts, labelled as such and not relied upon:** Gartner projects 90% of B2B buying will be AI-agent
intermediated by 2028, pushing $15tn through agent exchanges
([Gartner via DC360](https://www.digitalcommerce360.com/2025/11/28/gartner-ai-agents-15-trillion-in-b2b-purchases-by-2028/) **[S of P, forecast]**);
various vendors project the agentic-shopping market from $547m to $5.2bn **[V, forecast]**. What
Gartner has actually *measured* is more useful: a 2026 survey of 645 B2B buyers found 45% used
genAI during the purchase and **69% still turned to a human rep to validate** what the AI told them.

> **The design consequence.** A product whose revenue only begins when protocol volume arrives is
> mistimed by somewhere between one and three years. Anything built here must earn money at
> today's adoption level and be correctly shaped for the rails when they land.

---

## 6. Two hard design constraints, learned from the failures

### 6.1 Declarative discovery files do not work — do not build on them

`llms.txt` is the cautionary tale, and it is worth being blunt because a lot of agencies are
currently selling it.

- Adoption ~**10.13%** of 300k domains studied (SE Ranking) **[S]**.
- **Agents don't read it.** One 90-day study of 500m+ AI bot visits found **408** hit `/llms.txt`
  directly; OtterlyAI's 90-day experiment found **84 of 62,100+** AI bot visits
  ([OrganiKPI](https://organikpi.com/blog/distribution/llms-txt-adoption-impact/) **[S]**).
- **No measurable benefit.** SE Ranking's XGBoost model found that *removing* the `llms.txt`
  variable **improved** citation-frequency prediction — it added noise, not signal.
- No major AI platform has confirmed it reads the file. Ahrefs, SE Ranking and Google's John
  Mueller are all on record as sceptics.
- It does help in one place: developer-facing docs consumed by coding agents.

Meanwhile the standards that *do* have institutional weight are the ones with enforcement or
identity behind them — Web Bot Auth (verified at the edge, adopted by AWS), A2A agent cards backed
by the AAIF (Google, OpenAI, Microsoft, Anthropic), and `/.well-known/ai-catalog.json`. Shopify made
`/agents.md` canonical for its storefronts in May 2026 — which works because Shopify *is* the
distribution.

> **Rule:** agents read pages and call tools. A well-known file is a supplement for the minority of
> callers that look for one. It is never the discovery strategy.

### 6.2 Agents cannot currently be told apart from people, and most don't say

- "You cannot tell a 2026 LLM-driven bot from a Chrome user via headers" **[S]**.
- Cambridge research finds **most AI agents do not disclose their AI nature** to end users or third
  parties by default ([University of Cambridge](https://www.cam.ac.uk/stories/ai-agent-index-safety) **[P]**).
  Amazon has threatened legal action over Comet not identifying itself.
- AI-driven bot attacks rose from 2m to 25m per day in a year **[V]**.
- Counterfeit merchants engineered specifically to deceive shopping agents are already a documented
  attack: a fraudulent storefront can look legitimate, pass automated checks, and undercut on price **[S]**.

Web Bot Auth is the credible answer, and it is *live*. It means a business can rationally offer
**more** to a cryptographically verified Anthropic or OpenAI agent than to an unidentified caller —
which is exactly the discrimination a commitment layer needs in order to be safe.

---

## 7. The market that has formed around AI liability

Relevant to concept C, and to the evidence layer of concept A.

- **Armilla** — Toronto MGA, **Lloyd's coverholder**, launched the first standalone AI liability
  policy at Lloyd's in April 2025, underwritten by syndicates including **Chaucer**. Covers
  financial damages and defence costs from AI underperformance: hallucinations, model drift,
  deviations from expected behaviour. Critically: **every policy includes independent AI system
  certification**, informed by 500+ evaluations
  ([Armilla](https://www.armilla.ai/resources/armilla-launches-affirmative-ai-liability-insurance-with-lloyds-underwriter-chaucer) **[P]**).
- **Counterpart** — LA insurtech; expanded **affirmative AI coverage for small business** in
  November 2025 with an explicit Tech E&O insuring agreement and defined triggers for
  hallucination, misclassification and hiring bias — applying **whether the insured builds or
  merely deploys third-party agentic models**
  ([Counterpart](https://www.businesswire.com/news/home/20251121123510/en/Leading-Insurtech-Counterpart-Addresses-Critical-Coverage-Gap-With-Affirmative-AI-Coverage) **[P]**).
- HSB (Munich Re) also has affirmative AI E&O products.
- AI-governance tooling is a real but enterprise-shaped market; SME-focused analyses note that most
  governance platforms "were not built for SMEs" and that picking the wrong category "creates false
  security and real gaps" **[V]**.

> **The insight:** insurers are already *pricing* the evidence. The buyer of an evidence artefact is
> the underwriter and the broker, not the plumber. Selling governance software to a plumber does not
> work; reducing their premium does.

---

## 8. Supporting evidence for concept B (SMB as buyer)

- UK insurance customers overpay **£1.2bn/yr** in "loyalty tax"; home policies held 5+ years cost
  **~70% more** than new-customer equivalents; motor loyalists pay ~£85/yr more
  ([AnnualVault](https://www.annualvault.io/blog/loyalty-tax-insurance-uk) **[V]**, on the
  well-established [CMA/FCA loyalty-penalty work](https://www.gov.uk/government/publications/tackling-the-loyalty-penalty/tackling-the-loyalty-penalty) **[P]**).
- Business energy: contracts that lapse roll onto out-of-contract rates, which are materially
  higher. **2,790 brokers** are registered with the Energy Ombudsman's ADR scheme, serving 5.7m
  SMEs; uplift commissions typically **0.5–3p/kWh** (crisis-era Ombudsman cases at 4–7p) — on
  50,000 kWh/yr that is **£1,000–£2,500/yr** taken out of a small business, often invisibly
  ([meetgeorge](https://meetgeorge.co.uk/blog/state-of-business-energy-brokers-2026) **[V]**;
  [Ofgem State of the Market, Jan 2026](https://www.ofgem.gov.uk/sites/default/files/2026-01/State-of-the-Market-Energy-Retail-Highlights-January-2026.pdf) **[P]**).
- **Ofgem's Non-Domestic Market Review** now requires brokers to disclose commission on request and
  to show it on the contract — a regulatory tailwind for a transparent alternative **[S of P]**.
- The consistent causal explanation across sources is **inertia**, not ignorance: renewal is the
  path of least resistance.

---

## 9. What this research rules out

Worth recording, so nobody re-proposes them:

- **AEO / GEO rank tracking.** Crowded (Profound, Peec, Scrunch, Athena, and every SEO agency),
  measurement-only, and it sells a metric rather than an outcome.
- **`llms.txt` as a product.** See §6.1. Selling it is close to selling nothing.
- **An "AI receptionist" for SMBs.** Genuinely saturated — Bland, Retell, Vapi, Synthflow,
  Sameday, plus first-party features shipped inside Jobber and Housecall Pro. No entry point.
- **Agent-readiness auditing as a standalone business.** Already commoditising (ForkPoint), and
  it's a report, not a change. It is a fine *wedge* and a poor *product*.
- **Generic AI governance software sold to SMBs.** They will not buy it. See §7 for who will.

---

## 10. The five facts the product thesis rests on

1. The majority reader of a small business's website is now a machine, and that machine sends back
   almost nothing. (§1)
2. Every agentic commerce rail assumes a catalog; most small businesses sell quoted work. (§2, §3.1)
3. The buyer-side mandate has been built by Google, Visa and Mastercard. **The seller-side mandate
   does not exist.** (§3)
4. A machine-issued quote binds the business, and since 9 March 2026 the CMA holds the business
   liable for it at up to 10% of worldwide turnover — even if someone else built the agent. This is
   the barrier, and therefore the product. (§4)
5. Protocol volume is thin and will stay thin for a while, so whatever gets built must earn its
   living on today's channels — phone, web, email — with the protocol as the future-proofing. (§5)

---

*Compiled July 2026. Re-check §2 and §5 before quoting: this landscape is moving monthly, and the
protocol table in particular will be stale within two quarters.*
