# New product research — custody and conformity for software nobody can read

**Date:** 28 July 2026 · **Status:** research complete, go/no-go coverage analysis done,
no build started.

This document records a new-product research exercise: what to build outside Foundry
that benefits Gitwork, works for small business, is genuinely novel, and can be
subscribed to or white-labelled. It records **what was ruled out and why** as
carefully as what was recommended — most of the value here is the negative space,
because every obvious adjacent idea turned out to be crowded, free, or too early.

The full strategy plan lives outside the repo. This is the durable summary plus the
one piece of technical analysis that gates everything else (§4).

---

## 1. The recommendation in one paragraph

Build an **evidence-producing custody service** for software a business owns but
cannot read: one engine, one intake, two retainer tiers, all outputting a **dated,
versioned, independently-signed, continuously re-verified evidence pack that states
honestly what it did not check**. Tier 1 **Custody** ("adopt my app") sells to anyone
who owns software they can't assess — no EU nexus required. Tier 2 **Conformity**
adds the CRA/PLD paperwork for anyone shipping installable software into the EU.
**The scan is not the product; the signature is.**

Working name: **Hallmark** — an assay office does not make the silver, it tests it
and strikes a mark that carries legal weight. Keep the name in one `brand.ts`
constant so renaming is a one-line change (the Deck precedent, §30).

---

## 2. The finding the whole thing rests on

> **EU Cyber Resilience Act, Article 13:** a manufacturer must determine and publicly
> declare a support period — **minimum five years** — during which security updates
> are provided **free**, and must state it in the Declaration of Conformity and the
> user information.

**The law now mandates the maintenance retainer Gitwork already wants to sell.** Every
installable app placed on the EU market carries a legally binding five-year
security-maintenance commitment — including apps an agency built three years ago with
no retainer, and every Lovable/Bolt/Replit build that got wrapped and pushed to a store.

The CRA's scope is widely misread as "IoT". Per the Commission's own FAQs, **standalone
downloadable software is caught** — a mobile app from a store, a program downloaded
from a website, plus the backend it depends on. Browser-only SaaS is generally out.
**There is no SME or microenterprise exemption.** Penalties reach **€15m or 2.5% of
global turnover**.

### The dates

| Date | Instrument | What bites |
|---|---|---|
| **2 Aug 2026** | **EU AI Act Art. 50** transparency | Any SMB running a chatbot under its own name is the *provider*. The Digital Omnibus delayed Annex III high-risk to Dec 2027 but **not Art. 50**; only the 50(2) marking carve-out slips to 2 Dec 2026. Fines €15m / 3%. |
| **11 Sept 2026** | **CRA reporting live** | Actively-exploited vuln → **24h** early warning, 72h notification, 14d final report to ENISA + national CSIRT. ⚠️ ENISA's Single Reporting Platform was **still not live in late July 2026**. |
| **15 Sept 2026** | Cloudflare Monetization Gateway | Blocks AI training/agent bots **by default** on ad-supported pages for new domains. |
| **9 Dec 2026** | **EU PLD 2024/2853** | Software becomes a **product under strict, no-fault liability**. Micro/small firms may contractually exclude only *recourse* claims between operators (Art. 12(2)) — **never strict liability to consumers**. Hits UK firms trading into the EU. |
| **11 Dec 2027** | **CRA full application** | Essential requirements, SBOM, Annex II technical documentation, Declaration of Conformity, **CE marking**, VDP, documented update mechanism, 5-year retention. |
| 2026–27 | **UK Cyber Security & Resilience Bill** (Lords) | Pushes cyber clauses, questionnaires and audit rights **downstream onto small suppliers**. Plus CYBERUK 2026's **£90m** pledge naming Cyber Essentials the supply-chain baseline. |

The Commission published CRA guidance with **67 worked examples aimed at SMEs on
27 July 2026**. The market is being told to act now and has nothing to buy.

### Why the incumbents don't cover it

The CRA vendor landscape is **uniformly embedded/firmware/enterprise** — Cybeats,
Binarly, Finite State (binary composition analysis, UEFI/BMC/RTOS); CCLab, BearingPoint,
Accorian (consultancy); ScanDog, Mend, Cycode, Anchore (ASPM/SCA sold to orgs that
already have an AppSec function). The only thing aimed at apps is **CRA Experts** — a
content hub with a "CRA Compliance Manager" promised for 2026. A blog with a waitlist.

