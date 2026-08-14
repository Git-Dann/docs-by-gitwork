# Pulse → production assurance: baseline, and the phased plan

> The programme brief asked for a move from `scanner → findings → score` to
> `asset → evidence → control → finding → risk → decision → remediation → verification`.
> This is the implementation baseline that work has to start from, what Phase 0 changed, and what
> each later phase actually has to touch — named by file and symbol, not by intention.
>
> **Read §1 before planning anything.** A large part of the brief describes work this repo has
> already done. Rebuilding it would be the most expensive possible mistake.

---

## 1. The brief is stale in eight places. Check before you build.

Traced against commit `734f58d` on 2026-08-13. Every row was verified in source, not inferred.

| The brief assumes | Actually |
|---|---|
| Status is `PASS/WARN/FAIL/SKIPPED` and needs a v2 union | **Already v2.** `PulseCheckStatus` (`src/types/pulse.ts:6`) has all nine members — `NOT_APPLICABLE`, `INCONCLUSIVE`, `ERROR`, `NOT_TESTED`, `EVIDENCE_REQUIRED` included — and they are a Prisma enum (`schema.prisma:2475`). |
| Evidence strength / confidence / severity need introducing | **Already on the row.** `PulseScanCheck` carries `confidence`, `confidenceReason`, `trustBucket`, `severity`, `evidenceStrength`, `scoreEligible`, `controlId`. |
| Scoring is naive and needs a v2 | **Already `pulse-score-v3`.** `score-breakdown.ts` applies severity weights (8/5/3/1/0 — exactly the brief's proposal), evidence multipliers, confidence multipliers, a `controlId` independence damper, per-category normalisation, and reports `completeness`/`lowerBound`/`upperBound`. |
| Low-confidence PASS inflates the score while low-confidence FAIL is dropped | **Symmetric, and tested.** The multiplier is applied before status is inspected (`score-breakdown.ts:127`). `audit-trust-regressions.test.ts:61` asserts a LOW PASS + LOW FAIL scores 50. The asymmetry that *does* exist is in `deriveTrustBucket` (a PASS returns before confidence is read) and feeds priority, alerting and the fix agent — **not** the score. |
| Workspace check config is display-only | **Fully live.** `pulse.ts:1022` loads it; `run-lite-scan.ts:93` applies it at ingest, before de-dup, persistence and scoring. |
| `skipUrlGuard` is a live SSRF bypass | **Removed** in `2f6782a` (2026-08-11). Both bypasses are gone; `run-lite-scan.ts:125` guards unconditionally. `CLAUDE.md:903` still documents the old signature — that line is stale. |
| The SSRF guard needs building | **Built and good.** `url-guard.ts` rejects credentials, non-http(s), `.internal`/`.local`/`.lan`/`.localhost`/`.home.arpa`, every private/reserved IPv4 range incl. `169.254.169.254` and CGNAT, non-global IPv6; validates **every redirect hop** (max 6); and **pins DNS** — `pinnedRequest` overrides Undici's `connect.lookup` so fetch cannot re-resolve. |
| Catalogue is ~1,641 checks | **1,645 rows, 1,645 unique, 0 duplicates** — 391 evidence controls (`Standards Verification`) + 1,254 executable, across 28 categories in 12 domains. Recompute, never quote. |

Two more worth knowing before you plan:

- **A Pulse Gate already exists**, as CI plumbing: `scripts/pulse-gate.mjs` posts to `/api/agents/pulse-scan` and exits non-zero on a CONFIRMED issue or a sub-threshold score. Phase 4 extends this; it does not start from nothing. See `docs/pulse-ci.md`.
- **`pulse-agents/orchestrator.ts` is dead code** and says so in its own banner. Do not "fix" it — `run-lite-scan.ts` is the live engine.

---

## 2. What Phase 0 changed

Four commits. No check key added, removed or renamed; no schema change; no API break. Only error
paths and boundaries moved — every genuine PASS/WARN/FAIL is byte-identical, pinned from both
directions by tests.

### 2.1 A failed probe no longer reports as a passing one

Four checks manufactured a PASS from a failed request. The worst,
`security-extended.ts` GraphQL introspection, read:

```ts
} catch { gqlIntrospectionOff = true; }   // → status PASS, "introspection appears disabled"
```

So any timeout produced a clean result about a control nobody tested. The same shape gave
"No obvious dangling CNAME records detected" from a failed CNAME lookup, "nothing blocks AI
crawlers" from an unreachable robots.txt, and a WARN about a missing AAAA record that may well
exist. All four now report `INCONCLUSIVE` via `probeInconclusive()` — excluded from both sides of
the score, counted against assurance completeness.

Root cause for the DNS cases was `checkDnsRecord` returning `[]` for both "no such record" and
"could not ask". **`resolveDnsRecord` now separates them**; `checkDnsRecord` delegates and is
unchanged for its 13 existing callers, which legitimately treat absent and unreachable alike.

> **The rule:** any check whose PASS rests on an *empty* or *absent* observation must use a
> collector that can report failure. A check whose PASS rests on a *positive* observation is safe
> with the collapsing helper.

### 2.2 Coverage loss is visible

- `pulse-scan.ts` wrapped `runExtendedChecks` in an empty catch. That function emits its own
  completeness row **from inside itself**, so a throw lost ~300 checks *and* the only record they
  were expected — while `url-checks` still reported COMPLETED. The catch now emits that row on the
  collector's behalf.
- `collectorCompleted()` was called on any settled promise. Both the browser and deploy agents
  catch their own network failures and resolve with an empty result, so a quota-exhausted
  PageSpeed run and an unreachable host were recorded as COMPLETED — the completeness check, whose
  entire job is to say *"these families are unknown, not passing"*, asserted the failures had
  succeeded. The agents now return `collectorError`, and **`collectorOutcome()`** holds the
  "settled is not succeeded" rule in one named place.

### 2.3 A check key can no longer be silently lost

`categories.reconcile.test.ts` guards one direction (emitted → registered). Two new guards close
the others, in `catalogue-compat.test.ts`:

- **registered → implemented**, so the Settings panel cannot advertise a control that never runs;
- **`catalogue-baseline.json` → registered**, so a key cannot leave without a `RETIRED_CHECKS`
  entry in `catalogue-compat.ts` naming a successor and a relationship (`SUPERSEDED_BY` ·
  `MERGED_INTO` · `SPLIT_INTO` · `ALIAS_OF` · `WITHDRAWN`).

`npm run pulse:catalogue` regenerates the baseline. `RETIRED_CHECKS` is empty and that is the
intended steady state.

> A `checkKey` keys every historical `PulseScanCheck` row **and** every `PulseCheckConfig` row a
> workspace has set (`@@unique([workspaceId, checkKey])`). Deleting one orphans a customer's own
> configuration, silently, because nothing recomputes an old scan.

### 2.4 The AI trust boundary reaches every call

`UNTRUSTED_DATA_POLICY` covered the synthesis call only. The discovery kit, the competitor
comparison (which had **no system prompt at all**, on either provider path), the vision agent and
the fix agent had none. All four now do; the policy is exported so there is one wording, and it
now names file contents, which it did not while the fix agent was reading them.

Two concrete holes closed with it:

- **`propose_fix` took a model-authored `filePath` and `createFixPR` PUT straight to it**, with no
  validation, while the same conversation carried files fetched out of the repository being
  assessed. `isWritableFixPath` rejects absolute paths, drive letters, URLs, `..` in either
  separator, `.git/**` and control characters — at *propose* time, so a rejected path never reaches
  the PR body. `.github/workflows` stays writable: the system prompt offers to create CI from
  scratch, and narrowing that is a product decision (see §4).
- The page `<title>` and `og:title` went into the prompt **uncapped** while the meta description
  was capped at 300 chars.

### 2.5 Check-config privilege gap

`DELETE /api/settings/checks/[checkKey]` had **no authorisation at all**, while POST requires
admin — so setting a policy needed admin and removing one needed nothing. Now gated identically.
Two UI claims that contradicted the code were corrected: disabled checks are not "skipped
entirely" (the detector runs, the verdict is replaced), and the severity override cannot "always
fail" (it only re-grades an existing WARN/FAIL and never touches a PASS).

---

## 3. The phases, tied to files

Ordered by dependency. Each phase is landable on its own.

### Phase 1 — evidence becomes data (`PulseScanCheck.evidence` is a string today)

The single highest-value structural change, and the prerequisite for the manifest, verification
and reachability work. Today `evidence` is free text; `collector-health.ts` already smuggles JSON
through it, which is the tell.

- Add `PulseEvidence` (additive table) keyed by `scanId` + `checkKey`, typed by variant:
  `SOURCE_LOCATION` (path/line/symbol), `HTTP_OBSERVATION` (url/method/status/header/value),
  `DNS_OBSERVATION`, `PACKAGE_OBSERVATION`, `MANIFEST_OBSERVATION`, `CI_OBSERVATION`.
- Start with the collectors that already have structured data in hand and stringify it:
  `web-repo-source.ts`, `ci-workflows.ts`, `security-extended.ts`, `native-repo.ts`.
- Keep `evidence: string` populated during the transition — 19 render sites read it.
- Redaction is a hard requirement: `pulse-agents/auth-content.ts` already has the only redactor in
  the tree (7 patterns). Promote it to a shared `redactEvidence()` before evidence is persisted
  more widely.

### Phase 2 — two persistence bugs that need a migration

Both were found in Phase 0 and deliberately not attempted without a database to verify against:

- **`completenessEligible` has no column.** It exists on `PulseScanCheckInput`
  (`types/pulse.ts:431`), is set only by `collector-health.ts:39`, and is dropped by
  `persistChecks`. So `computeScoreBreakdown` re-run over persisted rows yields a *different*
  completeness from the one stored at scan time.
- **`applyCheckPolicy` destroys the detector verdict.** It overwrites `status`/`detail` in place
  with no record of what the scanner actually found, so a stored scan cannot be replayed against a
  different policy or audited. Add `detectorStatus` / `detectorDetail` (nullable, additive) and
  write both; render the policy disposition as a separate fact, the way `ForemanFindingAction`
  already does for Foreman.

Also here: `PulseScanCheck` has **no unique on `(scanId, checkKey)`** — de-dup is in-memory only
(`run-lite-scan.ts:92`), so a retry that races can double-insert.

### Phase 3 — say what was expected, not just what was found

There is no expected-check manifest anywhere. `buildRepoCollectorPlan` is the only true
expected-vs-actual comparison and it covers repo collectors only. A check whose collector returned
`[]` contributes nothing to `unknownWeight` and is invisible to completeness — so an absent family
still reads as a complete assessment.

- Derive the expected key set from `CHECKS_REGISTRY` + `scan-execution-plan.ts` + the applicability
  filters (`platform-applicability.ts`, `getInapplicableCategories`).
- Diff it against the persisted rows; emit the difference as `NOT_TESTED`, which already lowers
  completeness correctly.

### Phase 4 — Pulse Gate as a decision, not a threshold — **SHIPPED**

`src/server/pulse-checks/release-decision.ts`. A versioned, explainable decision —
`READY` / `CONDITIONAL` / `BLOCKED` / `INCONCLUSIVE` — computed deterministically from the checks
and stored on the scan's `scoreBreakdown.gate`. Rendered above the report tabs, returned on the
agent verdict, and what `scripts/pulse-gate.mjs` now exits on. Operator guide: `docs/pulse-ci.md`.

**`INCONCLUSIVE` is the load-bearing state** — it is what stops a scan with 42% coverage and no
findings reading as a pass. Same precedent as Provenance's `INCOMPLETE` (`CLAUDE.md` §38): "could
not establish" and "is broken" are different facts with different fixes.

Five rules worth not undoing:

- **Precedence is `BLOCKED > INCONCLUSIVE > CONDITIONAL > READY`.** A confirmed blocker outranks
  thin coverage because it is knowledge rather than the absence of it. Saying "inconclusive" over
  a proven exposed `.env` would bury the one thing the scan is certain of.
- **Only `status === "FAIL" && trustBucket === "CONFIRMED"` may block.** Blocking a release on a
  heuristic is how a gate gets switched off and stays off.
- **But `CONDITIONAL` takes `LIKELY` failures too**, and the asymmetry with the rule above is the
  point. Blocking must be certain; a *reservation* does not have to be, because "we think this is
  failing" is what a reservation is. This inherited the confirmed-only filter at first, and three
  live sites were graded `READY` while failing `privacy_policy`, `terms_of_service` and
  `cookie_consent_granular` — every one a MEDIUM-confidence FAIL. LOW-confidence adverse checks
  stay out: they bucket as `INCONCLUSIVE`, and the score already treats those as unproven alarms.
- **Low health is `CONDITIONAL`, never `BLOCKED`.** A low score is debt spread over many controls,
  not a thing anyone can point at and fix before shipping. Blocking belongs to named failures.
- **A scan that did not finish can never be `READY` or `CONDITIONAL`** (`withScanIncomplete`) — but
  it keeps a `BLOCKED` it already earned. The failure this prevents is the quiet one: a scan
  errors, returns what it managed to collect, finds nothing wrong in it, and reports a pass.

The blocking list is deliberately short (six universal controls plus the policy's own). A blocking
list that grows to include everything important stops meaning "cannot ship" and starts meaning
"should fix", at which point the decision carries no information.

**Still open:** the three policies are in code, not per-workspace. Making them editable fits the
existing `Workspace.*Config` JSON pattern (`curatorConfig`, `foremanConfig`, `dispatchConfig`), and
`gatePolicyById` is the seam — but a customer-editable blocking list needs a UI that makes the
consequence of removing a control obvious, which is a design question, not a coding one.

### Phase 5 — finding lifecycle — **the correctness half is SHIPPED**

⚠️ **Grep before you build here.** A scan-to-scan diff already existed (`getScanDiff` in
`pulse.ts`), and it had exactly the defect this phase was written to prevent — twice, silently.
It now delegates to the pure, unit-tested `pulse-checks/scan-diff.ts`.

**The rule: a fix must be proven; a disappearance must not be mistaken for one.**

- **A previously-failing check that is MISSING from the current scan used to appear in no list at
  all.** Not fixed, not new, not regressed — unmentioned. That is what a scan looks like when a
  collector errors, a repo stops being reachable, or someone switches the check off. The finding
  was still true; the report simply stopped saying so. Fixed by walking the PREVIOUS scan's issues,
  a pass the old implementation did not have.
- **Any `status === "PASS"` closed a finding, at any confidence.** A LOW-confidence PASS is one the
  score itself declines to count. Letting it resolve a finding made it *more* powerful in the
  remediation flow than in the maths. `isProvenPass` requires HIGH or MEDIUM, and an unrecognised
  confidence value fails closed.

The new `unverified` bucket carries a typed `reason` — `CHECK_ABSENT` · `CHECK_DISABLED` ·
`NOT_APPLICABLE_NOW` · `PROBE_INCONCLUSIVE` · `PASS_NOT_PROVEN` — because *why* we stopped being
able to check is what a reader has to act on. `CHECK_DISABLED` exists specifically so that turning
a control off cannot be a way to make a finding go away quietly. `describeDiff` states the count
**even when it is zero**, so its absence never teaches a reader that silence means nothing went
missing.

`status` is nullable on `UnverifiedDiffItem` and nowhere else — the commonest case is a control
that produced no row, and a made-up status would be the fiction the bucket exists to prevent.

**Still to build:** durable finding identity across scans (`ACCEPTED_RISK` / `FALSE_POSITIVE` as
persisted dispositions rather than a per-diff computation), keyed on `checkKey` + asset.
`ForemanFindingAction` is the working precedent for read-time disposition, **including the rule
that a dismissal resurfaces when the metric worsens**. `PulseScan.previousHealthScore` and
`PulseMonitor.lastCriticalKeys` are the other existing seeds.

Accepted risk needs the full record: owner, approver, expiry, compensating control, scope. An
acceptance without an expiry is indistinguishable from a finding nobody looked at again.

### Phase 6 — assurance manifest

Only worth doing once Phases 1–3 land, because the manifest's value is naming what was *not*
verified. `provenance/digest.ts` already implements canonical serialisation + digest + HMAC seal,
with the honesty rule (no secret → `UNSEALED`, never a derived key). Reuse it; do not write a
second one.

### Phase 7 — external tool import (SARIF, CycloneDX, OSV/KEV/EPSS)

Nothing exists yet. The constraint that matters: an imported finding must retain its tool, tool
version, native rule id and native severity, and must never be presented as a Pulse-native result.

### Phases 8–12 — supply chain · AI agent assurance · customer-hosted collector · authenticated/tenant-isolation testing · continuous assurance

As the brief describes. Two notes from the trace:

- **AI Agent Assurance overlaps existing work.** `ai-app-safety.ts` (21 checks) and
  `ai-readiness.ts` (22) already exist. Extend, don't duplicate.
- **Authenticated testing has a live seam already**: `pulse-agents/auth-agent.ts` drives a guarded
  headless browser and `auth-content.ts` redacts what it captures. Tenant-isolation testing needs
  two identities, which is the actual blocker — not the browser.

---

## 4. Decisions taken, and what is still open

**Decided (Dan, Aug 2026) — closed:**

1. **The fix agent keeps writing `.github/workflows`.** A repo with no CI is one of the findings it
   exists to fix. The edge is real — repository file contents enter its context, so a
   prompt-injected repo could aim it at a workflow file — and it is held by four things, none of
   which should be removed without a replacement: the `isWritableFixPath` guard, the untrusted-data
   boundary in `FIX_SYSTEM_PROMPT`, a branch that is never the default one, and human review.
2. **Pillars ship.** `computePillarBreakdown` now renders as `NN // WHERE IT STANDS` on the report's
   Overview tab and drives the public badge's `card` bars. See `docs/pulse-pillars.md`.
3. **One scoring core.** The report's per-category fallback used a hand-rolled PASS=1/WARN=0.5 ratio
   under a comment claiming it matched `calculateHealthScore` — it weighted nothing. It now reads
   `computeScoreBreakdown`, as the headline, the pillars and the badge all do.

**Still open:**

4. **`GET /api/settings/checks` has no auth assertion** while POST requires admin. Tightening it to
   admin would remove read-only access from a Staff member granted `settings.agents`, which is what
   gates the page — so it is a decision about who may read the catalogue, not an oversight to fix
   blind.
5. **`support-analytics/types.ts:98`** does a raw `fetch` against a connector-supplied `baseUrl`
   with no SSRF guard. Outside Pulse, but it is the same class the guard exists for.
6. **`HARD_CRITICAL` (`priority.ts`) and `CRITICAL_KEYS` (`score-breakdown.ts`) disagree** about
   which checks are critical. Two lists, one concept.
7. **The 133 checks added in §37–§38 were validated against fixtures, not real repositories.**
   CLAUDE.md §34.3 records that validating a family against a real codebase is what finds the wrong
   ones — it caught four defects there that unit tests passed straight through. This is the highest
   -value work on the *product* rather than the plumbing, and it needs real repos and a
   `GITHUB_TOKEN`.

---

## 4a. Validate a check family against REAL code, not fixtures

**The single highest-yield thing in this programme.** In one session, pointing three families
at real code found three defects that their own unit tests passed straight through — because a
fixture agrees with its author by construction. This is `CLAUDE.md` §34.3's lesson, and §38
admits the 133 checks added in §37–§38 were never held to it.

What it found:

| Family | Defect | Consequence |
|---|---|---|
| `web-repo-source` | Three Prisma-only TypeScript routes reported as **SQL injection** | FAIL in Security → a **BLOCKED release** under the gate |
| `code-cleanliness` | The framework seam between two App Router handlers counted as duplicated logic | 58% of sampled files "duplicated"; the real copy-pasted helper buried |
| all source families | Coverage went **UP** on a truncated tree | Unfounded absence findings promoted into scored failures |

**`__tests__/real-corpus.test.ts` is now the standing guard.** It runs the source families over
this repository's own ~460 API route files — ordinary, heavily-reviewed Next.js code that is
definitively free of raw SQL, `eval`, shell building and committed credentials — and asserts no
FAIL. Any FAIL there is a false positive by construction. Both of the defects above make it go
red, with a message naming the cause.

It is the same idea as `audit:ui --self-test` (§31): prove the rule stays **quiet on the fix**,
not only that it fires on the defect.

⚠️ **When it fails, read the finding before touching the test.** Two very different things turn
it red and they need opposite responses — a rule that started firing on ordinary code (fix the
rule) versus someone genuinely introducing raw SQL into a route (fix the code). Narrowing the
corpus to make it pass is the one response that is always wrong.

**Corpora available without a `GITHUB_TOKEN`**, worth reaching for before asking for repo access:
this repo itself (a large TypeScript/Next.js app), `node_modules` (46 real published npm packages
with a `bin`, for the CLI family), and `vendor/bento` (a real vendored Vite app).

⚠️ **Know what a corpus cannot test.** The npm corpus produced two checks warning on 100% of
packages — but both read *repository* evidence (a root lockfile, CI workflows) that npm strips
from a published tarball. Neither was changed on that basis. A corpus that cannot express the
defect cannot verify the fix, and reading a 100% rate as a bug would have made both checks worse.

**Still unvalidated against real code:** desktop (Electron/Tauri), React Native, browser
extension, native Android, iOS, Flutter, API behaviour. Those need real repositories.

## 4b. Validate the URL families against REAL sites — the SPA fix that never ran

§4a pointed the *source* families at real code. Doing the same for the *URL* path — three live
AI-builder sites (two Lovable, one Bolt) — found a defect of a shape worth naming, because it is
not "a rule was wrong": **the rule was right, was unit-tested, and had never once executed.**

All three scans reported `spa_client_rendered` as a WARN — the detector fired correctly — and then
FAILed `has_word_count`, `has_heading_hierarchy` and `internal_links_present` **at HIGH
confidence** in the same scan. Verified by hand: one shell has 6 words, 0 headings and 0 links. The
whole point of `spa-detect.ts` is to stop precisely that, and it did nothing.

**Why.** `runUrlChecks` streams partial waves so the UI can fill in as results land. The wave path
applied the platform and jurisdiction filters; SPA reclassification happened once, on the final
return. And `runLiteScan`'s `ingest` keeps the **first** status it sees for a `checkKey` — so the
wave always won, and the corrected verdict was dropped without a word. Two code paths that were
supposed to agree, one of them carrying a correction the other did not.

The fix is structural, not a patch: **`finaliseUrlChecks` is the one pipeline both call.** A test
asserts `reclassifySpaChecks` is invoked in exactly one place and that both call sites route
through it. Reverting the emit wrapper to its old inline filters fails that test.

**Two related honesty changes came out of it:**

- **The reclassified status is `INCONCLUSIVE`, not `SKIPPED`.** SKIPPED means "does not apply" and
  leaves the denominator, so coverage kept reading 96% on pages whose content was never read. SEO
  applies perfectly well to a Lovable marketing page; Pulse just could not measure it without
  running JS. INCONCLUSIVE says exactly that, and is counted against completeness. On the three
  sites coverage moved **96% → 87–89%** while health moved 71 → 72: the honest direction on both.
- **`image_alt_coverage` reported PASS on zero images.** True of a text-only page and a lie about a
  shell whose images had not rendered — a control asserted satisfied by the absence of evidence
  (§35 again). Zero images is `NOT_APPLICABLE`; on a shell it reclassifies with the rest.

⚠️ **Removing three false failures exposed a real gate defect, which is the thing to expect after
any false-positive fix.** With those FAILs gone the gate flipped `CONDITIONAL → READY` — on sites
with **no privacy policy, no terms and no cookie consent**. The three false SEO failures had been
the only thing making the gate conditional. Cause: the `CONDITIONAL` branch inherited the blocking
rule's `trustBucket === "CONFIRMED"` filter, and all four real failures are MEDIUM confidence. Fixed
above; both sites are `CONDITIONAL` again, now for the four reasons that are actually true.

### 4b.1 The fix moved the dishonesty one layer out, into the public widget

Fixing the scanner changed what `/embed/pulse` shows, and the widget was not ready for it. Three
defects, all pre-existing, all made material by the reclassification — because the embed is aimed
at vibe-coded sites, so "we could not read the page" is its **normal** case, not an edge one.

- **`summarise()` dropped unresolved controls into no bucket at all.** It excluded only `SKIPPED`,
  so an `INCONCLUSIVE` check fell past every branch: absent from `pass`/`warn`/`fail`, still
  counted in `totalChecks`, and still creating an all-zero category row. Tolerable at ~5 per scan;
  not at ~28. It now counts them, excludes `NOT_APPLICABLE` too, and `else continue`s on any status
  nobody has taught it about rather than inventing a bucket.
- **A category where nothing resolved rendered 100% and a full green bar.** `total > 0 ? … : 100`
  — a perfect score awarded for measuring nothing, which is this programme's founding defect in a
  UI component. It reads `NOT ASSESSED` in neutral grey now.
- **The widget's `Check.status` union listed four of the nine statuses.** It is a `fetch` response,
  so TypeScript could never catch the drift. **Narrowing a wire type to the cases you happen to
  handle is a lie the compiler cannot check** — worth remembering anywhere a client mirrors a
  server DTO by hand.

The visitor is now told, with the findings rather than buried: *"N checks couldn't be assessed"*,
and when `spa_client_rendered` fired, why — their content is JavaScript-rendered, the checks are
inconclusive rather than failed, and either way they are not in the score.

**Still unvalidated against real sites:** every URL family other than these three shells — and
notably, a *server-rendered* site, where the reclassification must stay off. Actively probing
strangers' live apps is a decision for the account owner, not the scanner: `api-behaviour` performs
CORS reflection, TRACE and GraphQL introspection probes.

## 5. Verification honesty

Everything above was verified by `npm run verify` (tsc + lint 0 errors, **2,072 tests**,
`audit:ui` 0 findings with its self-test passing) and `npx next build`.

**Nothing was run through the product.** `/app` is auth-gated and there is no local database, so no
scan was executed end to end through the UI, no model call was made, and the reply paths were not
exercised against real data.

⚠️ "There is no staging" was doing more work in that sentence than it should have — **a Vercel
branch preview does exist and is reachable** (corrected in `docs/build-checklist.md` §4). It does
not make `/app` visible, but it does mean the public Pulse surfaces on this branch could be checked
at runtime, which is a smaller gap than "we have no environment" implies. `POST /api/public/pulse/scan`
was deliberately NOT run there: it permanently burns an email's free scan, writes a `PulseLead` and
notifies admins, which is not a side effect to incur for a self-check.

**The URL scanner itself, however, was run against live targets** — §4b. `runLiteScan` needs no
database, so a throwaway harness calling it directly is a genuine end-to-end exercise of the URL
collectors, the trust layer, the score and the gate. That is what found the SPA defect, and it is
the cheapest real verification available on this branch; reach for it before assuming a URL-path
change is only unit-testable. It still says nothing about persistence, the report UI or the AI
phase. Post-deploy, the checks worth making in order:

1. Scan a URL whose DNS is unreachable and confirm `ipv6_dns_record` and `subdomain_takeover_risk`
   report **Inconclusive**, not a pass or a warning.
2. Scan with `GOOGLE_PSI_API_KEY` unset or over quota and confirm the collector-completeness check
   reports **ERROR** naming `browser-agent`, rather than PASS.
3. Disable a check in Settings → Checks, re-scan, and confirm it persists as `NOT_TESTED` and the
   score is unchanged.
4. As a non-admin, `DELETE /api/settings/checks/<key>` and confirm a 403.
5. Run the fix agent against a repo and confirm the PR contains only repo-relative paths.
6. Scan a Lovable/Bolt URL **through the app** and confirm the streamed checks arrive already
   reclassified — the SEO content checks should read Inconclusive as they land, never flash a red
   FAIL first. The bug in §4b lived entirely in the streamed path, so watching the final state is
   exactly what would miss its return.
7. Scan a server-rendered site and confirm those same checks still report normally. The
   reclassification must be off by default; a fix that made every scan inconclusive would look
   identical in the numbers.
