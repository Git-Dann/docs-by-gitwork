# Provenance — the attestation layer

> **Status:** MVP shipped July 2026. Engine + register + public certificate are live; the
> continuous re-examination agent and the white-label issuer tier are the next two phases.
>
> **What it is in one line:** every other tool in this market produces a *report for the
> owner*. Provenance produces a **signed, expiring attestation for the counterparty** — the
> client, insurer, acquirer or procurement officer who did not build the software and
> cannot read code.

---

## 1. Why this exists

### The market gap

Software is now largely written by machines, and the human trust rituals that used to
stand behind it — a developer you know, a portfolio, a reference, a handshake — have
broken with nothing machine-native replacing them. The evidence is not marginal:

| Finding | Source |
|---|---|
| 1,072 vibe-coded production apps scanned: **98% had security flaws, 16% critical**. 300+ exposed database keys in client-side JavaScript; 172 allowed anyone to delete data unauthenticated | [Symbiotic Security](https://www.symbioticsec.ai/blog/we-scanned-1-072-vibe-coded-apps-98-had-security-flaws) |
| 50 hand-audited apps (Cursor / Lovable / Bolt / v0): **88% had Supabase row-level security entirely disabled** | [SecurityWeek](https://www.securityweek.com/vibe-coded-apps-riddled-with-exploitable-security-flaws/) |
| Lovable: **170+ of 1,645 databases fully exposed**, 18,697 user records in one app, a 48-day exposure window | [VibeEval](https://vibe-eval.com/updates/lovable-security-report-feb-2026/) |
| 623M real code changes analysed: duplication **+81%**, error-masking **+47%**, refactoring **−70%**, legacy maintenance **−74%**, two-week churn **+15%** | [GitClear / GitKraken](https://www.gitclear.com/the_ai_code_quality_maintainability_gap) |
| CVEs attributable to AI-generated code: **6 in January → 35 in March 2026** | [DevelopersGlobal](https://medium.com/developersglobal/the-vibe-coding-security-gap-9a1c3fb7fecf) |
| 45% of AI-generated code samples fail basic security tests | [Veracode GenAI Code Security Report](https://www.ox.security/blog/vibe-coding-security/) |

Meanwhile the person paying for the software has no instrument at all. The best advice on
offer to a non-technical buyer is literally *"ask the developer what edge cases it doesn't
handle"* ([Percolator](https://percolator.substack.com/p/the-non-technical-founders-guide)),
and the professional alternative — technical due diligence — is a
**$8k–45k/year enterprise product** sold to acquirers, not to the plumber who paid £8k for
an app ([Sprinto](https://sprinto.com/blog/due-diligence-software/); DiliTrust $15–75k,
Drooms $10–50k).

### Why an attestation and not another scanner

**Scanning commoditised to free during 2026.** In the adjacent agentic-web space there are
already several no-signup 15-second scanners ([Agent Ready](https://agent-ready.dev/methodology)
at 68 checks, [AgentGrade](https://agentgrade.com/agent-readiness),
[WebMCP Validator](https://webmcpvalidator.com/)), and in this space
[VibeAppScanner](https://vibeappscanner.com/vibe-coding-security-statistics), OX, Snyk and
Semgrep all overlap. Selling "a scan" into that is selling a race to zero.

What has *not* commoditised is **standing behind a measurement**. Nobody is certifying, and
nobody is carrying the epistemic discipline that certification requires.

### The proven commercial model

**Cyber Essentials** is the same shape at the same price point and audience: past its
[200,000th certificate](https://www.ncsc.gov.uk/files/Cyber-Essentials-brochure.pdf), with
**69% going to micro and small organisations**, growth driven almost entirely by being
*mandated in contracts*, delivered through **~290 licensed assessment bodies**
([IASME, April 2026](https://synergitech.co.uk/blog/cyber-essentials-certification-guide-uk-2026/)).
That licensed-issuer network is the white-label channel, proven at national scale.

The market it disrupts is **software escrow — $8.53B in 2026 → $23B by 2035**
([Business Research Insights](https://www.businessresearchinsights.com/market-reports/software-escrow-services-market-117921)),
whose entire value proposition is third-party verification, sold enterprise-only and
statically by NCC Group and Iron Mountain. Analysts note providers are already trying to
move toward "continuous verification" — they will do it top-down and expensively.

### Three forcing functions with dates

- **EU Cyber Resilience Act** — exploited-vulnerability reporting from **11 Sept 2026**,
  full technical requirements **11 Dec 2027**, applying to *any* software placed on the EU
  market ([European Commission](https://digital-strategy.ec.europa.eu/en/policies/cra-summary))
- **Cyber insurance has gone evidence-based** — carriers now run external scans and
  "automated control attestation through partner platforms"; documented controls earn
  **10–25% credits**, missing ones add 25–50% or disqualify
  ([Consilien](https://consilien.com/news/cyber-insurance-requirements-2026-checklist))
- **Courts are treating deployed AI as the business's electronic agent**, binding the
  business to what it says ([Bulldog Law](https://www.thebulldog.law/business-liability-for-ai-hallucinations-defense-strategies-when-artificial-intelligence-gets-wrong))

### Why Gitwork can build this and a competitor cannot

Certification lives or dies on one property: **never claiming what you did not check.**
Foundry has already solved that, painfully, inside Pulse:

- **§34.2** — the confidence model: presence is sound on a sample, absence is not; a
  LOW-confidence adverse finding is excluded from scoring as "an unproven alarm".
- **§35** — the lesson in one sentence: *"a check built on `safeGithubRequest` converts
  'we couldn't look' into 'it isn't there'."* A scan once reported ~28 confident
  "missing X" findings having read nothing at all.
- **§37** — SKIPPED-not-FAIL: a scan that could not run a check family must not be graded
  as though the family failed.

Every free scanner on the market still has the bug Foundry found and fixed in itself. That
is a discipline gap, not a feature gap, and it does not get copied in a quarter. Provenance is
that discipline pointed at a third-party reader.

Add the naming: Foundry → **provenance record** → **countermark**. Metal goes to the examination office,
is tested, and is struck with a countermark that travels with the object forever and tells any
future buyer what it really is. UK countermarking is a ~700-year statutory consumer-protection
regime. Nobody in software uses it.

---

## 2. The revenue shape

| Moment | What is sold | Notes |
|---|---|---|
| **Issue** | A Countermark at a point of commercial consequence — handover, final invoice, insurance renewal, acquisition, procurement | Per-attestation fee. Gitwork's own handovers are the first ones. |
| **Maintain** | Continuous re-examination so the mark stays valid instead of lapsing | The subscription. Works *because* marks expire — see §4. |
| **Issue rights** | Licensed-issuer white label: agencies, MSPs, freelance platforms and AI-builder platforms strike marks under their own brand | The Cyber Essentials model. Phase 3. |

It also feeds the agency directly: a mark that comes back `NOT_CERTIFIED` on C1 is a scoped
remediation job, and Docs already turns that into a proposal.

---

## 3. Architecture

```
Pulse scan (819 checks, deterministic, confidence-annotated)
        │
        ▼
src/server/provenance/evaluate.ts     ← PURE. checks + standard → clause verdicts, grade, blind spots
src/server/provenance/standard.ts     ← SAS-1: the published, versioned clause set
src/server/provenance/lapse.ts        ← PURE. validity window, lapse/revoke/supersede precedence
src/server/provenance/digest.ts       ← canonical serialisation → sha256 digest + HMAC seal
        │
        ▼
src/server/provenance/issue.ts        ← the only Prisma file: issue / list / get / revoke
        │
        ├── /app/provenance                 the internal register (module perm `provenance`ssay`)
        └── /countermark/[token]          the PUBLIC certificate — no auth, noindex
```

**The Countermark row is frozen and self-contained.** `clauses`, `blindSpots`, `coverage`,
`standardVersion` and `checkCount` are snapshotted at issue; `scanId` is a loose indexed id,
not a foreign key. Same precedent as Docs (`formSnapshot`, so editing a template never
rewrites a document already sent) and `ForemanRun` (frozen findings). An attestation whose
contents change when the scan is re-run is not an attestation — someone accepted delivery
on that text.

### The verdict rules

| Condition | Clause verdict |
|---|---|
| Every covering check passed | `MET` |
| An adverse check at HIGH or MEDIUM confidence | `FAILED` |
| A proven warning, nothing failed | `QUALIFIED` |
| Every covering check SKIPPED | `NOT_APPLICABLE` |
| **No covering check ran at all** | `UNPROVEN` |
| **Only LOW-confidence adverse signals** | `UNPROVEN` |

| Condition | Grade |
|---|---|
| A critical clause `FAILED` | `NOT_CERTIFIED` |
| A critical clause `UNPROVEN` | **`INCOMPLETE`** |
| Non-critical failures or any `QUALIFIED` | `CONDITIONAL` |
| Everything applicable `MET` | `CERTIFIED` |

`INCOMPLETE` is the load-bearing one. *"We could not check this"* and *"this is broken"* are
different facts with different fixes, and conflating them is the defect the whole product
exists to avoid.

### Digest vs seal — they are not the same thing

- **digest** — SHA-256 over a canonical serialisation. Proves the contents were not altered.
  Needs no secret; anyone can recompute it from what the certificate prints.
- **seal** — HMAC-SHA-256 over the same canonical form, keyed on `PROVENANCE_SIGNING_SECRET`.
  Proves *we* issued it.

A digest alone is worthless against forgery — an attacker who edits the contents recomputes
it. With no secret configured, `seal` is `null` and the certificate says **UNSEALED**. There
is deliberately **no fallback to a derived key**: a seal anyone can reproduce looks identical
to a real one while proving nothing, which is the §35 failure wearing a padlock icon.

`verifyAttestation` distinguishes `UNVERIFIABLE` (seal present, no key here to check it)
from `TAMPERED`. Reporting a rotated key as forgery would cry wolf over a config change.

---

## 4. Why marks expire, and why that is the product

A countermark that never expires is a lie about software: the artifact gets commits, its
dependencies acquire published vulnerabilities, its certificate expires. So SAS-1 carries a
window — **90 days certified, 30 days conditional** — and a shorter window for
`NOT_CERTIFIED`/`INCOMPLETE` (those marks still need to exist and be citable, e.g. in a
dispute, but should go stale fast).

Four end-states a reader must be able to tell apart, in precedence order:

| Status | Means |
|---|---|
| `VALID` / `EXPIRING` | The mark stands. `EXPIRING` is a nudge, not a caveat. |
| `LAPSED` | Time ran out. **Says nothing about the software** — nobody re-checked. |
| `REVOKED` | The issuer withdrew it. Something was found to be wrong. |
| `SUPERSEDED` | A newer mark exists. Read that one. |

`REVOKED` outranks `LAPSED` deliberately: "we withdrew this" outranks "it would have run out
anyway" for anyone who relied on it. Merging the two would let a withdrawn mark read as
merely stale, which is what makes a certification scheme worthless.

**Revocation is a state change, never a delete.** `PATCH`, not `DELETE`. Deleting the row
would 404 the certificate URL, which reads to whoever holds it as a broken link rather than
as a withdrawal — so the one thing revocation exists to communicate would be the one thing
it fails to say.

---

## 5. Operating it

### Environment

```bash
# 32+ bytes. Without it every mark is issued UNSEALED and the register warns before you issue.
PROVENANCE_SIGNING_SECRET="$(openssl rand -base64 32)"
```

**It is already wired into the managed secrets sync** in `.github/workflows/deploy.yml` (§35),
so there is no SSH step: add `PROVENANCE_SIGNING_SECRET` as a **GitHub Actions repository secret**
and re-run the deploy (`workflow_dispatch` is enabled for exactly this). The deploy upserts it
into the VPS `.env` and force-recreates the app container so it takes effect.

An unset secret is a **no-op, not a broken deploy** — `upsert_env` leaves `.env` untouched on
an empty value, and Provenance degrades honestly to UNSEALED. So adding it later is safe.

⚠️ **Rotating this secret makes every previously-issued seal report `UNVERIFIABLE`.** The
digest still verifies, so contents are still provably unaltered, but authenticity can no
longer be confirmed. Treat it as a long-lived key.

### Permissions

| Id | Category | Default | Meaning |
|---|---|---|---|
| `provenance` | **feature** (admin-only) | off | Read the register at `/app/provenance` |
| `provenance.issue` | action, **high-risk** | off | Strike and revoke marks |

Split on purpose: reading the register is a different act from certifying, and the issuer's
name goes on the certificate.

⚠️ **`provenance` is a `feature`, not a `module`, and that is load-bearing.**
`DEFAULT_ROLE_PERMISSIONS` grants STAFF `...MODULE_IDS`, so *any* module id is auto-inherited
by every Staff member — which is how Provenance briefly shipped visible to all Staff. A `feature`
defaults off for everyone except ADMIN (holds all ids) and SUPER_ADMIN. Same trap DevSignal
documents and the same fix applied when Study was demoted (§26). If Provenance is ever promoted
back to a top-level sold product, changing it back to `module` is a deliberate decision to
expose it to Staff.

### Where it lives

**Settings → Labs** (Super Admin), not the sidebar — it is an experiment, and §4a is explicit
that `/app/<name>` with a sidebar item is for a main product. The route and the module gate
are unchanged, so a deep link still works and still gates.

### Post-deploy verification (the app is auth-gated with no staging, so this is manual)

1. Set `PROVENANCE_SIGNING_SECRET`, redeploy, open `/app/provenance` — the amber "sealing is not
   configured" banner should be **absent**.
2. Run a Pulse scan to `COMPLETED`, then **Strike a countermark**.
3. Open the certificate link in a private window (proves no-auth access) and check:
   - the grade and its reason read correctly;
   - **`02 // WHAT THIS MARK DOES NOT ESTABLISH` is populated** — it should never be empty,
     because `RUNTIME_NOT_PROBED` is unconditional;
   - the seal line says *"Contents verified against the issuer's seal."*
4. Revoke it with a reason. Reload the public link: it must still resolve, report **Revoked**,
   and show the reason.
5. Strike a second mark for the same subject; the first should report **Superseded**.
6. `npm run audit:clipping https://foundry.gitwork.co.uk/countermark/<token>` at
   390 · 768 · 1280×620 · 1440 — this page is public, so it *can* be driven headlessly once a
   real mark exists.

---

## 6. Deliberately deferred

- **Rename the physical table.** The Prisma model is `Countermark` but the table is still
  `Hallmark` via `@@map` (and `HallmarkGrade` for the enum). Renaming a model renames its
  table, which Prisma reads as a DROP — and the build's guarded `prisma db push` would then
  skip the *entire* sync (§2's all-or-nothing footgun), leaving the table uncreated and every
  Provenance route erroring. `@@map` made it a pure code rename with no manual DB step. Fixing the
  physical name properly is a `prisma migrate` job, not a hand-run `--accept-data-loss` push
  someone can forget.
- **Commit pinning.** `subjectCommit` is written as `null` because `PulseScan` does not
  record the SHA it read. Recorded as null rather than guessed — a certificate must not imply
  a precision it does not have. Threading the SHA through the code agent is the single
  highest-value next change: without it a mark names a repo, not a version.
- **Continuous re-examination.** The `CuratorRun`/`ForemanRun` job + cron spine is right there; a
  `COUNTERMARK_RECHECK` job that re-scans and re-issues before expiry is the subscription.
- **Licensed issuers (white label).** Needs an issuer record, per-issuer branding on the
  certificate, and a public issuer directory so a reader can check the issuer is real.
- **A public standard page.** `SAS-1` should be readable at a stable URL so a contract can
  cite it. Today the certificate carries the summary and the clause text.
- **Docs integration.** A handover document should be able to embed its countermark, and the
  e-sign flow should be able to require a live mark before acceptance.
- **Runtime probing.** The certificate states this limit explicitly and unconditionally: Provenance
  inspects code, configuration and public responses. It does not sign in, exercise payments,
  or attempt cross-account authorisation breaches.
- **Insurer / marketplace API.** The obvious distribution channel given evidence-based
  underwriting, but it needs a partner before it needs code.

---

## 7. Naming

`Provenance` (the instrument) and `Countermark` (the artifact) are one constant each — the product
name lives in `SAS_1.label`, the module label in `PERMISSION_CATALOG`, and the route is
`/app/provenance`. Renaming is cheap and deliberate, following the Deck precedent (§30: "the
product name is one constant in `brand.ts` if Deck isn't the final call").