And **nothing currently attests to the software itself**: SOC 2 (£20–45k yr 1) attests
to organisational controls — a company can hold it over a 45%-vulnerable AI-generated
codebase. Cyber Essentials attests to IT hygiene. Escrow (Codekeeper $179/mo; **Escode,
ex-NCC, Manchester**) proves a deposit *builds*, not that it is *sound*. CISA's Secure
by Design pledge attests to **nothing** and buyers use it as a purchasing signal anyway.
SIG+TÜViT do it properly and price it out of reach.

### ⭐ The strategic asset: the UK Software Security Code of Practice

DSIT + NCSC, May 2025, co-sealed with the Canadian Centre for Cyber Security. **14
principles across four themes.** Voluntary, with a self-assessment form structured on
NCSC **Principles-Based Assurance**. Verified directly on the NCSC page: *"The NCSC and
DSIT are developing a certification scheme, the details of which are yet to be
published."* A **Software Security Ambassador Scheme launched January 2026 with
thirteen organisations**. Evaluation window open to **December 2026**.

A government standard in Gitwork's own jurisdiction with a template but no tooling, no
assessors and no scheme yet. **CRA is the commercial engine; the UK Code is the
assurance framing and the long game.**

---

## 3. What was ruled out, and why

Recording these so they are not re-proposed. Each was a live candidate.

| Ruled out | Evidence |
|---|---|
| **Another code/vibe scanner** | ~**$831m** raised across Semgrep/Socket/Aikido/Corgea/Jit/Pixee/DryRun; **Aikido $1bn valuation 14 Jan 2026**; **Tenzai $75m seed**; **Replit shipped its own Security Agent Apr 2026**; Lovable ships one in v2.0. Free OSS floor beneath. **Sell custody, not scanning.** |
| **GEO / AEO / AI search visibility** | Saturated. **Profound $96m Series C at $1bn, Feb 2026**; Scrunch $26m; **Adobe completed its $1.9bn Semrush acquisition 28 Apr 2026**. And cheap — Otterly $29/mo, Profound Starter $99. Not our competence. |
| **AI answer-accuracy monitoring** | **Profound launched FactCheck ~14 Jul 2026.** Category leader, two weeks ago. |
| **AI referral attribution** | **GA4 shipped a native "AI Assistant" default channel May 2026.** Platform filled the gap. |
| **Static "agent readiness" scoring** | **Cloudflare gives it away free** (17 Apr 2026). **Google shipped an "Agentic Browsing" category in Lighthouse 13.3 on 7 May 2026**, into the default config and PageSpeed Insights. Commodity twice over. |
| **WebMCP / agent-transaction layer** | Draft Community Group Report, not Standards Track. July 2026: *"close to zero deployment and not one mainstream AI agent that calls the tools."* Cloudflare found **fewer than 15 sites** with MCP Server Cards in a 200,000-domain sample. |
| **llms.txt as a product** | ~10% adoption, crawlers don't fetch it, 8 of 9 sites saw no traffic change, **Google's 15 May 2026 guidance says it isn't needed.** Half a day's work you include free. |
| **Agentic commerce (ACP/AP2/UCP) for SMB** | Platform-owned. AP2 went to FIDO Apr 2026; Shopify has Agentic Storefronts on by default. The SMB question is "which platform am I on". |
| **A consumer-visible trust badge** | A graveyard. TRUSTe settled FTC deception charges and killed its seal; Norton/VeriSign decayed; Google Trusted Stores discontinued. |
| **Another SOC 2 automation platform** | Vanta/Drata/Sprinto/Delve own it — and it doesn't attest to the software anyway. |
| **Accessibility overlays** | **accessiBe fined $1m by the FTC, Jan 2025**; ~22.6% of H1 2025 ADA filings targeted sites *already running an overlay*. The product is now the liability. |
| **Cookie consent / CMP** | Consolidated *and* unstable — Data Omnibus mid-negotiation, Cyprus Presidency withdrew its compromise text. |
| **E-invoicing / MTD / Digital Product Passport** | Real deadlines, wrong shape. France already certified **101 Plateformes Agréées**; MTD is a regulated accounting vertical; DPP lands on physical-goods makers. |

### The agentic-web thread resolves into Pulse check modules, not a new product

Real whitespace exists there, but every gap is a `pulse-checks/` module rather than a
company — worth logging as a Pulse backlog:

- **Which buyer-agents your own WAF blocked.** A firewall 403s upstream of robots.txt,
  invisible in any browser check — and Cloudflare's 15 Sept 2026 default flip makes it
  worse. *"You 403'd 340 signed agent requests last month, here are the three rules"* is
  a report nobody sells.
- **JavaScript-only rendering.** 500M+ GPTBot requests analysed with **zero evidence of
  JavaScript execution** — an SPA is blank to ChatGPT. We already have
  `spa_client_rendered`; it deserves promoting.
- **Machine-readability of the pages that earn money.** Adobe, 1T+ visits: product pages
  are the **least** readable at 66%, behind returns (82%) and FAQs (80%).
- **Where agents give up.** Pricing pages succeed only **79%** of the time and produce
  **77% of third-party citations**; one access error pushes third-party fallback from
  17% to 77% — *when your site fails an agent, the agent cites your competitor's G2
  listing.*

And the decisive negative: **OpenAI launched Instant Checkout 29 Sept 2025 and retired
it 4 March 2026**, pivoting to discovery-first. Walmart measured in-chat checkout
converting **~3× worse** than a click-through while ChatGPT drove **~2× the
new-customer rate** of search. Agentic **discovery** is real and converting
exceptionally well; agentic **checkout** has been tried and pulled. **Do not build for
agent transactions.**

---

## 4. Go/no-go: how much of the standards can the check registry actually evidence?

This is the gating analysis, run against the real registry (703 checks extracted from
`src/server/checks-registry.ts`, 26 categories).

### Registry shape

```
 85 SECURITY      71 CODE_QUALITY  52 PERFORMANCE   52 LEGAL       38 SAAS
 35 SEO           32 INFRASTRUCTURE 29 ACCESSIBILITY 26 APP_STORE  24 AUTHENTICATION
 23 GLOBAL_DIST   22 OBSERVABILITY 22 ROLES         21 MISSING_PAGES 20 TRUST_BRAND
 18 API_QUALITY   16 PAYMENTS      16 MOBILE        16 SECRETS_KEYS 15 EMAIL
 15 BUSINESS_OPS  15 VIBE_HYGIENE  14 STORE_LISTING 13 AI_READINESS  8 AEO   5 AI_SAFETY
```

### UK Software Security Code of Practice — 14 principles

✓ = strong machine evidence · ◑ = partial · ✗ = not observable from a scan

| # | Principle | | Evidence in the registry today |
|---|---|---|---|
| **Secure design and development** ||||
| 1 | Established secure development framework | ✗ | Organisational. Proxies only: `ci_cd_present`, `has_linter`, `has_tests` |
| 2 | Software composition / third-party component risk | ◑ | `has_manifest`, `dependency_audit_clean`, `dependency_vulnerabilities`, `has_dependabot`, `has_renovate`, `no_exposed_package_json_root`. **No SBOM artefact** |
| 3 | Testing before distribution | ◑ | `has_tests`, `has_e2e_tests`, `has_unit_test_config`, `has_coverage_config`, `github_code_scanning` |
| 4 | Secure by design and secure by default | ✓ | **Strongest area.** ~35 config checks (`csp_header`, `hsts_header`, `cors_not_wildcard`, `permissions_policy`, `no_mixed_content` …) plus the whole `SECRETS_KEYS` family incl. iOS/Android/Flutter token storage and password retention |
| **Build environment security** ||||
| 5 | Build environment protected from unauthorised access | ◑ | `commit_signing_enabled`, `repo_secret_keys`, `repo_env_committed`, `android_signing_credentials_committed`, branch protection |
| 6 | Changes to build environment controlled and logged | ✗ | Organisational |
| **Secure deployment and maintenance** ||||
| 7 | Distributing software securely | ◑ | Thin — only 3 integrity checks: `subresource_integrity`, `commit_signing_enabled`, `ext_update_url_https` |
| 8 | Published vulnerability disclosure process | ✓ | `security_txt`, `has_security_md` |
| 9 | Detect, prioritise and manage component vulnerabilities | ◑ | `dependency_vulnerabilities`, `github_code_scanning`, `has_dependabot`. **No CVE/KEV feed** |
| 10 | Report vulnerabilities to relevant parties | ✗ | Process. **Net-new** (the ENISA pack) |
| 11 | Timely security updates, patches and notifications | ◑ | `has_releases`, `release_automation`, `release_notes_page`, `has_changelog_file`, plus the release-hygiene families (`ios_release_logging`, `android_debuggable_release`, `flutter_release_logging`) |
| **Communication with customers** ||||
| 12 | Communicate support and maintenance levels | ✗ | **No check exists.** Net-new — and it is the CRA Art. 13 obligation |
| 13 | ≥1 year notice of end-of-life | ✗ | **No check exists.** Net-new |
| 14 | Communicate significant incidents | ◑ | `status_page` only |

**Result: 2 strong, 7 partial, 5 absent — 9 of 14 (64%) carry at least partial machine
evidence.** That clears the pre-registered kill criterion ("fewer than half → stop").

### CRA Annex I Part II — vulnerability handling (the operationally urgent half)

| # | Requirement | | Position |
|---|---|---|---|
| 1 | SBOM, machine-readable, ≥ top-level dependencies | ✗ | **Net-new, and it is the headline requirement** |
| 2 | Address and remediate without delay via security updates | ◑ | `pulse-agents/fix-agent.ts` already opens real PRs |
| 3 | Effective and regular security tests and reviews | ✓ | **The scan itself is this**, on the existing job spine |
| 4 | Publicly disclose information about fixed vulnerabilities | ✗ | Net-new |
| 5 | Coordinated vulnerability disclosure policy | ✓ | `security_txt`, `has_security_md` |
| 6 | Contact address for reporting | ✓ | `security_txt` |
| 7 | Secure distribution of updates | ◑ | `subresource_integrity`, `ssl_valid`, `ext_update_url_https` |
| 8 | Disseminate patches without delay and free of charge | ✗ | Process |

**Result: 3 covered, 2 partial, 3 net-new.**

### Verdict — GO, with the gap quantified

The registry **evidences the technical properties well and the process/communication
obligations not at all.** That is exactly the split the plan predicted, and the net-new
list is precisely the gap:

1. **CycloneDX SBOM generation + diffing** — the single biggest missing piece; it is
   CRA Part II point 1 *and* UK principle 2.
2. **A CVE/KEV feed scoped to actively-exploited** — the 24h trigger is *actively
   exploited*, not *any CVE*. **That distinction is the entire product**; getting it
   wrong drowns the client in false alarms.
3. **The artefact generator** — Declaration of Conformity, VDP, `security.txt`,
   update-mechanism doc, and the **declared support period with expiry alerts**
   (principles 12–13, CRA Art. 13 — currently zero coverage).
4. **The ENISA 24h/72h/14d submission pack.**

One notable adjacency: the `LEGAL` category already carries **52 jurisdictional
compliance checks across 18 jurisdictions** (GDPR articles 13/15/17/20/21/28/30/33,
CCPA/CPRA, LGPD, PIPEDA, PDPA, POPIA, APPI, PIPL, PIPA, DPDP, Australian Privacy Act)
— and **not one of them is CRA or PLD**. There is an `eu_ai_act_disclosure` check but no
CRA equivalent. The jurisdiction engine (`pulse-checks/jurisdictions.ts`) is the right
home for that work and it fails safe by design.

---

## 5. Why Gitwork, and the discipline that is the actual moat

- **703 deterministic checks** across web, web app, **iOS, Android, Flutter, Chrome
  extension**, repo, infra, payments, auth, email, API quality. Every competitor is
  single-surface.
- **The iOS (39) and Flutter (21) families already exist** (§34) with sampling, evidence
  models and validation against real client repos. App-shaped conformity is exactly
  where the CRA vendor market is empty.
- **Live probes that prove rather than infer** — Supabase RLS and Bubble Data API tested
  with a real read: GET only, `limit=1`, stop at first exposure, **unreachable ⇒
  SKIPPED, never PASS** (`docs/builder-platform-checks.md`).
- **The integrity discipline, learned the hard way.** §34/§35: a missing `GITHUB_TOKEN`
  turned *"we couldn't look"* into *"it isn't there"* and produced ~28 confident false
  findings against a repo that demonstrably had the files. The fix — confidence
  downgrades on thin coverage, declared blind spots, `repo_intelligence` naming *why*
  data is missing — **is precisely the property an attestation must have, and the
  hardest thing to retrofit.**
- **A remediation arm.** An attestation that finds problems is worthless without a fix
  path. `fix-agent.ts` opens PRs; `pulse-pricing.ts` turns findings into a
  rate-card-grounded priced proposal.

### The honesty constraints are the brand — non-negotiable

1. **"We couldn't look" must never render as "it isn't there."**
2. **Absence claims downgrade on thin coverage** and drop out of the score.
3. **Every attestation states what was not checked**, inside the artefact itself.

Two marketing constraints from the research: **no documented claim denial attributable
to AI-generated code was found** — the coverage-gap literature is advisory and
vendor-authored, so do not say insurers are denying claims. And two widely-circulated
figures need chasing to primary sources before any deck: the *"agent success drops
78%→42% on degraded accessibility trees"* study, and the vendor-published
Lovable/Escape vulnerability percentages.

---

## 6. Business model

**Sequence: direct first to validate, channel as the destination.**

- **Destination — white-label through UK MSPs and other agencies at £8–15 per monitored
  client per month.** 11,492–12,867 active UK MSPs, £51–52.6bn revenue (DSIT, 2025) — a
  reachable list; 5.5m UK SMBs is not. MSPs already spend £20–25/user/month on tooling
  and resell at £50–75. **You churn MSPs (40+ clients each), not SMBs** — SMB logo churn
  runs **4%/month ≈ 39%/year**, a 25-month life and ~£1,000 LTV, which is the arithmetic
  that kills agency-built SMB SaaS.
- **The analogue: AudioEye** — $41.2m ARR, 127,000 customers, **~$27/month ARPU**, and
  **59% of ARR through partners** (Q1 2026, public). The warning with it: 8% YoY growth,
  and one partner realigning moved 4,000 customers. Cap any single MSP at ~15%.
- **The multiplier: the Cyber Essentials practice model** — a £150–300/month retainer
  turns a ~£700 one-off into £2,500–4,300/year. **CRA Art. 13 makes that wrap statutory.**
- **Starting point — direct at £39–49/month** for Custody, a step up for Conformity, fed
  by the existing embed widget and Gitwork's own clients. Its job in year one is pricing
  signal, testimonials and logos. **Do not buy ads against it.**
- **Position as consolidating, never additive.** ~75% of organisations are cutting
  vendors toward 5–10. Enter as *"this replaces the six hours your engineer spends
  assembling the QBR pack"* — sell against **labour**, not licence.
- **Price flat, not metered.** SMBs want one number a month. Our AI cost discipline
  (light tier, always-on prompt caching, workspace-shared `AiResponseCache`, LOCAL
  provider) is what makes flat pricing safe; competitors will meter because they
  haven't done that work.

---

## 7. Next actions

### Stage 0 — free, time-limited, do regardless of everything else
1. **Apply to the Software Security Ambassador Scheme** and respond to the DSIT
   evaluation (closes Dec 2026). Thirteen organisations are in it. Being in the room
   while the certification scheme is designed is worth more than any feature.
2. **Legal advice on CRA manufacturer allocation for agency-built software.** The Art. 13
   carve-out for *"customised products individually adapted for a commercial user on a
   contractual basis"* may cover much agency work — but explicitly **not** where
   consumers are the end users. **This is the crux; it decides who the customer is.**
3. One call to **Escode** (Manchester). Escrow proves a deposit builds; this proves it
   is sound. Natural adjacency, warm local conversation.

### Commercial validation, before any code
4. **Five customer conversations** from our own client base — two founders who inherited
   a codebase, two agencies who hand over, one micro-PE buyer. Ask what they'd pay for a
   signed report, not whether they like the idea. **Ask each whether they ship into the
   EU** — that ratio is the best read on how to weight the two tiers. Fellas (three
   repos, a Flutter "Android app", environments switched by commenting out lines) and
   Big Wedge are live examples of the problem.
5. **Two broker conversations** — price the warranty risk before taking any on. BIBA's
   2026 accreditation push makes this timely and it costs a phone call.
6. **Two MSP conversations** — test £8–15/client and the "replaces QBR labour" framing
   now, so the Stage 3 console is built against real requirements.

### Engineering, only after the above
7. **Extract, don't fork.** `runLiteScan` (`src/server/pulse-lite/run-lite-scan.ts`, 191
   lines) is **Prisma-free and AI-free by design**; persistence lives one layer up in
   `pulse-lite/public-scan.ts`. **That is the seam.** Pull the engine + registry into a
   shared package consumed by both Foundry and the new product. **Do not copy 703 checks
   into a second tree** — `categories.reconcile.test.ts` only protects one copy.
8. Reuse wholesale: `url-guard.ts` (SSRF), `rate-limit.ts`, `turnstile.ts`,
   `kill-switch.ts`, the durable job worker (`src/server/jobs/`), the agent spine
   (`{curator,foreman,dispatch}/`), the embed widget, `ai-{provider,cache,usage,cost}.ts`.
9. **Multi-tenancy is the Stage 3 prerequisite.** The schema is multi-tenant; the
   **runtime is not** — `DEFAULT_WORKSPACE_SLUG` is referenced in **40 files**,
   `ensureBaseRecords()` module-caches one workspace, and there is **no
   `prisma.workspace.create(` anywhere in `src/`**. `Workspace.customHostname` (+ CNAME
   verification) is the routing primitive. Stages 1–2 ship as a **separate Docker Compose
   deployment** meanwhile.

### Kill criteria, written now while unemotional
- Fewer than 3 of 5 customer conversations produce a "yes, and here's what I'd pay" →
  stop at the intake report and keep it as a Launch Pad upsell, not a product.
- **Fewer than 2 of 5 clients ship into the EU → drop Conformity to the backlog and ship
  Custody alone.** Custody has no EU nexus, so it stands on its own.
- Ring-fence 2–3 named people (including the Islamabad studio) on a fixed monthly budget
  treated as a **cost line, not a P&L**, on an 18–24 month horizon. The documented killer
  of agency-built SaaS is the product being starved whenever services revenue wobbles.

---

## 8. Sources

Regulation — [CRA Art. 13](https://www.european-cyber-resilience-act.com/Cyber_Resilience_Act_Article_13.html) ·
[Commission CRA reporting](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting) ·
[CRA Annex I](https://www.cra-guide.com/cra/annex-i/) ·
[PLD 2024/2853](https://eur-lex.europa.eu/eli/dir/2024/2853/oj/eng) ·
[Gowling: PLD actions for UK businesses](https://gowlingwlg.com/en/insights-resources/articles/2025/what-are-the-key-actions-for-uk-businesses-in-new-eu-product-liability-directive) ·
[UK Software Security Code of Practice (NCSC)](https://www.ncsc.gov.uk/section/software-security-code-of-practice/overview) ·
[Software Security Ambassadors Scheme](https://www.gov.uk/government/publications/software-security-ambassadors-scheme/software-security-ambassadors-scheme) ·
[UK Cyber Security & Resilience Bill (Taylor Wessing)](https://www.taylorwessing.com/en/global-data-hub/2026/cyber-security/gdh---uk-cyber-security-and-resilience-bill)

Demand — [Veracode, Spring 2026 GenAI code security](https://www.veracode.com/blog/spring-2026-genai-code-security/) ·
[YC Requests for Startups](https://www.ycombinator.com/rfs)

Competitive — [Aikido $1bn valuation](https://en.wikipedia.org/wiki/Aikido_Security) ·
[Profound $96m at $1bn](https://fortune.com/2026/02/24/exclusive-as-ai-threatens-search-profound-raises-96-million-to-help-brands-stay-visible/) ·
[Adobe completes Semrush acquisition](https://news.adobe.com/news/2026/04/adobe-completes-semrush-acquisition) ·
[Cloudflare Agent Readiness](https://blog.cloudflare.com/agent-readiness/) ·
[FTC v TRUSTe](https://www.ftc.gov/news-events/news/press-releases/2014/11/truste-settles-ftc-charges-it-deceived-consumers-through-its-privacy-seal-program) ·
[Modern Retail: what went wrong with Instant Checkout](https://www.modernretail.co/technology/what-went-wrong-with-chatgpts-instant-checkout/) ·
[Forrester: state of agentic commerce mid-2026](https://www.forrester.com/blogs/the-state-of-agentic-commerce-in-mid-2026/)

Business model — [AudioEye Q1 2026 results](https://www.prnewswire.com/news-releases/audioeye-reports-record-first-quarter-2026-results-302770076.html) ·
[DSIT MSP market research 2025](https://assets.publishing.service.gov.uk/media/691331835dec0071ce496374/Research_on_the_managed_service_providers_market_2025.pdf) ·
[Cyber Essentials cost](https://www.isms.online/cyber-essentials/cost/) ·
[Building a Cyber Essentials practice](https://www.comparethecloud.net/articles/5-person-uk-msp-build-cyber-essentials-certification-practice-500-2000-per-assessment)

Insurance — [Munich Re aiSure](https://www.munichre.com/en/solutions/for-industry-clients/insure-ai.html) ·
[Mosaic × aiSure](https://www.mosaicinsurance.com/resources/press-releases/~/mosaic-partners-with-munich-res-aisure-to-provide-pioneering-coverage-for-ai-vendors/) ·
[GenAI provider indemnities cover copyright only](https://kempitlaw.com/insights/gen-ai-provider-indemnities-against-copyright-infringement-claims/)
