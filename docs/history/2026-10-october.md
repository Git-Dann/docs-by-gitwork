# October 2026

Foundry by Gitwork — what changed, and what it cost to learn. Split out of `CLAUDE.md`
so the rules stay small enough to read. The section numbers are unchanged, because the code
cites them: 939 `§N` references across 496 files, 277 of them spelled `CLAUDE.md §N`.
`CLAUDE.md` indexes every section here.

---

## 56. Recent Changes (October 2026) — An iOS link is reported as an iOS app

Dan, after an App Store scan of Beyond Nutrition UK came back as a website: *"when I give
you a ios link, we report it as an ios link, when android we report android, that's why we
have the tabs."* He was right on every count, and the cause was not one bug but the same
missing fact at six layers.

### 56.1 What a store link used to become

| Layer | What it did | Why it was wrong |
|---|---|---|
| Form | Platform left on its default, **Web app**; name `apps.apple.com` | The link says what it is; the picker was a default |
| Scan record | `platform: WEB_APP` stored | Benchmark segment, AI prompt and report all read it |
| Gate | Judged by the **website** `launch-ready` policy, which requires `url-checks` | A listing runs none of them, so the only possible answer was "INCONCLUSIVE — scan the product's own URL" |
| AI prompt | `Platform (declared by client): WEB_APP` | The write-up recommended security headers and SEO for an iOS app |
| Coverage note | "You scanned this as … none of that is visible from a URL" | Read as though the user had picked the wrong input |
| Store checks | Keyword searches over the whole page | See 56.3 — they passed for every app |

### 56.2 One rule, used everywhere — `src/lib/pulse-store-url.ts`

Framework-free, so the client form and the server import the same function and cannot
disagree. `detectStoreTarget()` decides by **host**, never substring — the old
`url.includes("apps.apple.com")` sent `https://example.com/?next=apps.apple.com` down the
store path and skipped every website check on a website. `resolveScanPlatform()` lets a
store link override the picker (the link is a fact, the picker a default) and leaves
every other URL with the user's choice.

Consumers: the form (the platform select is replaced by a fixed "Scanning as **iOS app** ·
from its App Store listing" readout), `createPulseScanRecord` + `runAnalysis` + the AI
re-analysis path (stored and run as IOS_APP / ANDROID_APP), `analyseWithClaude` (told it is
an app's listing and not to recommend website fixes), the scan list (the line reads
"iOS app · App Store listing", URL in the tooltip), the results hero (a **Platform** row),
the agent pipeline ("Store listing", not "Infrastructure"), and the MCP verdict (new
`subject: { platform, label, name }`, and the summary leads with it).

**Naming.** A name Pulse invented — the store host, or the slug-derived provisional name —
is replaced by the store's own name once the listing is read; a name the user typed never
is. ⚠️ The provisional comparison is **case-sensitive**: "Beyond Nutrition UK" slug-cases to
"Beyond Nutrition Uk", and compared case-insensitively the app's true name matched its own
placeholder and was discarded. A test caught that, not a reading.

### 56.3 The store checks measured nothing — `src/server/pulse-checks/store-listing.ts`

Every store check was `lower.includes(…)` over the whole listing page. Apple's page contains
"Ratings & Reviews" (a heading), "age" (inside "language" and "image") and "screenshot" on
**every** listing, so those checks passed for any app that exists. The subtitle check passed
when the title contained " - ", and Apple's title always ends " - App Store". That is how a
listing scored 98–100 whatever the app was like.

Both stores ship the listing as structured data in the page: Apple's `serialized-server-data`
view model plus a schema.org `SoftwareApplication` block; Google's `SoftwareApplication`
block plus labelled regions (description, screenshots, Data safety, the privacy-policy
link). The checks now read named fields and declare **HIGH** confidence for it. Two traps,
each with a test:

- **Apple's page carries other apps' data.** The "you might also like" shelf has its own
  subtitles; only the listing's own `lockup` is read.
- **Apple shows the category where a subtitle would be.** A subtitle equal to the genre is
  no subtitle — Beyond Nutrition's slot reads "Health & Fitness".

⚠️ **An unreadable listing is INCONCLUSIVE, never SKIPPED.** SKIPPED means "does not apply",
which the gate and the score both exclude — so an unreadable listing reported that way
would pass the gate on `store_page_live` alone, having read nothing.

New check `store_privacy_policy_owner` (MEDIUM, WARN-at-worst): compares the policy's
domain with the publisher's name. It is a heuristic and its wording says so. Unsourced
claims in the old copy ("can increase install rates by 20–35%", "this will block App Review"
on an app that is already live) were removed.

**What the real listings say**, verified against the live pages, for the record:

| | iOS | Android |
|---|---|---|
| Publisher | BEYOND NUTRITION UK LTD | **Trainerize CBA-STUDIO** |
| Rating | 5.0 from 11 | none shown |
| Privacy policy | trainerize.com/privacy.aspx (≠ publisher) | trainerize.com/privacy |
| Notable | no subtitle, no preview video, copyright "© 2026 ABC Trainerize" | short description "Fitness App", Data safety: **"Data can't be deleted"** |

### 56.4 A store link is judged as the app it lists — `release-decision.ts`

New policies **`ios-app-listing`** and **`android-app-listing`**: block on the listing being
gone, on no privacy policy, and on a missing App Privacy / Data safety declaration (each
enforced by the store itself); require the new **`store-listing`** collector. The label —
"iOS app · App Store listing" — is the scope: READY means the *listing* meets the bar. The
app's code is not in scope, and the coverage check says so in words about the app.

`resolveGatePolicy({ policyId, targetUrl })` is the only way a policy is chosen — the scan,
the agent verdict and the report's fallback all call it, or one scan gets two answers
depending on who asked.

Two gate fixes that apply to every policy:
- **A required collector that was never recorded no longer reads as present.** Coverage now
  records `completedNames`; a required collector absent from it is missing. Before, a
  collector the scan never ran appeared in no list and was indistinguishable from success.
- **The reason says why.** `failedDetails` carries a failed collector's own words, so a
  rate-limited store reads "Apple rate-limited this scan (HTTP 429)", not "did not run".

### 56.5 Verified / not verified

`store-link-platform.test.ts` (35 tests) replaces `store-listing-honesty.test.ts`, built on
two real listings captured 2026-09-30 (`__tests__/fixtures/*-store-beyond-nutrition.html`,
trimmed, structure intact). Expected values were read off the live pages by hand, not from
the code under test.

**Not verified pre-merge:** the in-app form and results page (auth-gated, no staging), and a
persisted in-app scan. Post-deploy: paste the App Store link into the new-scan form and
confirm the readout says iOS app; run it and confirm the scan is named "Beyond Nutrition UK",
the hero reads "Platform · iOS app · App Store listing" and the gate's policy is
"iOS app · App Store listing"; repeat with the Google Play link.

⚠️ **The page formats are not a contract.** Apple and Google can change either at will. When
they do, the parser returns null and every check goes INCONCLUSIVE with a reason, so a format
change degrades to "could not read the listing", never to a false pass. If a scan starts
saying that, re-capture the fixture and update the field paths.

### 56.6 Also in this change: CI's dependency audit was red on `main`

`npm run audit:dependencies` (a CI step) failed for every branch: a new advisory
(GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4) covers `@grpc/grpc-js` 1.14.0–1.14.4 and the
lockfile pinned 1.14.4. Fixed lockfile-only — `npm audit fix --package-lock-only` → 1.14.5,
a three-line diff, no `package.json` change. ⚠️ `--package-lock-only` matters in a Claude
worktree: `node_modules` is a symlink into the primary checkout, and a real install there
changes the dependencies every other running session is using.

## 57. Recent Changes (October 2026) — User management: archive, not delete, and the hole that made it urgent

Dan asked for a proper user-management table because people are leaving: everyone in one
table, an inline role dropdown, and archive in the last column — retained 30 days, no access,
hidden throughout Foundry, restorable. Reading the auth code to build it found that **removing
someone gave them more access than they had before**, so the security fix is the foundation
and the table sits on top of it.

### 57.1 ⚠️ The hole

The old Remove (`removeMember`) **deleted the `WorkspaceMember` row and kept the `User`.**
The person's `@gitwork.co.uk` Google account usually still worked, and then:

1. **Sign-in let them back in.** The jwt callback found the User, found no membership, skipped
   auto-provisioning (the User existed) and minted a token with `role ?? "STAFF"`.
2. **Middleware treats any valid session as authorised for every `/api/*` route** ("a valid
   session IS sufficient authorization").
3. **`getEffectiveUserOrNull` was a bare `catch { return null }`.** "No membership" threw
   `UnauthorizedError`, became `null` — and `null` is how a trusted workspace-API-key caller is
   represented: `assertCan(null, …)` passes. **~180 routes** use that pattern; **3** use
   `requireAuthedUserOrDefault`, which resolves `null` as **the workspace owner**.

The same `role ?? "STAFF"` fallback was copied into **all three sign-in paths** — web, the iOS
token exchange (`/api/auth/mobile-callback`) and the desktop handoff (`/api/auth/desktop/start`,
found only by sweeping for roster queries). The desktop path is the sharpest: it signs a
long-lived token, so an archived person could have traded a not-yet-revalidated web session for
one that outlives every session check.

### 57.2 The fix — a refused identity is not "no identity"

- **`RevokedAccessError` (403)**, in `effective-user.ts`. `requireAuthedUser` throws it when it
  resolved an identity and refused it: user gone, membership gone, or archived. It re-reads the
  membership **every request**, so it takes effect on the next call, live sessions included.
- **`getEffectiveUserOrNull` maps ONLY `UnauthorizedError` to `null`** and rethrows everything
  else. That also closes a second fail-open: a database blip used to return `null` too.
- **Sign-in refuses** an existing User with no or an archived membership, in the `signIn`
  callback (web), the mobile exchange and the desktop handoff. ⚠️ **It refuses rather than
  re-provisions** — re-provisioning would hand a former employee a fresh STAFF membership (every
  module, all clients, rates). Genuinely new people have no User row and provision as before.
- **Live sessions are revalidated** every 5 minutes in the Node `jwt` callback. Returning `null`
  makes Auth.js clear the cookie (`@auth/core` `lib/actions/session.js`). The same read refreshes
  `token.role` / `token.permissions`, which fixes a pre-existing defect: page access was fixed at
  sign-in, so a role change took up to 30 days (the session lifetime) to reach the middleware.
- **Archived guests** are refused by the password path with the same response and timing as a
  wrong password, so the form can't be used to learn an account was archived.
- **`assertNotLastSuperAdmin` counts ACTIVE Super Admins.** Counting archived ones would let you
  archive one and then demote the other, leaving nobody able to edit the role matrix.
- **The team routes resolve the caller with `requireTeamAdmin`** (DB-backed), not `auth()` +
  `session.user.role`, which is stale for a just-archived admin.

### 57.3 Archive, restore, reinstate, purge

`WorkspaceMember.archivedAt` + `archivedById` (additive). Pure rules in
`src/server/auth/member-status.ts`; operations in `src/server/team.ts`.

- **Archive** stamps two columns and touches nothing else. Idempotent. You can't archive
  yourself, someone at or above your rank, or the last active Super Admin.
- **Restore** within `ARCHIVE_RETENTION_DAYS` (30) returns role, permissions and overrides
  exactly, because they were never changed.
- **Reinstate by email** is the only way back after the window — sign-in now refuses a User with
  no membership, so without it a returning hire could never use their own address again.
- **Purge** (`GET /api/cron/member-purge`, daily 03:30) deletes **memberships, never Users**: a
  User is referenced by tasks, leave, expenses, meetings, documents and the audit log, and
  deleting one would erase who did what. ⚠️ **The crontab line is not installed by this PR**
  (`docs/vps-crons.md` already records four documented crons that never ran). It is fail-safe by
  design: `memberStatus` reports a member past the window as `expired` — no access, not
  restorable — whether or not the purge has run.
- **`isActiveMember` is a raw null check**: a non-null but unparseable `archivedAt` reads as
  archived. Parsing first would have read "can't tell when" as "never archived".
- `DELETE /api/team/members/[id]` now **archives**, so an old client or bookmark does the safe
  thing.

### 57.4 Hidden throughout Foundry — 31 decisions, not a blanket filter

Every `workspaceMember.findMany` / `.count` (31 when this landed) either spreads
`...ACTIVE_MEMBER` or carries `// includes-archived: <reason>`. **`roster-active-member.test.ts`
fails on any that does neither.** 24 are active-only, including three that matter more than they
look: **`cron/meet-transcripts` and `backstage-gcal` kept using a leaver's stored Google refresh
token to read their Drive and calendar**, and `push/devices` kept pushing to their phone. The
deliberate exceptions: the user-management list and purge (they exist to see archived rows), the
permission-cache recompute (refreshes a cache, grants nothing), a data migration, the leave-
history country lookup, and the first-admin bootstrap counts — where counting archived admins is
the **fail-safe** direction, or archiving every admin would make the next sign-in a Super Admin.

Historical attribution is untouched: a task an archived person completed still shows them.
Hiding is for pickers, rosters and fan-outs, not for history.

### 57.5 The table

`src/components/settings/team/user-management-table.tsx`, inside Settings → Team card 04.
Active / Archived as a segmented control; inline role dropdown offering only roles the actor may
assign. ⚠️ **A role change resets per-person overrides** (`updateMember`), so the dropdown
confirms first when there are any. The archive confirmation shows the person's **open task count**
and says plainly that **their Google account is separate** — suspend it in Google Admin too, or
they keep Gmail and any shared client Drive folders. The Edit-access modal's old "Remove from
workspace" danger zone — which said removal was "reversible only by sending a new invite" — is
gone; there is one archive path. "Active" was also the old signed-in marker's label; it now flags
only the exception, "Invited", since "Active" means active-vs-archived on this table.

### 57.6 The role review — findings NOT fixed here, in priority order

Each is a policy decision or a larger change, recorded rather than done silently:

1. ✅ **Resolved in the same PR (Dan's call).** Every new `@gitwork.co.uk` sign-in used to be
   auto-provisioned as STAFF, whose default is every module, `seeAllClients`, `code.viewRates`,
   `docs.viewCosts`, `rateCard.view` and manage on five products — so a new account saw
   commercial rates and every client on day one. New memberships are now created as
   **`DEFAULT_PROVISIONED_ROLE` (DEVELOPER)** on all four paths: web, iOS and desktop sign-in,
   and invite acceptance. An Admin raises the role in Settings → Team. ⚠️ Existing members were
   NOT changed — only what a brand-new membership starts as. The known owner emails and the
   first-admin bootstrap still become Super Admin. `provisioned-role.test.ts` fails if any
   path hardcodes a role again, and also pins that DEVELOPER's defaults carry none of the
   rates/all-clients grants that made the change worth making.
2. ✅ **Client writes fixed (Nov 2026, §135).** ~~113 API routes resolve no user at all~~ and trust any valid session from middleware. After
   this PR an archived member's session is cleared within 5 minutes — but those routes also let
   any *active* member of any role call them (a DEVELOPER can PATCH any client's wiki documents).
   That is a general authorisation gap, larger than archiving.
3. ✅ **Fixed (Nov 2026, §88).** Browser sessions used to carry the real workspace `API_KEY` in
   the HttpOnly `gitwork_api_session` cookie. The middleware no longer sets it, deletes any copy a
   browser still holds, and no longer accepts it: the env key now only works as a Bearer header.
4. **Three duplicated sign-in/provisioning paths.** `sign-in-paths.test.ts` now finds every
   token-minting file and requires the active check before signing, but one shared
   `provisionOrRefuse(email)` is the real fix.
5. **Handbook access contradicts this file.** §4 says readable by every internal user; the
   middleware redirects anyone below Admin, and the memory notes call it Super-Admin-only.

### 57.7 Verified

`npm run verify` and `npx next build` — figures in the PR. Behavioural tests run the real
`requireAuthedUser` / `getEffectiveUserOrNull` / `archiveMember` / `restoreMember` /
`reinstateMemberByEmail` / `purgeExpiredMembers` against a mocked database and session; sweep
tests cover the 31 roster queries and every sign-in path. Each guard was proved to discriminate
by reverting the fix it protects.

**Not verified against production.** `/app` is auth-gated with no staging, and the refusals only
happen with a real Google sign-in. **Post-deploy, in order:** archive a test member and confirm
their open tab is signed out within 5 minutes; sign in as them and confirm "Your access to
Foundry has been removed"; confirm they're gone from a task assignee picker and Backstage;
restore them and confirm their role is unchanged; then **add the `member-purge` crontab line**.

### 57.8 Archived members in Code (follow-up)

Archiving someone in Settings → Team now also moves their developer card in Code to a new
**Archived** tab (`/app/codeclear/archived`), reduced to name, avatar and specialism.

- **Derived, never stored.** Code lists `Candidate` rows, which are not team members — the only
  link is email. `archivedTeamEmails()` (`src/server/codeclear-archived.ts`) finds people whose
  membership is archived **or who have a User row and no membership** (purged after 30 days, or
  removed before archiving existed). Without the second case a developer would silently reappear
  on the active roster the day their window ran out. Matched case-insensitively, because
  `Candidate.email` is typed by hand.
- **Excluded everywhere the developer list is used** — the list route defaults to the active
  roster, so Developers, Pipeline and Overview (which all read it) drop archived developers, and
  `getCodeClearStats` excludes them from the Overview's counts. `?archived=1` returns only them.
- ⚠️ **Pre-existing bug fixed in the same function:** `buildCandidateWhere` set a top-level `OR`
  for stack, search, confidence and score range, and an object literal keeps only the LAST key —
  so combining any two filters silently dropped all but one (search + a confidence filter ignored
  the search). Each group is now its own clause in `AND`. The builder moved to
  `src/server/codeclear-candidate-where.ts`, since Next rejects non-route exports from `route.ts`.
- **Known limit, stated on the page:** a developer card with no email, or one that differs from
  the address they sign in with, cannot be linked and stays under Developers.
- **Not changed:** an archived developer's open `Placement`s still count in Portal's dev counts
  and monthly cost. Ending placements mutates delivery data, so it was left as a decision.

## 58. Recent Changes (October 2026) — Pulse shows only the checks that apply to the product

Dan, after §56: *"make sure every platform in that dropdown ONLY runs the checks appropriate to
the platform … the checks need to be contextual and only show IF related to the specific
platform; we don't show irrelevant data or results if not needed."*

### 58.1 What it measured before — with the real engine, not a reading of the code

`scripts/pulse-platform-matrix.ts` runs `runLiteScan` (the core the in-app scan and MCP share)
for **every dropdown platform against 17 real targets**: SaaS, marketing and bare websites, a
JSON API, App Store / Google Play / Chrome Web Store listings (incl. a removed one), and iOS,
Android, Flutter, React Native, Electron, extension, CLI, Next.js and Express repos. Before:

| | |
|---|---|
| example.com (one static page) as Web app | **857** findings — 368 "verify manually" catalogue items, 20 payments, 30 SaaS, 21 API-quality |
| a website scanned as iOS / Android / desktop / extension / CLI | **1** check (ssl_valid) |
| api.github.com as Web app | graded as a website — 861 checks |
| an iOS repo | the same **458** checks whether the dropdown said iOS, Web app or CLI |
| a Next.js repo picked as "iOS app" | ran as iOS — every web-source check lost |
| a Chrome Web Store link | Google's store page graded as the user's website |

`scripts/pulse-matrix-assert.ts` checks every run against plain-language expectations written
about the targets (an API is not graded on SEO; an iOS repo has no Android checks). It does NOT
read the gate's own data — that would be the gate agreeing with itself. **Before: 432 of 902
expectations violated.**

### 58.2 One gate — `check-relevance.ts`

Every check from every collector passes through `runLiteScan`'s `ingest`, and that is the one
place a check is held back. Shown only when all hold:

1. **Surface** — it measures what was scanned (website · API · store listing · repo of a shape).
2. **Platform** — the question matters for the product type. A *website* of a non-web product is
   its public presence: TLS, headers, privacy/terms, exposure, SEO — not SaaS, auth or checkout.
3. **Feature** — a feature check needs the feature (`product-features.ts`: **use, not mention** —
   Stripe.js loaded, not the word "stripe"; the product's own store link, not an apple-touch-icon).

Plus: a standards-catalogue control only with an evidence-backed verdict; a SKIPPED / NOT_APPLICABLE
row never (except `SCAN_NOTE_KEYS`); a `WITHHELD` check never. Hidden checks are not stored or
scored; `scoreBreakdown.relevance` records how many and why, rendered as one "Scoped to this
product" sentence.

⚠️ **The rules are data** — `check-relevance-data.ts`, generated from the audit below: one rule
per catalogued check (1,299 + the derived standards catalogue). `check-relevance.test.ts` fails
if any catalogued key lacks one — it reads `catalogue-baseline.json`, not the registry's literal
rows, because 156 generated checks (service-depth / operational-depth) are not literal rows and
the first version of the test silently missed every one.

### 58.3 Routing by what the artefact IS

- `repo-kind.ts` — a repo with no native shape is web / backend / none from package.json deps and
  framework entry files (never from go.mod / Cargo.toml / main.py, which name a language, not a
  server). Detection decides the platform; the dropdown only labels it, and a mismatch is said once.
- A website scanned as a non-web product runs the URL engine as a marketing site (presence).
- A URL answering JSON is an API, judged as one whatever the dropdown said.
- Markets: none declared or detected → UK, EU, US assumed; other regions only when present.
- Gate policies by surface (`resolveGatePolicy`): store listings (§56 + **chrome-extension-listing**),
  **source-code** for repos (was the website policy — every repo scan was permanently INCONCLUSIVE),
  **web-presence**, **api-production**, saas-production for SaaS. Description scans get no score
  and no verdict.

### 58.4 Chrome Web Store

The store publishes no schema.org data; everything is in the `ds:0` AF_initDataCallback array.
⚠️ Liveness comes from that data, never the HTTP status — the store answers **200** for a removed
item (`/detail/empty-title/<id>`, RPC NOT_FOUND). New checks `cws_privacy_practices`,
`cws_trader_status`, `cws_trust_badges`, `store_last_updated`; the published manifest runs
`evaluateExtensionManifest`. The extension CSP is now parsed by directive — `wasm-unsafe-eval`,
an https `frame-src`, and `__MSG_` names were failing store-approved extensions (Bitwarden, Grammarly).

### 58.5 The audit, and what "withheld" means

Every check's code was classified (surface · platforms · feature) and challenged by an
independent critic (267 corrections), every input path traced per platform, and **2,149 defect
claims** raised. 1,114 (all high + medium logic) were verified adversarially: **1,107 upheld**.
Spot-checked by hand, they hold (`legal-extended`'s `"eur"` matches `decodeURIComponent`; CI
checks PASS a repo with no workflows; Android's SDK floor was a year stale).

`WITHHELD` holds back two kinds of check, each with its reason: ones Pulse **cannot assess from
what it scans** (GitHub branch protection "detected" by regex over a website; PagerDuty guessed
from a homepage) and ones with a **verified high-severity wrong-verdict defect**, until fixed —
a confident wrong answer is worse than none. Fixing one removes it.

### 58.6 Result, and what is still open

**After: 0 of 935 expectations violated across 187 runs** (11 platforms × 17 targets), against
432 of 902 before. example.com as a Web app went 857 → 251 checks; a website scanned as iOS
reports its public presence (194 checks) instead of one; a JSON API as Web app 861 → 44; an iOS
repo is judged as iOS whatever the dropdown said (73 checks, no web or Android family).
`npm run verify` and `npx next build` clean; 4,159 tests.

⚠️ **The matrix proves the gate is consistent with plain-language expectations, not that every
remaining check is right.** 222 checks are `WITHHELD` (unobservable, or a verified high-severity
logic defect awaiting a fix). The fixes were proposed by an agent workflow that hit the session
limit before its adversarial reviews finished, so **none were applied** — a fix with no completed
review is how §44.3's regressions happened. Apply them package by package, each with a two-sided
test, removing the key from `WITHHELD` only when its fix lands. The defect list is in the audit
scratch data, not committed; re-derive per module when picking one up.

Not verified: the in-app results page and report (auth-gated, no staging), and a live
Chrome Web Store scan through the deployed scanner. Post-deploy, scan a Chrome Web Store link, a
JSON API URL and a website as "iOS app", and read the "Scoped to this product" line.

## 59. Recent Changes (October 2026) — CRM: a lead pipeline that moves itself

Dan's brief: *"a CRM that is almost automated — start with Valu — we base the status move on emails
and conversations in Slack"*, widened mid-build to *"better statuses, actions and next steps, and
convert to a full client that pulls information into a full Portal client."* Leads already had a
stage (`LeadStage`) and an activity log (`ClientTouchpoint`); both were set by hand only, and
"Convert to client" was a bare status flip.

### 59.1 The one rule: facts move the stage, wording only suggests

- **Facts** move the stage automatically. Something observably happened: an email either way, a
  meeting, a proposal drafted / shared / accepted / declined, a contract sent / signed, or a person
  logging a call/email/meeting by hand.
- **Wording** — an email or Slack message that *reads* like "we're going ahead" — only ever
  produces a **suggestion** with one click to accept. An automatic LOST from a misread reply is
  the expensive mistake. Same for actions: anything the AI reads out of a message arrives as
  *proposed*, never on the list until someone adds it.
- **Internal Slack is never a fact.** Gitwork talking about a lead is not contact with the lead —
  "we should send Valu the deck" must not move anything. It feeds suggestions and actions only.

All of it is pure and unit-tested in **`src/lib/crm/lead-stage-engine.ts`** (the stage rules),
`signals.ts` (Gmail query, direction, address parsing), `convert.ts` (main contact + conversion
fields). The orchestrator is `src/server/crm/sync.ts`; everything the UI reads is
`src/server/crm/service.ts`.

### 59.2 The pipeline (11 stages, agreed with Dan)

New · Contacted · Discovery · Qualified · Scoping · Proposal sent · In discussion · Contract out ·
Won · Lost · On hold. Seven move on facts; **Qualified** and **On hold** are suggestion-only, as is
a wording-based Won/Lost. The table of what moves each one is `STAGE_TRIGGER` — rendered beside the
picker so nobody has to guess.

⚠️ **`LeadStage` is a Postgres enum: add values only.** Removing or renaming one is data-losing and
the guarded `prisma db push` skips the WHOLE sync (§2). The six original values were kept.

⚠️ **`LEAD_STAGES` is the single list.** The Zod schema and MCP's tool schema read it, and
`stage-list-single-source.test.ts` pins it to the Prisma enum. Before this there were four
hand-typed copies (schema, Zod, MCP ×2) and a new stage would have silently 400'd.

Rules a move must satisfy, each with a test: a **pinned** stage is never touched; **Won** is never
left; ordinary progress is **forward only** (old evidence still counts, so switching automation on
catches a lead up); leaving **Lost** needs evidence newer than the moment it was lost, and an
unknown "since" never leaves it; leaving **On hold** needs any fresh fact; a **decline** only marks
Lost if it is the latest proposal event and newer than the current stage. *In discussion* means
**they** wrote after the proposal — our own chasing does not count.

### 59.3 Pinning, and why accepting a suggestion is not a pin

Setting the stage by hand (the picker, or MCP's `update_client`) sets `leadStagePinned` — but only
when the value actually **changes**, so a save that resends the same stage doesn't switch
automation off as a side effect. "Resume automation" clears it. Accepting a suggestion is a
person's decision too, but it does **not** pin, or every accepted suggestion would freeze the lead;
instead `leadStageChangedAt` is stamped, and that is what stops older evidence overriding it.

### 59.4 Privacy — whose mailbox, and what is stored

⚠️ **A mailbox is read only when its owner opts in** (`WorkspaceMember.crmMailboxEnabled`, via
"Use my Gmail" on the lead — `PATCH /api/account/crm-mailbox` is self-only and refuses an API-key
caller), **only for messages to/from the lead's own domains** (the Gmail query is built from
validated domains and is never sent unscoped — `buildGmailQuery` returns null rather than an open
search), and **only the subject and the person on their side are stored — never bodies.**
Foundry's Gmail access is otherwise strictly per-user because a workspace-shared path once leaked
one person's inbox to everyone (`/api/integrations/gmail`). It is per-*membership*, and the query
spreads `ACTIVE_MEMBER`, so archiving someone stops their mailbox being read (§57).

Subjects then appear on the lead's timeline for anyone who can see the lead. The opt-in copy says
so.

### 59.5 Failure model

Every source (Gmail per mailbox, Slack, meetings, documents) is read independently via
`Promise.allSettled`. A source that fails is reported in words on the lead and does **not** advance
`crmLastSyncedAt`, so its window is re-read next time — "we couldn't look" must not become "nothing
happened" (§35). Syncs claim the lead (`crmSyncStartedAt`, 5-minute TTL) so two can't log the same
email twice. Dedupe is on `(source, externalId)` — the RFC **Message-ID** for email, so the same
email in two opted-in mailboxes logs once. ⚠️ Deliberately **no unique constraint**: adding one is
treated by `db push` as potentially data-losing (§2).

The AI read is one light-tier call per sync over the last 30 days of new messages, cached on the
message set (£0 when nothing changed), gated on `ai.generate`, attributed to the new `AiModule.CRM`,
and validated against the messages it was actually shown — a stage we don't have, a message it
wasn't given, a backward move or a due date past next year is dropped.

### 59.6 Actions, next steps, the Desk

`LeadAction` (owner, due, state `suggested | open | done | dismissed`). The **next step** is the
earliest open action. Open actions appear on their owner's **On Your Desk → Tasks** as "Lead
follow-ups". AI-proposed actions default to the lead's owner (`leadOwnerId`); accepting an
unowned one gives it to whoever accepted it — an action nobody owns is an action nobody does.

### 59.7 Convert to client

Was a status flip. Now a two-step dialog (`ConvertLeadModal`):
1. Fill **empty** fields from the CRM — main contact = whoever on their side emailed us most;
   website from their domain. ⚠️ Never overwrites, and a name only travels with its own email, so
   the record can't end up naming one person at another person's address. The server re-derives
   the values rather than trusting the preview.
2. **Plan delivery** from the accepted proposal via the existing Plan-review preview/seed path
   (`previewProjectPlanFromProposal`), so nothing is created until it has been seen. A proposal
   matched only by name is linked to the client first, because Plan review looks proposals up by
   `clientId`.

⚠️ The dialog stays mounted while open, not merely while the record is a lead — converting flips the
status and the refetch would otherwise unmount it between step 1 and step 2.

### 59.8 Verified / not verified

`tsc` 0 errors; ESLint clean on every changed file; **50 new tests**, proved to discriminate by
seven deliberate breakages (Slack as a fact, pin ignored, backward moves, Lost reopened on old
evidence, our chasing counted as their reply, an unscoped Gmail search, conversion overwriting) —
each caught. Schema diff is purely additive.

**Not verified against live data** — `/app` is auth-gated with no staging and no local DB, and the
sync reads real Gmail and Slack. **Post-deploy, for Valu:** open the lead → 04 Automation → switch
it on, add Valu's email domain, press **Use my Gmail**, set the internal Slack channel in Edit
client, then **Sync now**. Confirm the activity log fills with emails and the stage moves to where
the history says it is. **Then add the `crm-sync` crontab line** (`docs/vps-crons.md`) — until it is
in, leads still sync whenever someone opens them.

## 58. Recent Changes (October 2026) — Estimates: how long with 1, 2, 3… developers

A new client-wiki section (`estimates`, label **Estimates**) that answers *"how long will
it take, and how much faster is it with more people?"* on a calendar. Read-only for the
client; edited by Gitwork. Same posture as Running costs: no `/api/wiki/[token]/estimates`
route, the data rides down in the wiki DTO, and the wiring test asserts that directory does
not exist.

**What is stored is effort, never dates.** `WikiEstimate` holds the phases (name,
developer-days, the most people the phase can use), the team sizes to compare, a start
date (nullable), a coordination level and a contingency %. Every duration, finish date and
calendar bar is derived at render by **`src/lib/wiki-estimates.ts`** (pure, unit-tested),
which the section, the editor's live preview and the dashboard card all call — so they
cannot disagree. Schema is additive: one flag, one model, one enum. Phases are JSON,
replaced wholesale on write and parsed defensively on read.

**The model, and why it is not effort ÷ developers:**
- **Coordination.** Team throughput is `n / (1 + k·(n − 1))` — LOW 8%, TYPICAL 15%, HIGH 25%
  per extra developer. Two developers deliver 1.74×, twelve deliver 4.5×, never n×.
- **Phase caps.** A phase can cap how many people it uses (discovery, a store release).
- So the curve flattens, and the page says so in words — *"No faster than 2 developers"* —
  rather than drawing a bar that looks shorter because the arithmetic was naive.
- Phases run in sequence, each rounded UP to whole working days.

**Dates are the real calendar, Monday to Friday** (Dan, explicitly). Every date is an
actual date stepped over weekends. ⚠️ **Durations are measured between the real start and
finish dates**, not working-days ÷ an average month: weeks are calendar weeks (weekends
inside the span count, because the client reads "12 weeks" against their own diary), and
months are whole calendar months plus the remainder as a fraction of *that* month's own
length (`calendarMonthsBetween`). The test that tells them apart is 2 Nov → 2 Jun: 7 months
and a day by the calendar ("7½ months"), 6.997 by a 30.44-day average ("7 months" — a week
the calendar does not have). Bank holidays and leave are NOT removed, and the page says so.

**Layout — two panels, no long lists:** `01 // ESTIMATE` (the figure for the chosen team,
the team-size switch on the same row, finish date and contingency range) and
`02 // CALENDAR` (one row per team size, Week · Month · 6 months · Year zoom, paged). The
calendar never scrolls sideways — the axis IS the window, and `.widget-card` is
`overflow: hidden` (§45.2). Up to 15 developers and 8 compared sizes (`ESTIMATE_LIMITS`,
shared by the validator and the editor).

⚠️ **Calendar windows start on the Monday of the start week, not the 1st of the month.**
Month-aligned windows put a five-week plan starting 19 Oct outside "October", so it opened
on a six-month axis that was mostly empty. "Month" is six weeks (a month grid), so a
five-week plan plus its contingency tail fits.

**Two defects found by looking, not by testing:** the editor's columns overlapped on a
phone — a `min-h-0` grid item in a single-column scroller lets its row shrink below its
content (now `md:min-h-0` only) — and `audit:clipping`'s detector reported **0** for that
overlap, because it detects clipping, not overlap. Only the screenshot caught it.

## 60. Incident (October 2026) — Wedge's course requests stopped, for the third time

Big Wedge reported that new course requests were not reaching Foundry. They were right, and
it was the third time this had been "fixed". Diagnosed against live data:

- **The email route is dead, on their side.** Course requests auto-imported from "New
  Feedback" emails into the mailbox Care reads over IMAP. That mailbox has received **no
  mail at all since 4 Aug 2026**, in any folder. Big Wedge's app stopped sending it.
- **The API route only ever ran by hand, on a token that had expired.** Big Wedge has a
  proper `GET /api/v1/course-requests/`. Foundry's import from it was reachable only
  through `/api/dev` routes, and authenticated with an admin JWT pasted onto the Care
  "Analytics API" connector. An access JWT expires, so every previous fix lapsed. The
  import also read that token **without decrypting it**, so once connector secrets were
  encrypted at rest it sent `enc:{…}` as the bearer.
- **Nothing said any of this.** A dead feed and a quiet week look identical on the board,
  so the client noticed before we did.

### 60.1 The fix — a scheduled pull that cannot expire and cannot fail quietly

- **`src/server/bigwedge-api-auth.ts`** logs in for itself on every run
  (`POST /api/v1/auth/login/`) with `BIGWEDGE_API_USERNAME` (a username or an email —
  sent as whichever field the API expects) + `BIGWEDGE_API_PASSWORD`. A token
  minted per run cannot expire between runs. Both are synced into the VPS `.env` by
  `deploy.yml` from GitHub Actions secrets. A stored connector token is still honoured as a
  fallback, but an expired one is **reported as expired, with the fix**, not sent to 401.
  The import and the status sync share this one resolver.
- **`src/server/wedge-course-feed.ts`**, run **hourly** by `GET /api/cron/wedge-course-feed`
  (`docs/vps-crons.md`), pulls new requests and, about daily, marks the ones Big Wedge has
  actioned as ADDED. Each run writes `ClientWiki.courseFeedStatus` (additive JSON).
- **The outcome is visible.** The Course Requests page shows one line: a quiet "Pulled
  from the Big Wedge app 12 min ago · 3 new", or a red **Feed down** block naming the
  error. ⚠️ It also goes red when the last success is more than **6 hours** old. A missing
  cron line errors nowhere, and that is exactly how Foreman and the Curator went months
  without running (see the vps-crons doc).
- **Admins are notified once per outage** (`clients.feed_failing`, in-app and push), on the
  transition from working to failing. They are not notified every hour it stays down.
- ⚠️ **A page that failed to fetch makes the whole run a failure.** The window was not
  fully read, so `lastSuccessAt` does not advance and the next run re-reads it. Overlap is
  free, because rows dedupe on `externalRef`.
- `courseFeedStatus` is stripped from every public DTO (`forPublic` in `wiki.ts`, pinned by
  a test). It is our plumbing, and its errors name our configuration.

### 60.2 The importer was throwing away demand

The importer used to skip any request whose course **name** matched a row already on the
board. But each row is one golfer's submission (§45.3), so a second golfer asking for a
course already on the board was silently dropped. That under-counted exactly the demand
signal §45.3 built.

Name matching now applies only to requests submitted **before the email route died**
(`EMAIL_FEED_ENDED`), and only against rows from another source. That was the one case
where the email had genuinely already filed the same submission. Everything else
dedupes on Big Wedge's own request id. See `isDuplicateFeedRow`.

### 60.3 Verified / not verified

36 new tests across the status rules, the auth precedence, the runner and the banner.
Nine deliberate sabotages, each failing the test named for it. Not verified: a live login.
**Dan must set `BIGWEDGE_API_USERNAME` / `BIGWEDGE_API_PASSWORD`** (a Big Wedge staff
account) as GitHub Actions secrets and re-run the deploy. Until then the page says
**Feed down** with that instruction. That is the intended behaviour, not a bug.

### 60.4 ⚠️ The secret sync had been failing silently since 19 September

Setting the secrets changed nothing on the box. `/opt/apps/foundry/.env` had been **owned by
root since a hand edit on 19 Sep**, and the deploy SSHes in as `deploy`, which could only read
it. `upsert_env` never checked its writes, so every deploy since printed "added from CI" while
writing nothing, for every managed secret, not just these. Fixed on the box (`chown
deploy:deploy`, `chmod 600`, original backed up under `/root`), and `deploy.yml` now refuses
to continue if `.env` is not writable and verifies each key landed. **Never edit `.env` with
`sudo`** — edit it as `deploy`, or set the value as a GitHub secret.

### 60.5 The client's Slack channel hears when it drops (`wedge-course-feed-alert.ts`)

The feed posts to Big Wedge's **external** (Slack Connect) channel, because they notice
missing requests first and the feed reads their API. Rules in `feedAlert()` (pure, tested):
**down** after two failed hourly runs in a row (`ALERT_AFTER_FAILING_MINUTES` — one blip never
reaches the client), after 6h without a success, or after `STOPPED_AFTER_MINUTES` with no run
at all; **once per outage** (`courseFeedStatus.alertedDownAt` is the latch, and it only moves
when Slack accepted the post, so a Slack outage retries rather than swallowing the alert);
then one **recovered** message with the catch-up count. ⚠️ The wording comes from
`clientSafeReason()`, never the raw error — those name our env vars. The "hourly run stopped"
case cannot report itself, so a watchdog rides on the 5-minute `wedge-keepwarm` cron and only
acts once no run has happened for `STOPPED_AFTER_MINUTES`, so it can't race a live run.

**Same session:** the 3,322 Wedge requests in New submitted more than a week before 14 Oct
2026 were moved to **Sent** at Dan's request (ids saved on the box under `/root`).

**Still broken, separately:** `WEDGE_COURSE_API_USER/PASSWORD` (the Golf Data console's
login to wedge-course-backend) is also failing, and the Analytics connector has no token.
Neither feeds course requests.

## 60. Recent Changes (October 2026) — Pulse: choose what the free scan shows in full

Settings → Pulse → Public embed → **02 // FREE RESULTS**. A switch ("Limit what is shown free"), then
a grouped, searchable picker (domain → category → check, selected/total at every level, "Selected only"
review view, All/None per category). Edits are a **draft with Save/Discard** — nothing goes live per click.

- **Limit shows less, never rescores.** Findings from ticked checks are shown in full; every other
  actionable (P1/P2) finding is **counted and named by category only** ("4 more in Security, Legal").
  The score is always `computeScoreBreakdown` over the full scan, so free = paid. The retired picker
  rescored the subset (one check worth 7–14 points) — do not reintroduce that.
- **One place applies it:** `triage(checks, freeKeys)` in `pulse-lite/public-scan.ts`. The widget,
  `/scan/[id]`, the markdown report and the results email all call it, so they cannot disagree.
- **Default is no limit**, and shipping changed nothing. ⚠️ `Workspace.pulseEmbedCheckKeys` still held the
  OLD curated array, so the new value is `{ keys: [...] }` and any bare array reads as "no limit" (tested).
  `null` = no limit; `{ keys: [] }` = limit that shows nothing.
- Pure rule + picker model: `src/lib/pulse-free-tier.ts` (`splitByFreeSet`, `buildPickerModel`).
- **Not verified visually** — settings is auth-gated. Post-deploy: tick a few checks, Save, scan a site in
  the preview, confirm "N more actionable findings" appears and the score matches an unlimited scan.

## 61. Recent Changes (October 2026) — Pulse audit: what it says when it cannot look

A full audit before the public rollout: the 11-platform × 17-target matrix, an edge-case harness
(dead hosts, bad TLS, redirect loops, error pages, files, missing/empty repos, SSRF inputs), and live
production scans of an iOS listing, a Play listing, a Chrome Web Store item, gitwork.co.uk and
api.github.com — every suspect finding then checked by hand with curl/dig. Six defects, all the same
family: **a probe that could not answer was reported as a finding about the product** (§35 again).

- **Unreachable target → 157 FAILs.** `runUrlChecks` stamped "Could not reach the site." as FAIL on
  ~157 controls (privacy policy, VAT, API rate limits…) for an expired cert, a timeout, a redirect loop
  or an HTTP-only site. Now ONE `target_content_accessible` FAIL naming the cause (`classifyFetchError`:
  tls / timeout / redirects / refused), `ssl_valid` FAIL only for a real TLS failure (INCONCLUSIVE
  otherwise), and an HTTP-only site is told it has no HTTPS. The same exit covers an **HTTP ≥ 400**
  response (it was grading the error page) and a **file** (PDF, text, image — `isNonPageContentType`).
- **HTTP/2 was guessed from `alt-svc`** — absent on most HTTP/2 servers, so api.github.com was warned.
  Now measured by TLS ALPN (`negotiateAlpn`); a failed probe is INCONCLUSIVE.
- **An unrendered SPA shell** still produced "no cookie consent / GDPR notice / DPO contact" from a
  2.6KB empty `<div id="root">`. `reclassifySpaChecks` now treats every adverse check whose relevance
  surface is `WEB_PAGE` as unestablished (except `privacy_policy`/`terms_of_service`, which probe
  policy paths themselves). gitwork.co.uk went from 90 warnings to 20, all verifiable facts.
- **`icp_license` (China) had no jurisdiction tag**, so UK sites were warned. Tagged `CN`.
- **Chrome Web Store:** permission list deduped; a published listing gets WARN (not "will be rejected");
  a name read from the listing is never dropped as a placeholder (`nameFromStore`).
- **TLS-RPT:** "no record" and "record has no destination" both fired for one missing record; an
  `https:` `rua` (RFC 8460) was rejected. Fixed.
- ⚠️ **GitHub rate limit.** All repo scans share ONE token — 5,000 REST calls/hour, and one repo scan
  can spend a few hundred, so roughly 20–30 repo scans an hour. When it runs out, every call 403s and a
  public repo was reported as "does not exist, or the token cannot see it". `githubRequest` now records
  the limit (`githubRateLimitedUntil`) and the scan says the limit is used up and when it clears; a 403
  that is NOT a rate limit is no longer mislabelled one. **The capacity itself is not fixed** — a GitHub
  App (higher per-installation limits) or caching repo snapshots is the real answer before repo scans
  are opened to many users. `codeclear-analysis.ts` now uses the shared `githubRequest` (Oct 2026).

Matrix after all fixes: see the PR/commit. Tests: `uninspectable-target.test.ts`,
`audit-2026-10-live-defects.test.ts`, `github-rate-limit.test.ts`, and the TLS-RPT case in
`probe-honesty.test.ts` — each proved to fail against the old code.

## 62. Recent Changes (October 2026) — Pulse: every finding from 170 real scans checked against the live site

A full pass before the public rollout. 85 real URLs (SaaS, news, government, e-commerce, APIs,
store listings, broken targets) were scanned in both internal and public mode, plus 33 real repos
across every platform family. Every non-passing finding was then checked against the live site
with curl/dig by 42 verification agents; 205 fixes were proposed, adversarially reviewed
(4 rejected), applied per file with two-sided tests, and reviewed again. Scratch data (corpus,
verdicts, per-key evidence) is not committed; re-derive it with the runner pattern below.

### 62.1 A 200 is not an answer — `pulse-checks/path-probe.ts`

The biggest single class. vercel.com answers `/.git/config`, `/phpinfo.php` and `/backup.sql`
with its own 2.6 MB homepage (200) while a random path 404s, so the `catchAll200` guard misses it;
cbc.ca answers `/phpinfo.php` with a "Menu" page; github.com/telescope is a user. Pulse told
Vercel it was leaking its git config and a database. Now every path probe reads the body:

- **Exposure** (git config, phpinfo, backups, `.env.bak`, Telescope/Horizon/Clockwork, Spring
  Actuator, Swagger UI, Prometheus, GraphQL) is reported only when the body IS the thing — the
  file's own format or the tool's own markup (`looksLike*`).
- **Pages** (about, careers, DPA, cookies, accessibility, security, docs …) exist only when the
  page **names itself** in its title/h1/h2 or the URL it settled on (`classifyTopicPage`). The
  homepage served under another path, a bot wall, or a page that doesn't say what it is →
  `unverified` → INCONCLUSIVE, never a guess either way. 404/410 or a redirect to `/` → absent.
- The Stripe-webhook signal no longer switches the payments family on from an HTML 200.

### 62.2 What Pulse cannot see is not reported as missing — `pulse-checks/absence-policy.ts`

Applied once in `runLiteScan`'s ingest, so in-app, public and MCP agree.
- **`UNOBSERVABLE_ABSENCE` (70 keys)** — the control lives behind sign-in or on the server
  (password reset, brute-force protection, MFA, SCIM, billing portal, DPO contact). Adverse →
  INCONCLUSIVE; a PASS still stands.
- **`OPTIONAL_ABSENCE` (82 keys)** — a choice, not a defect (Product Hunt badge, RTL, Server-
  Timing, a page *naming* PECR). Adverse → NOT_APPLICABLE, so it leaves the report and the score.
- ⚠️ A test fails if any key in either list is a release-gate blocker. A check whose adverse
  branch also covers a real observed defect does not belong in these lists — fix the check.

### 62.3 Repo shape — what the repo ships, not what it demonstrates

cal.com read as React Native (a Heroku `app.json`), Supabase as Android (Flutter apps under
`examples/`), Immich as native Android (its Flutter app is in `mobile/`), Atom as a web app
(`electronVersion`, no electron dep), cli/cli as a web app (an `index.html` under `.github/`).
`detectNativePlatform` now ignores example/fixture/test dirs, finds a nested Flutter app beside its
own android/ios folder, and only counts a bare `app.json` when package.json depends on
react-native/expo; `repo-kind.ts` ignores dot-dirs, docs and examples.

### 62.4 Smaller, each verified live

DMARC follows the PSL for platform namespaces (`www.squarespace.com` is covered by squarespace.com's
p=reject); SPF `redirect=` is INCONCLUSIVE, not "no SPF"; a null-MX domain needs no MTA-STS;
`robots.txt` 401/403/429/5xx are unread, not absent; SEPA/currency/status-page checks read visible
text and real links, not `border-collapse:separate`, asset hashes or tweet URLs; a rate-limited or
unreadable repo scores 0 and gates INCONCLUSIVE (`SUBJECT_UNREADABLE`); Mac App Store listings are
labelled Mac apps.

### 62.5 The repo families, verified against the repos' own source

Round one could only read 6 repos before the shared GitHub quota ran out, so the repo families
got their own pass: 33 real public repos across every family, each non-passing finding checked by
shallow-cloning the repo and reading the files the check reasons about. **154 false positives**
of 295 verdicts; 256 fixes proposed and reviewed (1 rejected), applied per file and reviewed again.

- Presence checks look below the root (nested tsconfig/Dockerfile/test configs/migrations, an
  e2e/ Playwright suite) while ignoring examples, fixtures and vendored trees.
- ⚠️ **No check may add a GitHub API call beyond the shared snapshot.** Two fixes tried (an org
  `.github` SECURITY.md probe, a dependabot.yml read); the reviewer removed both. A file the
  snapshot did not carry is INCONCLUSIVE, never fetched and never "missing".
- The generic `*_depth_*` families match bare words (`queue`, `region`, `Decimal`) across a
  concatenated sample. 15 with verified wrong verdicts and no reviewed fix are in `WITHHELD`;
  controls that live outside a repo (runbooks, SLOs, branch rules, dunning) are in the absence
  policy. Those families are the weakest part of Pulse and want a proper rewrite.
- Repo collectors now run as the **detected** execution platform. An Express API picked as
  "iOS app" ran 17 checks against 101 for the same repo picked as "Other";
  `pulse-matrix-assert.ts` now fails if one repo + one execution platform shows different checks
  by pick.

### 62.6 The two launch-blocking checks, checked site by site

`privacy_policy` / `terms_of_service` are the checks the release gate blocks on, so every P1 they
raised in the final corpus was checked by hand against the live site. Wikipedia, Hacker News,
Figma, PostHog, Mercado Livre, CBC, Zalando, Flipkart and Rakuten were all told they had no
policy, and all publish one. Causes, each fixed with a two-sided test:

- **The read cap.** posthog.com/privacy puts its `<title>` 714 KB in (inlined CSS);
  ycombinator.com/legal/ its "Terms of Use" 224 KB in. The probe kept 60 KB. Now 2 MB, and a body
  cut at the cap is "could not read", never "absent".
- **A refused candidate counted as absent.** posthog.com answered a repeat scan with 403 on every
  candidate path. Only 404/410 mean "not there"; 401/403/429/5xx are unreadable.
- **A legal index that links the document** passes (figma.com → /legal/ → /legal/tos/).
- **Link shapes:** MediaWiki `Policy:Privacy_policy`, qualified paths
  (`/terms-of-use-digital-services`), Portuguese/Spanish/French/Italian/Dutch paths and anchor text,
  and Japanese/Chinese compound names that END in 利用規約 / 服务条款 (whole-text matching stays the
  rule for English, so "Glossary of terms" never counts). A policy *generator* or *template* link
  never counts.
- **Footers drawn by JavaScript** (flipkart.com has no legal link in any byte it serves). Internal
  scans render the page when the served HTML has no link — **twice before concluding absence**,
  because app.hubspot.com came back footer-less once under load. The free scan does not render, so
  on a script-heavy page (8+ `<script>`) "not found" is INCONCLUSIVE, not FAIL.

Still FAIL, and true: Notion, gitwork.co.uk, HubSpot's login page and wordpress.org/news link no
terms page. **Known limitation:** Baidu's combined legal notice is "使用百度前必读" at `/duty`, a
name no general rule recognises; it still reads as missing.

Also: a connection RESET (ECONNRESET / EAI_AGAIN) is INCONCLUSIVE — badssl.com reset Pulse under
concurrent scans — while refused connections and unknown hosts stay FAIL. An API that answers an
unauthenticated request with JSON 401/403/404/405 is graded as an API (api.stripe.com), and an API
refusing plain HTTP with a 4xx passes `http_redirect`.

### 62.7 GitHub capacity — still open

Repo scans share ONE token (5,000 REST calls/hour). Measured: ~150–250 calls per repo scan, so
roughly 20–30 repo scans an hour across all users. A GitHub App (per-installation limits) or
caching repo snapshots is needed before repo scans are opened widely. URL scans are unaffected.

**Partly addressed (Oct 2026):** every REST GET through `githubRequest` now sends the stored
`ETag`/`Last-Modified` back (`src/lib/github-cache.ts`, in-process LRU, 2,000 entries / 50MB,
keyed on URL + Accept + a hash of the token) and serves the stored body on a 304. An
authenticated 304 is not counted against the limit (measured), so a rescan of an unchanged repo
costs close to nothing. A first scan of a new repo still costs full price. The validators now
survive a deploy too: a Postgres second tier (`GithubResponseCache`, §84.15).

## 61. Recent Changes (October 2026) — The daily Slack updates report subtasks and ongoing work

Asked for by a developer (Waqar): completed subtasks must appear, in-progress work must appear at
the end of the day, and a multi-day task must still give a developer something to report. Three
defects were behind it, all now fixed through ONE layout module, `src/lib/standup-report.ts`,
which the per-developer card, the consolidated #updates card and the admin's review preview all
render from:

- **A subtask with no assignee belongs to whoever owns its parent** (`reportOwnerIds`). 172 of 265
  live subtasks have no assignee (made before subtasks inherited their parent's), so both reports,
  which select by assignee, reported those subtasks for nobody. The same rule is applied in the
  queries (`compileDailyUpdates`, and `listTasks` when `includeSubtasks` + `assigneeId`).
- **The #updates end-of-day card only fetched DONE-today tasks**, so a developer three days into
  one task had nothing to show. It now reports **Done today · In progress · In review**, each under
  a small label.
- **A finished subtask removed its still-running parent** from "Still in progress" on the
  per-developer card (a cross-group de-dupe). Each group now nests its own subtasks.

Subtasks render under their parent as `    ↳ Subtask`. ⚠️ The indent is **non-breaking spaces**
(`SUBTASK_PREFIX`) because Slack collapses ordinary leading spaces — a test pins it.

## 62. Recent Changes (October 2026) — Undated phases get an estimated bar, drawn as one

YG Intelligence's linked timeline (under YourGroop's wiki) showed five phases and no bars: none had
dates, while their tasks were due across Oct–Dec. Three of the four Gantt feeders (internal task
board, the client's own wiki timeline, the public /timeline share) already estimated an undated
block from its tasks' due dates — and drew the estimate **solid, as if someone had scheduled it**.
The fourth, linked-client work, didn't estimate at all.

One rule now, `blockSpan()` in **`src/lib/gantt-span.ts`**: the block's own dates when it has both;
otherwise first → last task due date, flagged `estimated`; nothing when there are no dates anywhere.
The chart draws an estimated bar **dashed**, marks its due date `~18 Dec`, says "Estimated from task
due dates" in the tooltip, and adds a legend entry. A block with real dates looks exactly as before.
⚠️ This changes how already-estimated bars look on every client's timeline — that is the point:
an estimate must not read as a commitment.

## 63. Recent Changes (October 2026) — Canvas: artwork tools at `/canvas`, beside Deck

**Canvas** is a suite of 30 generative artwork tools, at least five in each group (Shape, Line,
Pattern, Type, Image, Colour), served at `/canvas` and opened from **Settings → Labs**. The list
lives in the Canvas repo's README. It is built the same way as Deck: one static HTML file that
carries the app and, once saved, the artwork. Nothing in it talks to Foundry's API.

- **The source is NOT in this repo.** It lives in **`Git-Dann/canvas`**, which reuses Deck's
  kernel ideas (pristine capture, the data-block splice, IndexedDB recovery) rewritten for a
  config-driven app id. Only the built shell is committed here, at `public/canvas/index.html`.
  ⚠️ To update it: in the Canvas repo run `npm run verify`, then
  `FOUNDRY_PUBLIC=<this repo>/public npm run build:foundry`, and commit the rebuilt shell here.
  Same rule as Deck (§30): a change that isn't rebuilt and committed here never reaches prod.
- **Wiring mirrors `/deck` exactly:** `next.config.ts` rewrite + 60s `Cache-Control`,
  `isCanvasPath()` in `src/middleware.ts` (session-gated, no module gate — it holds no
  workspace data), `robots.ts` disallow, a `/context` row, and the Labs entry.
- **When hosted at `/canvas` it shows `← Foundry`** (to `/app`), and a saved file never does —
  the same `servedByFoundry()` test Deck uses. It follows Foundry's light/dark setting
  (`gitwork.theme.v1`) live, then the OS, and has **no theme toggle of its own** (Dan's call,
  October 2026). Don't add one back.
- **The artboard (size, background, seed) is one setting for the file**, shared by every tool,
  set from a dropdown in the topbar rather than from any tool's settings.
- ⚠️ **Brand exception, by Dan's request:** Canvas wears **Emergency Orange `#FF4F00`** on the
  Untitled UI v8 tokens, not Gitwork Blue. DESIGN.md records it. Text on the orange fill is
  near-black (6.0:1); white would be 3.3:1 and fail AA.
- **Adding a tool is done in the Canvas repo** (`npm run new-tool`, skills in its
  `.claude/skills/`), then rebuilt into this one.

## 64. Recent Changes (October 2026) — Settings rail halved, Labs as a grid, Deck in Labs

- **The settings rail went from 19 rows to 9** (`settings-shell.tsx`): Account (Profile ·
  Notifications), Documents (Document defaults · Templates), Client forms (Onboarding ·
  Launchpad), People & access, Integrations (Integrations · MCP), Automation (AI agents · Pulse
  checks · Curator · Foreman), Labs, Developer, Audit & privacy (Audit log · Privacy & data).
  Sections sharing a row show as tabs on its page. **Presentation only:** every section keeps its
  own URL, permission and page gate, so links, bookmarks and the role matrix are untouched. A row
  shows when you can open at least one of its sections and links to the first one you can.
  `settings-rail.test.ts` fails if a section that renders a panel stops being reachable.
  Analytics left the rail: it is a full page, reached from the HQ context strip.
- **Labs is a two-column grid** with one-sentence cards; the detail lives in the docs.
- **Deck's scratch editor (`/deck`) is a Labs card**, and the HQ strip's `· DECKS` link is gone.
  A deck that belongs to a client is made in Docs (+ New → Deck), which is unchanged.

## 65. Recent Changes (October 2026) — Wiki: Metrics, Meetings and Platforms

Three client-wiki sections, each with a dashboard card. All three are read-only for the client and
off until someone turns them on. Each is offered in the client's view only when it has something on
it (`wiki-section-wiring.test.ts` pins every predicate).

- **Metrics** (`src/server/wiki-metrics.ts`, rules in `src/lib/wiki-metrics.ts`). The source is the
  **Care analytics connector when one exists**. Otherwise it's **one GET endpoint picked off the
  client's own API Docs page**, plus an optional token, encrypted and never sent to the browser.
  The endpoint must be one the page documents (`setWikiMetricsConfig` refuses anything else), and
  `getJson` still runs the SSRF guard. A page load **reads stored snapshots only**. Snapshots are
  refreshed when someone at Gitwork opens the section and it is behind, or presses Refresh, so a
  client's API is never called because a client looked.
  ⚠️ Two meanings of "this month". A month-scoped adapter is shown only once the month is **over**:
  a snapshot captured mid-month (the Care report builder can store one) is partial and never shown
  as that month's figure. A "current" source (the generic JSON adapter or an API Docs endpoint)
  belongs to the month it was **captured** in, whatever it was stored under. Hidden metrics are
  **removed** from the client's copy in `forPublic`, not just flagged.
- **Meetings** (`src/server/wiki-meetings.ts`). Only meetings with `Meeting.sharedWithClientAt` set
  are shown, so turning the section on shares nothing by itself. It shows the summary, decisions and
  actions. The transcript, notes text and attendees are never selected. An action turned into a task
  is done when **the task** is done.
- **Platforms** (`src/server/wiki-platforms.ts`). Portal's platforms as **links only**: logins,
  credential ciphers and internal notes are never selected (Dan's call). Each platform has an
  optional `renewsOn` + `renewalNote` (edited in Portal's platform form). The next renewals lead the
  dashboard card: amber within 14 days, red once passed. A date more than 30 days past drops off,
  since nobody updates the date after renewing.

The DTO field is `clientPlatforms`, because `platforms` was already the changelog's platform list.
Schema change is additive: three flags, `ClientWiki.metricsConfig`, `WikiMetricSnapshot`,
`Meeting.sharedWithClientAt`, and `ClientPlatform.renewsOn` / `renewalNote`.

## 66. Recent Changes (October 2026) — The wiki dashboard is arrangeable, per person

**Edit** sits beside the theme switcher on both the internal wiki and the client's share page. It
only appears while the dashboard is on screen (`dashboard-edit.tsx`, a small external store shared
by the header button and the grid). In Edit mode each card gets a title line: a grab handle on the
left, the width picker (1×1 / 2×1 / 3×1) and a hide button on the right. A Hidden tray below the
grid brings hidden cards back, and **Reset to default** clears everything. Daily updates is an
ordinary card in the grid now.

- **Per person, in the browser (Dan's call).** `localStorage`, keyed by wiki
  (`foundry.wiki.dashboard.v1.<wikiId>`). No server, no write route, no auth question, and every
  read or write is wrapped so blocked storage just means the default layout. A saved layout only
  ever ARRANGES the cards that are available: a stale id is dropped, a new section is appended,
  so it cannot surface a section the viewer isn't meant to see (`src/lib/wiki-dashboard-layout.ts`).
- **3 columns, every card one row tall** (2 from `md`, 1 on a phone, where widths don't apply).
- ⚠️ **No gaps, without reordering.** Cards are packed into rows in the viewer's order. When a row
  isn't full, its last card stretches to close it (`fillRows`, one pass for 2 columns and one for 3).
  The width someone chose is still what's saved; a drop always lands where it was dropped.
- ⚠️ **Rows are now as tall as their tallest card, not the tallest card on the whole dashboard.**
  The old `gridAutoRows: 1fr` would have made every row as tall as Daily updates once it joined the
  grid. Widgets carry a `min-h-[220px]` floor instead.
- While editing, card bodies are `pointer-events-none`, so dragging a card can't also open its section.

## 67. Recent Changes (October 2026) — Plan-first tasks: pick up the plan before adding to it

Dan asked why boards and projects looked empty when developers post updates every day. Measured on
production (last 30 days): **~720 tasks completed, and 583 of them were created and closed the
same day** — the task was the timesheet. Almost none sat in a category (Fellas 150/150 outside,
After Desk 106/106, Wedge 203/205), while the planned tasks sat **unassigned** (Fellas 55/55,
Wedge 48/49) so they were on nobody's "Up next". Phase progress, the Gantt and Foreman all read
the plan, so the projects looked stalled while the work was really happening. Not a bug — the
product made logging a fresh task the quickest answer to "what are you working on today?".

- **`src/lib/tasks/plan-match.ts`** (pure) — `matchPlannedTasks` (is this already a task?),
  `suggestCategory` (which category does a new one belong in?), `rankPlanQueue`. IDF-weighted
  word overlap, light stemming, one-edit typo allowance; deterministic, no AI (it runs on every
  keystroke). **Calibrated on the live boards**, and the tests are verbatim live titles. Rules
  that each fixed a false suggestion seen on real data: generic task verbs are stopwords; a match
  needs an EXACT shared topical word; three-plus-word drafts must share two; a one-word match
  needs ≥0.55; platform tags (`- IOS`, `web`, `admin`…) can't carry a match; the client's own name
  is ignored (`ignoreWords`); category suggestions use exact words only ("Back button" ≠
  "Backlog") and a category with a topic must match on the topic.
- **Task form** — "Already on the board?" under the title, with **Pick up** (assigns you + Doing).
  A new task **must choose a category or "Not part of the plan"** (no more silent "No category");
  the category is pre-selected from the title and says why. Edit mode is unchanged.
- **My Day** — "What are you working on?" at the top checks the board as you type before opening
  the form (`plan-quick-add.tsx`), and **From the plan** lists planned work nobody owns on your
  clients (`MyDayDTO.fromPlan`, via `listTasks({ clientIds, plannedOnly, unassignedOnly,
  openOnly })` — `clientIds` is intersected with the caller's scope, tested).
- **Board strip** (`plan-health-strip.tsx`, `src/lib/tasks/plan-health.ts`) — last 30 days: done
  work on vs. off the plan, and planned tasks untouched 21+ days. Silent on a healthy board.
  **Sort into categories** suggests a category per unplanned task; nothing moves until applied.
- **Foreman `PLAN_DRIFT`** — fires only when BOTH ≥5 tasks were done outside the plan in 30 days
  AND ≥3 planned tasks are untouched 21+ days (either alone is normal).
- ⚠️ The task form's due date still defaults to **today** (a team request for logging same-day
  work), so a logged task can never read as late. Left as-is; worth revisiting.

## 68. Recent Changes (October 2026) — Big Wedge user analytics, and platforms the client can open

**Wedge's Metrics page showed nothing, for three reasons, all in `support-analytics/bigwedge.ts`.**
It used the Analytics API connector's pasted token, which had expired; it sent
`date_from`/`date_to`, which `overall-report` **silently ignores** (it falls back to the current
month, so every month read as this month); and it swallowed every error and returned an empty
month, which `refreshWikiMetrics` then **stored** as that month's figures (§35). Now:

- The adapter logs in for itself through **`bigWedgeBearer()`** (`bigwedge-api-auth.ts`, shared
  with the course feed, §60) — env service account first, a stored token only as a checked fallback.
- It asks for `start_date`/`end_date` (end **inclusive** by day) and throws unless the response
  says `filters.applied_filter === "custom"`.
- It maps a curated set of fields (users, retention, rounds, scores) rather than flattening the
  report, and leaves out a missing field instead of zeroing it.
- A read that fails, or a month with no figures, **throws**; `refreshWikiMetrics` never stores an
  empty snapshot. Tests are built from the live August 2026 response.

⚠️ Wedge still needs **Metrics switched on** (Add New → Metrics); opening it fetches the missing
months.

**Platforms.** The Platforms dashboard card now lists the platforms (renewals due first), and each
platform card opens a details popup (links with copy/open, renewal date) — links only, never
logins or internal notes, which do not reach the client DTO. The Edit platform modal's fields no
longer slide under the Cancel/Save bar: the grid's row is bounded (`sm:grid-rows-[minmax(0,1fr)]`)
and the right column scrolls inside it.

**Follow-up (same day).** Metric tiles are now graph cards: the six-month line sits inside the
card, with the first and last month named. Two more data rules: an **empty** stored month is
never treated as settled (`isSettled` in `src/lib/wiki-metrics.ts`) — it is not shown, it is
re-fetched, and opening the section refreshes when a month in the window is stored but unusable
(never for months that were simply never stored). The `analytics-snapshot` cron no longer stores
an empty month either. And Big Wedge's `total_users` / `returning_users` are **all-time** counts
the date range does not change, so they are no longer collected per month.

## 69. Recent Changes (October 2026) — Requests: a proper conversation, and @mentions to Slack

Harry's read of a client's Requests page (PollenIQ): the expanded row was a description, a
stray mono "Logged … by …" line, a trash can floating on its own, and a bare reply box.

**The expanded request is two columns from `lg`.** Left: the full title (the row truncates
it), the detail, attachments, and the **conversation** (`request-thread.tsx`) — a transcript
with initials avatars, Gitwork/Client tags, relative times, and one composer frame (`@`
button · hint · Reply, ⌘↵ sends). Right: a **details card** (stage, category, priority, raised
by, logged, dev label, device, OS, their ref) with **labelled** actions — Create task / Open on
the board, Mark dealt with, and Delete (or the client's Edit / Withdraw) behind a rule,
confirming in place. Same component for both audiences.

⚠️ **The app's global `:focus-visible` ring is unlayered CSS in `layout.tsx`**, so a Tailwind
`outline-none` utility can't remove it. The composer's inner textarea uses an inline
`style={{ outline: "none" }}` and the frame shows focus via `focus-within`. Anything that
embeds a borderless field inside a framed control needs the same.

**@mentions** (`src/lib/wiki-mentions.ts` pure, `src/server/wiki-intake-mentions.ts`):
- Type `@` (never inside an email address) → an **in-flow** list under the text, not a
  popover — the panel is inside `.widget-card` (`overflow: hidden`, §45.2). ↑↓ / ↵ / Tab / Esc.
- Stored twice: readable `@Name` in the body, and `{ id, name, kind }` on the new
  `ClientWikiIntakeComment.mentions` (additive Json). Highlighting and notifying read the
  structured list, so typing "@Javed" by hand never pages anyone, and a person picked then
  deleted from the text is dropped before sending.
- **Who can be mentioned:** internal = every active team member + the client's people;
  the client's side = their people + admins + devs assigned to them + anyone who has already
  replied. Names only, never emails. Ids the caller sends are re-checked against that list
  server-side, so the client can't page someone by guessing an id.
- **A reply that mentions someone posts to the client's Slack Connect channel**
  (`slackExternalChannelId`) — the one channel both sides are in. People found by
  `users.lookupByEmail` get a real `<@U…>` ping; anyone not found is bolded. The link goes to
  the client's **shared wiki URL** (`#intake`), never `/app`. The body is Slack-escaped
  (a client typing `<!channel>` must not page both workspaces) and clipped to 600 chars.
  No external channel or bot token → nothing posted, the reply still saves; the composer
  says which ("@mentions post to #channel" / "no shared Slack channel is connected").
  Sent with `after()`, never fails the reply.

**Also fixed:** the internal reply route posted onto any request **by id, whatever client the
URL named**. It now requires the item to belong to that slug's wiki (404 otherwise).

⚠️ **Known limits:** Slack Connect users from the client's own workspace often can't be found
by `users.lookupByEmail`, so a mentioned client is usually bolded, not pinged. Mentions only
go to Slack — no in-app notification yet. Not verified against a live Slack workspace.

## 70. Recent Changes (October 2026) — Wiki follow-ups: replies, a real XSS, Launchpad, course requests

Eight items from the wiki backlog, built in parallel and merged as one change.

**Requests (§69 follow-ups).**
- **Team mentions notify in Foundry**: event `wiki.request_mention` (in-app + push) to each `team:`
  person mentioned, never the author. Runs beside the Slack post, after the reply is saved.
- **Client mentions ring the client's phone** (Nov 2026; `notifyClientMentionsOnRequest` in
  `src/server/push/client-notifications.ts`, rule `clientMentionRecipients` in
  `src/lib/wiki-intake-reply-notify.ts`). A `client:` mention on a request reply, from either
  reply route, pushes to **that person's** registered devices only (`listActiveClientDevicesForUser`),
  never a colleague's and never the author. The id must be a client user of that wiki (re-checked
  against the table), kind and prefix must both say client, `contact:primary` has no device. Quiet
  hours as for the standup (nothing claimed out of hours); one alert per person per request per 10
  minutes and at most 10 an hour per person, enforced with `ClientPushReceipt` keys
  `mention:<wikiUserId>:<requestId>:<window>`. The payload carries `section: "intake"` and
  `requestId`, never a staff path. Board card threads have no @mentions, so they are not covered.
- **The client is emailed when Gitwork replies** (`src/server/wiki-intake-reply-notify.ts`, pure
  rules in `src/lib/wiki-intake-reply-notify.ts`). The raiser is found by matching `requestedBy`
  to the wiki's `ClientWikiUser`s (email, then name); ambiguous or no match → no email. Never to
  `@gitwork.co.uk` / `@gitwork.io`, never for a client-authored reply, link only when sharing is on.
- **Edit / delete / screenshot on replies.** `ClientWikiIntakeComment` gained `authorWikiUserId`,
  `editedAt`, `deletedAt`, `image`, `thumb`, `mime`, `filename` (additive). Rules in
  `src/lib/wiki-comment-permissions.ts`: staff edit/delete their own (admins may delete, not
  rewrite); a client may change only a reply carrying **their own wiki user id** — never matched by
  display name, so replies posted before this change stay read-only for clients. Delete is soft but
  erases the body, mentions and image. Edits don't re-notify.

**⚠️ A real XSS on the client's public wiki, fixed.** `wiki-page-editor.tsx`'s old string renderer
escaped `& < >` but wrote link URLs straight into `href` and didn't escape quotes, so
`[x](javascript:…)` produced a live link and `[x](https://a/"onmouseover="…)` broke out of the
attribute — on `/wiki/[slug]/[token]`, which the client intake API writes into. It now renders React
elements via `src/lib/wiki-markdown.tsx` (headings, tables, fenced code, callouts, nested + numbered
lists), reusing `renderInline` + `safeUrl` from `markdown.tsx` (`renderInline` gained an optional
class-options argument; defaults unchanged). A test sweeps `src/components/clients/wiki` for
`dangerouslySetInnerHTML`. Fenced code no longer doubles every newline.

**Launchpad.**
- **Per-client requirements** (§43.5's "next change"): internal-only routes under
  `/api/clients/[slug]/wiki/launchpad/custom-items` add/edit/remove `custom: true` checklist items
  (`custom-<uuid>` ids) in **that client's snapshot only**. Template items stay structurally fixed
  (409). Re-assigning a template **carries custom items across**. No token route can change
  structure (tested). Cap 60. Rules in `src/lib/launchpad/custom-items.ts`.
- **File uploads on requirements**: `LaunchpadItemFile` (bytea, metadata-only selects). pdf, images
  (no SVG), docx/xlsx/pptx, txt/csv; **extension AND magic bytes must agree**, 10 MB, 10 per item,
  400 on anything bad (`src/lib/launchpad/files.ts`). Downloads are attachments with `nosniff` and
  `CSP: default-src 'none'; sandbox`; client downloads need the full unlock, not just the share link.
  An upload counts as providing the item (`applyItemPatch`'s third argument).

**Course requests.**
- **Declined feedback is remembered**: `WikiCourseFeedbackSeen` (additive). Recorded only for a real
  classifier verdict (`not_course` / `no_named_course` / `rejected_name` / `duplicate_name`), never
  when it failed or didn't run (§53.3). Re-classified when the customer writes again
  (`lastInboundAt > seenAt`). Operator selection ignores it. Closes §53.7's known gap.
- **Phone layout**: below `sm` each request (and each Added course) is a stacked card; the table is
  unchanged from `sm` up. Status control and actions are shared render functions so they can't drift.

**Verified:** `npm run verify` and `npx next build` — figures in the PR. Every agent proved its tests
discriminate by breaking the code. **Not verified live**: no real database, Resend, Slack or upload
round-trip. Post-deploy: post a reply mentioning a teammate (bell + push) and confirm the raiser gets
an email; add a one-off requirement to a client and upload a PDF against it; open a shared wiki page
and check it still reads the same.

## 71. Recent Changes (October 2026) — Wiki follow-ups, round two

Six items left open by §70.

- **Screenshots are scoped to the client.** The internal request-screenshot and reply-screenshot
  routes (GET and POST) call `assertClientAccessBySlug`. A developer with no assignment, placement or
  `seeAllClients` gets 403. API-key callers keep access. Belonging to the wiki was already enforced
  and still is (404). ⚠️ The reply *list* and *post* routes still don't check client access. They
  share the general gap in §57.6 (2).
- **A reply can be just a screenshot.** Both reply routes accept one multipart request (`body`,
  `mentionIds`, `file`) as well as JSON. Text OR image is required. With neither, the route returns
  400. `readReplyInput` is in `src/server/wiki-reply-image-upload.ts`. Because the image now travels
  with the reply, a failed upload fails the post and keeps the draft. The reply email reads "sent a
  screenshot on…".
- **Older client replies become editable, conservatively.** `backfillCommentAuthors(wikiId)`
  (`src/server/wiki-intake-comment-backfill.ts`) stamps `authorWikiUserId` on unstamped client replies
  older than 2026-10-20. It does so ONLY when the stored author matches exactly one wiki user **of
  that wiki** by exact name or email. Ambiguous replies stay read-only. The permission rule
  (`wiki-comment-permissions.ts`) is unchanged and still id-only.
  ⚠️ This is the one place display-name matching is accepted. It is limited to historical rows,
  because new rows carry the id. It runs lazily on the shared wiki load and on the public
  edit/delete route, capped at 200 per call.
- **The course-feedback scan reaches older conversations.** `scanFeedback` pages newest-first
  until it has 150 *candidates*, with excluded rows not counting toward that. A row is excluded if
  it was imported, or seen with no newer customer message. Capped at 10 pages, so anything past
  1,500 settled rows is still not reached in that run.
- **Uploads can live in object storage** (`src/server/blob-storage.ts`, `docs/blob-storage.md`).
  This covers request screenshots, reply screenshots and Launchpad files.
  - The default `postgres` driver changes nothing.
  - `BLOB_STORAGE_DRIVER=s3` plus `BLOB_S3_*` sends new uploads to a bucket. The row keeps only
    `storageKey`. SigV4 is signed by hand with no AWS SDK, and tested against AWS's published
    vectors.
  - Reads follow the ROW, not the driver: a keyed row needs the S3 vars even after switching back.
  - A misconfiguration throws at first use, and the driver never falls back silently.
  - Additive schema: `storageKey` on three models, and `LaunchpadItemFile.bytes` is now optional.
  - ⚠️ Cascading deletes (whole wiki/client/kit) leave objects in the bucket, and there is no
    cleanup sweep. Nothing migrates existing rows.
  - `deploy.yml` syncs the six `BLOB_*` secrets when they are set.
- **Data, not done from here.** The ~389 junk "Untitled Course" rows (§53) were already gone: the
  200 newest of Wedge's 292 New requests have no unnamed row. The MCP can't filter on an empty name,
  so older statuses were not checked. Wedge **Metrics** still needs switching on by hand (Add New →
  Metrics), because no MCP tool toggles wiki sections.

Not verified against a real database, browser or bucket. **Post-deploy:**
- Post a screenshot-only reply from the app and from the shared page.
- Open a screenshot as a developer not assigned to that client and expect 403.
- Confirm Edit appears on a client's old reply that matches their name.

## 72. Recent Changes (October 2026) — Comparison tables in the wiki

A client-wiki section, **Comparisons** (id `comparisons`): feature tables — Free vs Premium vs
Pro for a release, or the client's product against competitors. Built by Gitwork, read-only for
the client. Same posture as Charts and Estimates: the tables ride down in the wiki DTO and there
is **no** `/api/wiki/[token]/comparisons` route (the wiring test asserts it).

- **Data.** `ClientWiki.comparisonsEnabled` + `WikiComparison` (additive). `columns` and `rows`
  are JSON, replaced wholesale on every write and re-parsed on the way in and out by
  `parseComparisonContent` (`src/lib/wiki-comparisons.ts`, pure): an unknown cell state reads as
  blank, text is clipped, cells for a deleted column are dropped, ids are made unique. A cell is
  `yes · partial · no · text · none`; **`none` (blank, "not stated") is not `no`**.
- **One set of rules.** Limits (`COMPARISON_LIMITS`: 45 columns, 300 rows, 40 tables), the cell
  vocabulary and every edit (`addColumns`, `removeColumn`, `setCell`, …) live in that file and are
  used by the Zod schema, the editor, the server and the MCP tools — so a table Claude writes
  obeys exactly what the editor does. Reads clip silently (a stored table must render); writes
  past a limit are refused with a sentence.
- **Layout.** 2–5 columns share the card width; 6+ get a fixed ~120px each and scroll inside
  the table's **own** scroller, which holds header and body together (§45.2), with the feature
  column and header row sticky and an edge shadow when there is more. On a phone the default is
  a **compare-two** view (featured + leftmost column, pickable), the full table one tap away.
  ✕ is muted grey, not red. Every glyph has its meaning in words; a legend sits under each table.
- **Editing in place**, not in a dialog — a 45-column table does not fit one, and what is edited
  is what the client sees. Edit per table: click a header to rename (Enter commits, Escape
  cancels), `⋯` menus for columns/rows (feature, move, delete with confirm), click a cell to
  cycle ✓ → ◐ → ✕ → blank, type (or the pencil) to write a value. Autosaves 800ms after the last
  change, keeping its own draft so a refetch never overwrites typing. Menus use `anchor` (§55).
- **Client's copy.** `forPublic` sends nothing while the section is off and only publishable
  tables (a column and a labelled feature row) while it is on; the public predicate is the same.
- **MCP:** `list_comparisons`, `get_comparison`, `create_comparison`, `update_comparison`,
  `add_comparison_columns`, `rename_comparison_column`, `remove_comparison_column`,
  `add_comparison_rows`, `set_comparison_cells` (all-or-nothing), `delete_comparison`, and a
  general **`enable_wiki_section`** (comparisons, insights, costs, estimates, delivery, support,
  roundup, meetings, platforms, metrics). Cells are written **by column title**. Writers need
  'Manage clients'; the parity test pins it. Creating a table switches the section on.

**Verified:** `npm run verify` green (6525 tests, `audit:ui` 0 findings), `next build` clean.
Driven headlessly at `/demo/wiki#comparisons` (the demo applies writes to its fixture, so an
edit survives the refetch) at 390 · 768 · 1280×620 · 1440 in view and edit mode: 0 clipping
findings, 0 page overflow, 0 console errors; the feature column stays put while scrolling
sideways, cell cycle → SAVED, rename survives Done, column menus open inside the viewport.
Fourteen sabotages each failed the test named for them.

**Not verified:** a real database. Post-deploy: Add New → Comparisons, create from a template,
add a 6th column and confirm it scrolls with the feature column pinned, then open the share link
on a phone and check the compare-two view.

## 73. Recent Changes (October 2026) — Sheets: a client-editable spreadsheet linked to the task board

> ⚠️ **Retired in November 2026 (§127).** Sheets is no longer a wiki section: its rows moved onto
> the Board as product cards in named lists, and a Table view on the Board replaces the grid. The
> notes below are history. The pure cell rules live on in `src/lib/table/`, the tables and old
> image links stay, and nothing here is reachable from the wiki any more.

Harry's ask: the team and clients keep lists of things to build in Google Sheets, with links
everywhere, and none of it reaches the board. **Sheets** (section id `sheets`) is a typed grid in
the client's wiki that **the client edits themselves**. Any row can be **sent to the dev board**,
and the row then shows how far that task has got.

- **Data.** `ClientWiki.sheetsEnabled` + `WikiSheet` (typed `columns` JSON, `titleColumnId`, and
  three client permissions: `clientCanEdit`, `clientCanAddRows`, and `clientCanSendToBoard`, which
  defaults OFF). `WikiSheetRow` is its own table, not JSON on the sheet, because both sides edit
  rows at once. It holds `cells` JSON, a loose `taskId`, who created it and last edited it, and
  `deletedAt`. Rows are soft-deleted, so a client can't silently erase history and the team can
  restore them. All additive.
- **One set of rules**, in `src/lib/wiki-sheets.ts` (pure). The grid, server, Zod and MCP all use:
  - `coerceCellValue`, one rule per type for text, long text, number, date, select, checkbox, link
    and person. It accepts what a Google Sheets paste carries (UK `DD/MM/YYYY`, `£1,200`, `TRUE`)
    and refuses anything else with a sentence.
  - The limits: 40 columns, 2,000 rows, 40 sheets, 500 rows per batch.
  - Paste parsing (RFC 4180 quoting, tab or comma) and CSV/TSV export. CSV neutralises `=`/`+`/`-`/`@`
    formula injection.
  - The client-permission predicates.
  - ⚠️ Links use a **protocol allow-list**. `javascript://host/%0a…` has a hostname, so the
    hostname check alone does not stop it. A test covers exactly that case.
- **Stage is derived, never stored (§47.2).** `deriveSheetRowStage` reuses `deriveRequestStage`.
  The loader batch-reads the linked tasks in one query. A `taskId` whose task is gone reads
  REVIEWING, never Scheduled, and the team may send that row again.
- **Cells merge per cell in SQL** (`cells || patch - cleared`, in `mergeCells`), never as a
  whole-row replace. So the client and the team editing different cells of one row both land. If
  they edit the same cell, the last write wins. The grid keeps optimistic rows plus a `pending`
  overlay, so a refetch can't undo a save that is still in flight.
- **Client writes** go through `/api/wiki/[token]/sheets/[sheetId]/rows(/[rowId])`.
  - They use Launchpad's hardened posture (`wiki-sheets-access.ts`): token → section on → a
    per-section share link must be FOR sheets → wiki-access cookie or a Gitwork session → per-IP
    rate limit.
  - Everything is enforced in `src/server/wiki-sheets.ts`: only client-editable columns of
    client-editable sheets, rows only if allowed, deleting only rows *they* added (by wiki user id),
    and sending only if allowed.
  - There is **no** client route for columns or sheets, and the wiring test asserts that.
  - "Rows you added" is decided on the server for the page (`applySheetViewer`, like
    `applyCommentViewer`). `forPublicSheets` strips client user ids, assignees and deleted rows,
    and sends nothing while the section is off.
- **Internal routes** are under `/api/clients/[slug]/wiki/sheets/…`. Every handler goes through
  `resolveInternalSheets`, which requires 'Manage clients' **and** `assertClientAccessBySlug` (§71).
  A test counts handlers against gates.
- **Send to board.** It creates a BACKLOG task titled from the title column, with the other cells
  as `**Column:** value` lines plus a link back. It can optionally go in a category (feature
  block). It is **idempotent**: a row with a live task returns that task. The stamp is guarded on
  the `taskId` that was read, so two concurrent sends can't both create a task. A client send
  notifies the team (`tasks.client_request`). A row with an empty title cell is refused.
- **Notifications.** A client edit triggers `wiki.sheet_client_edit` (in-app). It is limited to
  **once per sheet per 15 minutes**, claimed with a conditional update so concurrent edits can't
  both send one.
- **Grid** (`sheet-grid.tsx`):
  - It has its own scroller holding the header and the rows (§45.2). The header is sticky, and the
    first column and Board are pinned.
  - Keyboard: arrows, Tab/Shift-Tab and Enter work as in a spreadsheet. Typing starts editing,
    Escape cancels and Delete clears.
  - Dropdowns and long text open in portalled popovers (§55).
  - Inputs are 16px on a phone. Below `sm` each row is a card, edited in a dialog.
  - The toolbar has fuzzy search, a stage filter, Paste (preview first, `.app-dialog-fixed`), Copy
    (TSV for Google Sheets) and CSV. When rows are selected it is replaced by a batch bar: send,
    remove, restore.
  - Team view only: an amber dot marks a row last edited by the client.
- ⚠️ **Two defects the headless check found and no test did.** Both now have tests:
  - **The pinned columns hid the data.** At 768px the wiki's content column is ~440px, and 44 +
    200 + 172px of pinned columns left almost nothing for the data, so every other column was
    unreachable behind them. Now the columns pin only when there's ≥240px of data window
    (`MIN_DATA_WINDOW`, measured with a ResizeObserver). `scroll-padding` keeps a focused cell
    clear of the pins.
  - **One click opened the editor.** `onFocus` had already marked the cell active by the time
    `onClick` ran. Whether the cell was already selected is now read on mousedown.
  - ⚠️ The jsdom test for the click bug **passed with the bug in place** until mousedown, focus and
    click were split into separate `act()` calls. A single `act` batches them, so the click sees
    the state from before the focus.
- **MCP** (`src/server/mcp/sheet-tools.ts`, a factory spread into `TOOLS`): `list_sheets`,
  `get_sheet`, `create_sheet`, `update_sheet`, `add_sheet_columns`, `update_sheet_column`,
  `remove_sheet_column`, `add_sheet_rows`, `update_sheet_rows`, `delete_sheet_rows`,
  `send_sheet_rows_to_board` and `delete_sheet`, plus `sheets` in `enable_wiki_section`.
  - Cells are addressed by column title. Rows are addressed by id or by the exact text of the title
    cell, and an ambiguous match is an error.
  - `update_sheet_rows` validates every row and value before writing anything.
  - The parity test now reads `sheet-tools.ts` too, at 6-space indentation.

**Verified:** `npm run verify` and `npx next build`, with the figures in the commit. Fourteen
sabotages each failed the tests named for them. Driven headlessly at `/demo/wiki#sheets` (the demo
applies writes to its fixture, `src/lib/demo/demo-sheets.ts`) at 390 · 768 · 1280×620 · 1440, in
view, text editing, dropdown, phone row dialog and paste dialog: 0 clipping findings and 0 page
overflow. Pinned columns never cover a cell, and a typed value survives the save.

**Not verified:** a real database (the `$executeRaw` merge has only run against a mock), and the
client's share page in a browser. Post-deploy:
1. Add New → Sheets, create one from a template and paste in a few rows from Google Sheets.
2. Send a row to the board, move its task to Doing, and reload to confirm it reads In progress.
3. On the share link as a client user, edit a cell and confirm a locked column refuses the edit.

### 73.1 Reorder, resize, people, media, and the Board column as a tracker

Harry's Google-Sheets list, plus a developer's "image/video links like Luke's doc". All of it
goes through the same pure rules as §73: `src/lib/wiki-sheet-layout.ts` (order, sizes),
`wiki-sheet-media.ts` (media), `wiki-sheet-board.ts` (the tracker), and `wiki-sheets.ts`.

- **Drag to reorder rows (team only).** A handle in the first column (hover to see it), or
  Alt+↑/↓ from a cell. dnd-kit, vertical only. Optimistic, saved through the existing
  `PUT …/rows`, rolled back with a notice on failure. **Disabled while a search or a filter
  is on**, with a tooltip saying why: the order of a filtered subset is ambiguous.
  `reorderSheetRows` now takes a partial order and keeps unmentioned rows after it
  (`mergeRowOrder`), and writes only rows that moved. There is no client route: the token
  rows route has no `PUT`, and a test asserts it.
- **Resize by dragging grid lines.** A column header's right edge and a row's bottom edge
  are `role="separator"` handles with aria-labels. Pointer capture (mouse and touch),
  rAF-throttled, a live guide line, saved once per pointer-up (debounced 350ms). Columns
  60–600px, rows 28–300px. Double-click a column edge to fit; a row edge to go back to auto.
  A row with a height wraps its text; an auto row stays one line.
  - **The team's sizes are for everyone:** column `width` in the column JSON, and
    `WikiSheetRow.height Int?` (additive).
  - **A client's sizes stay in their browser** (`localStorage`, per sheet, try/catch). The
    client's cell route is `.strict()`, so `height` or `width` in the body is a 400, not a
    silent drop.
  - The ≥240px rule for pinning (§73) uses the *live* width, so it still holds after a resize.
- **Automatic column widths** (`estimateColumnWidth`, pure, from character counts). A column
  with no saved width sizes to its header and its first 200 values, inside per-type bounds
  (`AUTO_WIDTH_BOUNDS`). A "01, 02, 03" ref column comes out at 64px, not 400. Long text is
  capped at 360px. A saved width always wins. Double-click auto-fit uses the same helper over
  every row.
- **Fast tooltip for cut-off values.** A native `title` waits ~1s and the browser owns that
  delay. Text cells carry `data-full-text`, and a portalled `role="tooltip"` appears after
  150ms (measured 153–158ms in the page), at once when moving between cells. It shows only
  when the value is actually truncated, never on touch, and hides on scroll or a key.
  `aria-describedby` is set on the cell.
  - ⚠️ Its state is a tiny external store (`createTipStore`), **not** grid state. Keeping it
    in `useState` re-rendered every row and added ~100ms (measured 240–270ms before the change).
  - `audit-clipping`'s TRUNCATED rule now accepts a non-empty `data-full-text`, with a
    self-test lookalike for it and one for an empty value.
- **A real people picker.** Person cells store `{ id, name, kind }`, with ids like the
  @mention picker's (`team:` / `client:` / `contact:primary`). Old free-text values still
  render and can be replaced by picking.
  - **One directory**, `sheetPeopleDirectory` in `wiki-intake-mentions.ts`:
    - The team's side is the new `clientTeam` audience: active members (`ACTIVE_MEMBER`) who can
      see this client, i.e. Super Admin, `seeAllClients`, assigned, or placed in Code by email.
      It also includes the client's people.
    - The client's side is the mention picker's restricted list.
  - Served by `GET …/sheets/people` on both sides. The token route uses the hardened writer
    resolve. Emails never reach the browser.
  - **Every pick is re-checked on the server** (`verifyPeople`). An id not on that side's list
    is a 400. The stored name/kind come from the directory, never the request.
  - Headless UI Combobox with `anchor`; it is `static` in a cell, so it is open as soon as you edit.
  - MCP and paste take a name or an email and need exactly one match. Over MCP, an ambiguous or
    unknown name is an error. In a paste it is kept as text and counted in the preview.
- **Media cells** (`media` type): up to 10 `{ url, title? }` per cell.
  - Chips show a kind icon and a tidy title (never the raw URL), plus "+N".
  - Click a chip for the viewer (`.app-dialog-fixed`, ←/→, Esc). Images use `<img>`. YouTube,
    Vimeo and Loom play in a sandboxed iframe; `.mp4`/`.webm`/`.mov` use `<video>`. Drive,
    Figma and unknown links get "Open in new tab". There is always an "Open original" link.
  - ⚠️ **An embed URL is built, never passed through.** The host is matched exactly or as a
    subdomain, so `youtube.com.evil.com` is not YouTube. The id is format-checked, and the
    player URL is fixed origin + id. The viewer also refuses any embed outside `EMBED_ORIGINS`.
  - URLs go through `safeSheetLink`, now in `wiki-sheet-links.ts` and shared with the `link`
    type. Nothing is fetched, by the server or the browser, until someone opens the viewer.
  - Paste a URL into a selected media cell to add it.
  - CSV writes the URLs and paste splits them. Sent rows get `- [title](url)` lines.
  - **CSP:** no change was needed. `next.config.ts` sets only `frame-ancestors`, and no
    `frame-src`, `img-src` or `media-src`, so these embeds load as they are.
- **The Board column is a live tracker.** It shows the stage chip, assignee avatars + first
  name ("Unassigned" when nobody is on it), the due date (amber when overdue by
  `getTaskAttention`'s rule) and when it last moved. All of it is derived at read (§47.2) from
  **one** batched task query (`TASK_SELECT`, join + legacy `assignee` fallback). Hover or tap
  opens a popover with the details; the team also gets "Open on board".
  - **What the client sees, deliberately:** stage, first name + last initial, due date, when it
    moved. Not the task title, emails, ids, priority, estimates, comments, subtasks or the board
    link. `publicRowTask` builds the client's copy field by field, so a new field can't leak by
    default. A test asserts none of those strings reach the public DTO.
  - Filter by assignee (team and client), plus a summary strip of counts by stage.
    A count is a click-to-filter.
- **MCP:**
  - New `reorder_sheet_rows`, which takes an `order` or a `move: { row, before|after }`.
  - `update_sheet_column` takes `width`, and `update_sheet_rows` takes `height`.
  - Person cells resolve by name or email; media takes a URL, an array, or `{url,title}`.
  - `get_sheet` returns names, `{url,title,kind}`, and a `task: { stage, assignees, dueDate,
    updatedAt }` per row. `list_sheets` returns `byStage` counts.

**Verified:** `npm run verify` exits 0 (tsc + lint 0 errors, 6737 tests, `audit:ui` 0
findings), and `npx next build` is clean. Twenty-two sabotages each failed the tests named for
them. Driven headlessly at `/demo/wiki#sheets` at 390 · 768 · 1280×620 · 1440 with real
pointer events across 22 states: 0 clipping findings, 0 page overflow, and 0 console errors
apart from the sandbox proxy blocking the demo's external image.
- Drag moved a row and the move survived the refetch.
- A column went 245→325px with a live guide. A row went 64→104px and back to auto on double-click.
- The Ref column auto-fit to 64px.
- The picker stored a structured person.
- The popover, the filters and the viewer all fit at every width.

**Not verified:**
- A real database.
- A real YouTube, Vimeo or Loom player loading (the sandbox has no outbound network).
- The client's share page with a real wiki login.

Post-deploy:
1. Drag a row, then reload.
2. Pick a person on the share link as a client.
3. Open a YouTube link in the viewer.

### 73.2 Image uploads in media cells (and Claude can attach them)

A media cell can now hold uploaded images, not just links. **Upload** in the cell editor, or paste
or drop an image into it. The team, the client (wherever they may edit), and Claude via
**`upload_sheet_image`** all use the same save path (`src/server/wiki-sheet-files.ts`).
- **Images only, decided by the bytes** (`src/lib/wiki-sheet-files.ts`): PNG, JPEG, GIF and WebP,
  up to 10 MB. SVG and HTML are refused. The stored type comes from the sniffed bytes, never from
  the uploader.
- **An upload is a media item like any link.** The cell stores `/api/wiki/files/<key>/<name>`.
  `safeMediaUrl` accepts exactly that relative shape and no other relative URL.
- **The 160-bit random key is the credential**, like a share link. The image is served by
  `GET /api/wiki/files/[key]/[name]` (under the public `/api/wiki`), with `nosniff` and
  `CSP: default-src 'none'; sandbox`.
- **Storage:** new model `WikiSheetFile` (additive, loose ids). It follows `blob-storage.ts`, so
  the bytes go to Postgres or to the bucket.
- **MCP:** `upload_sheet_image` takes either `imageBase64` or `imageUrl`. A URL is fetched once,
  through the SSRF guard, with a hard 10 MB read cap. With `row` + `column`, the image is
  appended to that media cell; the row and column are checked before anything is stored.
- ⚠️ Removing an image from a cell leaves its bytes stored. There's no cleanup sweep.

### 73.3 Bulk edit, and Sheet settings as a two-pane popup

- **Bulk edit.** When rows are selected, the batch bar now floats at the bottom of the page, like
  the task board's (`data-sheet-batch-bar`). It's portalled to `body`, because `.widget-card` is
  `overflow: hidden`.
  - **Set field** picks a column, then a value: a dropdown option, ticked or not, a person, or
    typed text, number or date. **Clear** empties the column instead.
  - The value goes into every selected live row through the grid's own `saveCell`, up to 6
    saves at once. The same coercion and permission rules apply as for a single cell.
  - The client is offered only the columns they're allowed to edit. Media columns aren't
    offered.
  - Claude already does this with `update_sheet_rows`.
- **Sheet settings** used to be one long scroll of identical column rows. It's now the standard
  fixed-height two-column popup:
  - On the left: "Sheet", then every column with its type.
  - On the right: the selected item's settings. A dropdown column's options are edited as chips
    you can remove one at a time.
  - Every change still saves as it's made.

### 73.4 Images dropped into a Claude chat go straight into a sheet

- **The limit is Claude's, not ours.** In a chat, Claude can see an image you drop in, but it
  can't pass the image's bytes to a tool. Its only options were base64, which is hundreds of
  thousands of characters for a screenshot, or a public link. The dropped file is in Claude's
  code sandbox, so MCP now hands the sandbox a link to send it to.
- **`get_sheet_upload_link`** returns a signed link (`/api/wiki/sheet-upload/[ticket]`), valid
  for 30 minutes, with a ready `curl -F file=@…` command.
  - The ticket is stateless: HMAC over `{client, sheet, row?, column?, issuer, expiry}`, signed
    with the same secret as wiki-access cookies (`src/server/wiki-sheet-upload-ticket.ts`). It
    can't be re-pointed at another sheet. It stays valid for its 30 minutes, so one link covers a
    batch of uploads.
  - The route takes up to 10 files per request and runs the same save path as every other upload.
  - With a row and a media column, the images are appended to that cell. The cell is read at
    upload time, so nothing added in the meantime is overwritten.
  - ⚠️ **Claude's sandbox must be allowed to reach `foundry.gitwork.co.uk`** (claude.ai settings,
    code execution network access). If it isn't, the curl is blocked and the tool tells Claude to
    say so.
- **`upload_sheet_image` takes `driveFile`**: a Drive link or file id, read with the caller's own
  stored Google sign-in (`drive.readonly`). So a private Gitwork file can be attached without
  changing its sharing.
- **Big images are shrunk rather than refused.** Uploads are accepted up to 24 MB. Anything over
  the 10 MB storage limit is re-encoded as JPEG at full resolution, then at lower quality, then
  capped at 4096px (`shrinkToFit`).
  - ⚠️ Sharp runs only after the byte sniff has confirmed PNG, JPEG, GIF or WebP, because sharp
    would also render an SVG.

### 73.5 Sort, a Done view, and ⌘Z

- **Sort** (`src/lib/wiki-sheet-sort.ts`, pure). A toolbar dropdown with two choices per
  column plus the Board. It is a **view, never a write**: the stored drag order is untouched
  and "Sheet order" brings it back. Kept per viewer per sheet in `localStorage`.
  - A dropdown column sorts by its **option order**, labelled with its first and last options
    ("Priority · High → Low"), because A→Z would give High, Low, Medium.
  - Text sorts naturally and ignores case. An unset checkbox is unticked, not empty.
  - **Empty cells go last in both directions.** Ties keep the sheet order. Media can't be sorted.
  - Dragging rows is off while sorted, with a tooltip saying why.
- **Workstream | Done** (`ViewSwitch`). A row whose task is DONE (or CLOSED) leaves the
  workstream on its own and comes back if the task is reopened, because it is read off the
  derived stage (§47.2), never stored. Opens on Workstream. Filters, counts and the stage strip
  work over the chosen half. A drag inside one half lands next to the row it was dropped on;
  Alt+↑/↓ steps over the rows the half hides.
- **Undo / redo** (`src/lib/wiki-sheet-history.ts`, pure). ⌘Z / Ctrl+Z, and ⇧⌘Z / Ctrl+Y,
  plus two toolbar buttons. Undoable: cell edits (a bulk set is one step), the team removing or
  restoring rows, and moving a row. Not undoable: sending to the board and adding a row.
  - Undo writes through the ordinary routes, so the server's edit rules still apply.
  - A text field keeps its own ⌘Z. With several sheets on a page, ⌘Z with nothing focused goes
    to the sheet last clicked (`lastActiveSheet`). The batch bar is portalled, so it is
    matched by `[data-sheet-batch-bar]`.
  - History lives in the tab only and is gone on reload. A client's removals aren't recorded,
    because only the team can restore.

## 74. Recent Changes (October 2026) — Big Wedge revenue on Metrics, and "so far this month"

The Big Wedge adapter now maps a
**Revenue** group from the same report: Premium subscribers, monthly / yearly subscriptions and
**MRR**. ⚠️ The counts are subscriptions **active during** the range, not started in it, and `mrr`
spreads a yearly plan over 12. It reconciles exactly: 5 × 5.45 + 5 × 29.99 / 12 = 39.75 for 1–20
Oct, including a test yearly sub from August that is still active. No currency comes back, so money
figures carry **no symbol** rather than a guessed £. **"Revenue this month"** (cash taken, yearly
counted in full) is mapped from `revenue.cash_revenue`, which Big Wedge's report does **not** have
yet. It appears the day they add it. Adapters can opt in with `monthToDate: true` (only Big Wedge
does) to show the running month as its own **"<Month> so far"** card above the whole-month figures.
It has no trend and no sparkline, is never the headline, and is refetched when it is more than 6h
old. Its range ends today. On the 1st the partial month is replaced by the final one, by the
existing `isFinal` rule.

**Total revenue (same day).** MRR spreads a yearly plan over 12, so it can't answer "what did we
take". The adapter now adds **"Revenue this month (est.)"**: each monthly plan active in the month ×
5.45, plus yearly plans **new** in the month × 29.99 in full. "New" means active in the month minus
active on the day before it started, which takes one more report read. A yearly sub from an earlier
month is in both counts and cancels out, which also drops the August test sub. Big Wedge's API has
**no prices anywhere**, so `BIG_WEDGE_PLAN_PRICES` in `bigwedge.ts` is the only place they live:
change it if they change their prices. If the day-before read fails, the total is **left out**, not
zeroed. Big Wedge's own `cash_revenue` replaces the estimate outright when it exists. It doesn't count
a yearly renewal 12 months on, refunds or plan changes. Money figures carry `money: true` and always
show two decimals (47.70, never 47.7).

**One card, several metrics.** A metric can name a `card: { id, title, part }`, and metrics sharing an
id render as one tile (`tilesFor`). The **first** part is the headline figure, labelled with the card
title. The rest sit underneath as a small breakdown, e.g. **12 Subscriptions** over "6 monthly · 6
yearly". Each part stays its own metric for trends, hiding and history. A card left with one visible
part renders as a plain metric. Big Wedge's Premium subscribers (`premium_users`, the total), monthly
and yearly counts share the `subs` card.

## 75. Recent Changes (October 2026) — The wiki sidebar is grouped

The sidebar had grown to 28 possible sections in one flat list, one row per feature as each shipped.
Measured on production (17 wikis): most clients show 2–6 sections, Wedge shows 13 and After Desk 9.
Sections now sit in six groups — **Overview · Working together · Numbers · Plans & costs ·
Product · Docs & handover** (Numbers is what the product measures: Metrics, Charts, Golf Data;
Plans & costs is what the client is buying or deciding: Comparisons, Estimates, Running costs) — with Dashboard alone at the top and Settings pinned at the foot.

- **One map:** `SECTION_GROUP` in `src/lib/wiki-section-groups.ts` is read by the sidebar *and* the
  "+ Add New" picker. `wiki-section-groups.test.ts` fails if a section is in no group, or if the
  sidebar renders a `navItem` inside a different `group(...)` than the map says. **Adding a section
  means adding it to the map and putting its `navItem` in the matching group.**
- **Headings only above 6 items** (`GROUP_HEADINGS_ABOVE`): on a three-item wiki they would add more
  rows than they organise, so a short sidebar stays flat.
- **Groups fold on desktop**, remembered per browser (`foundry.wiki.sidebar.collapsed.v1`, guarded).
  The group holding the open section is never folded. Below `md` the sidebar is a horizontal strip:
  no headings, and a folded group's items still show (`contents md:hidden`).
- **Add New** is grouped the same way, with a one-line description per section (`SECTION_BLURB`).
- ⚠️ Row spacing is a flex `gap`, not `space-y`: the groups are `display: contents` wrappers, and
  margins from `space-y` do not reach through them.
- Same component on the client's share page, so both views get the groups.

**Layout review (same day).** Every section of `/demo/wiki` was swept at 1440 · 820 · 390 with the
clipping audit plus screenshots. Fixed:
- **Doc pages open READ, formatted.** They always opened in the editor, so the team saw raw
  Markdown (`# Runbook`, `**bold**`). A written page now opens formatted, with a visible
  **Edit / Done** button; an unwritten page still opens in the editor. The mode is decided per
  section and once when the wiki loads, never on refetch, or saving would bounce you out of the editor.
- **Code Handover on a phone.** The version row's label, Current badge and date could shrink to
  nothing, crushing the date into a one-word column under the Download button. The row now wraps
  with a `min-w-[180px]` floor, so the Download group drops to its own line instead.
- **Timeline quarter labels.** A part-quarter at the chart edge (~40px) cut "Q1 2027" to "Q1 2…".
  Narrow bands show "Q1 '27", with the full label in a tooltip.
- **Settings could crash** with `rows.map is not a function` when the linked-clients response wasn't
  an array (the demo's catch-all returns `{}`). Now guarded. With it fixed, the audit found the
  share link ellipsed with no title, so it has one now.

## 76. Recent Changes (October 2026) — Wiki: one Docs row, EMPTY markers, a phone picker, numbering

From the wiki layout review (Dan: "do all 4").

- **The six doc pages are one "Docs" row** (`docsRow()` in `wiki-sidebar.tsx`, list in
  `DOC_PAGE_SECTIONS`), with **tabs** on the page (`wiki-doc-tabs.tsx`, on both the internal wiki
  and the share link). Each page keeps its own section id, so `#runbook` links and per-page shares
  still work. A single-page share shows no tabs, because the other pages weren't shared.
- **What the client can't see is marked EMPTY.** The share page's visibility rules moved verbatim into
  `clientVisibleSections()` (`src/lib/wiki-client-visibility.ts`). The share page calls it, and the
  internal wiki marks every section it leaves out as EMPTY (muted, with a tooltip) and drops the
  "shared" globe from them. One rule, so the marker can't disagree with what the client is shown.
  The wiring tests now read the rules from that module.
- **Phones get a section picker on the internal wiki too** (`WikiMobileNav`, previously share-link
  only), replacing a sideways strip that hid most of a full wiki. It uses the sidebar's groups and
  order, Docs as one entry, EMPTY markers, and **Add New** inside it. It now uses theme colours (it
  hard-coded white).
- **Numbering:** Design System's Overview is 01 (it was 00). Requests' "Action needed" block is a real
  `01 // ACTION NEEDED` card, and the Requests cards follow on via `firstNumber`. Monitors' "client
  preview" (every monitor listed twice) is folded behind **Show what the client sees**.

## 77. Recent Changes (October 2026) — Wiki Settings, simplified, with copy-paste sign-in details

A full pass on the client wiki's Settings (`wiki-access-settings.tsx`).

- **One column, numbered in render order.** Cards are now 01 Access, 02 Request categories (only
  while Requests is on), 03 API intake, 04 Linked clients. Numbers come from a counter
  (`next()`), and the categories and linked-clients panels take `n`. It used to be a masonry
  layout reading 01, 03, 04, 02, with two cards both numbered 05.
- **Access is one card:** the wiki link on one side, who can sign in on the other. Neither works
  without the other. The per-page share list only shows while the whole-wiki link is off; with it
  on, the list was ~25 identical "Included in the full-wiki link" rows. The link's unfurl preview
  is folded.
- **Copy sign-in details** (`src/lib/wiki-invite.ts`): a paste-ready message with the wiki link,
  email and password. ⚠️ The password is stored hashed, so it's only known at the moment it's set.
  Adding a user (a password is generated up front) or resetting one ends on a "copy this now"
  screen that includes it. The per-user **Copy details** says it was "sent to you separately". No
  link (wiki not shared) means no message, and the button explains why.
- **API intake** shows the on/off, the main endpoint and **Copy everything for their developer**
  up front. The integration guide, keys and webhook fold away.
- The **Appearance** card is gone (the header has the same switch). The user dialog is the shared
  `<Modal>` (off `one-modal.test.ts`'s hand-rolled list), and the hard-coded white is now tokens.
- ⚠️ The Access card's grid needs `grid-cols-1`. Without it the single narrow-screen column is
  an implicit `auto` track sized to its widest content, and the link panel ran 183px past the
  edge of a phone, clipped by the card. The clipping audit caught it.

## 78. Recent Changes (October 2026) — Uptime monitors alert, and say when they've stopped

Fellas Loaded went down with Google Cloud (20 Oct 2026) and the client told us first. Three things
were wrong, all ours: the `wiki-monitors` cron had never been put on the VPS (every monitor last
checked **4 Aug**, still showing UP), Fellas had no monitor, and a failing check alerted nobody.

- **Cron:** `*/5 * * * * run-cron.sh wiki-monitors` is on the box (`docs/vps-crons.md`).
- **Alerts** (`src/lib/monitor-alerts.ts`, pure): **down** after `ALERT_AFTER_FAILURES` (2)
  failed checks in a row, **once** per outage (`WikiMonitor.alertedDownAt` is the latch), and
  **back up** with the downtime. A blip that never alerted recovers silently. DEGRADED (slow) never
  pages; UNKNOWN changes nothing. Event `clients.monitor_alert` →
  `["inApp","push","slack"]`, posting to `Workspace.channelRoutes["clients.monitor_alert"]` (set
  to Gitwork's ops channel, `C07L9N75DTR`).
- **Watchdog:** `checkMonitorsWatchdog()` runs from the every-minute **`jobs`** worker, a different
  cron from the one it watches, so the two can't stop together. A monitor not checked for
  max(3× interval, 30 min) is reported once (`staleAlertedAt`); the next check clears it.
- **No stale UP:** the DTO carries `stale`. A stale monitor shows "Not checking" / "Last checked …",
  internally and on the client's board, never its last result.
- **Cards + suggestions:** the internal Monitors list is cards (2-up md, 3-up xl when there's more
  than one). "From this client's Platforms" offers one-click monitors for Platform URLs nothing
  watches (`src/lib/monitor-suggestions.ts`). Admin and login paths become the site root.
- **Unstable** (added same day): 3 of the last 6 checks failing alerts as **Incident: Degraded**, which
  two-in-a-row never would for a service failing every other check (Google's London outage left
  some services "intermittently erroring"). It clears only after a full clean window, so flapping
  gives one alert and one "stable again". Failures before `alertClearedAt` don't count. Fields
  `alertKind` / `alertClearedAt`.
- **Every minute while failing:** `checkEveryMs` re-checks a failing monitor (or one with an open
  alert) every minute instead of its interval, and the cron is now `* * * * *`. That gives a
  down alert in ~6 min and a recovery notice within a minute.
- **Slack layout like GitHub Status** (`alertBlocks`): an "Incident: Down/Degraded/Resolved" line,
  linked title, description, every service on the client with ✅/🔴/🟠/🟡, an Open in Foundry
  button, and a footer. Capped under Slack's 50 blocks. `DispatchInput.slackBlocks` carries it;
  title and body stay the plain-text fallback.
- ⚠️ **`NEXT_PUBLIC_APP_URL` on the VPS was `https://foundry.gitwork.tech`, a domain that doesn't
  resolve.** That broke every "Open in Foundry" Slack link, email links and the DocuSeal webhook
  address. It's now `https://foundry.gitwork.co.uk` (21 Oct 2026; backup in `/root`).
- **Fellas** now has three monitors: production API (`/api/feed/categories/`, which reads from the
  DB, not just the web server), website and analytics. Its API has no health endpoint.
- ⚠️ **Found while doing this:** Fellas' `/api/analytics/*` endpoints answer without auth,
  including `trials/export/`, a CSV of ~5,650 customer emails. Reported to Dan to lock down in
  the Fellas codebase.

## 79. Recent Changes (October 2026) — One changelog ping per version; Metrics gets a headline row

- **One Slack message per changelog VERSION.** A version is one `ClientChangelogEntry` per
  platform and the editor saves them as parallel requests, so iOS + Android sent two
  identical "added" messages (and two "approved"). `wiki-slack-notify.ts` now collects pings
  for the same wiki + version for `CHANGELOG_PING_WINDOW_MS` (3s) and sends one naming the
  platforms. In-process on purpose: one server, one save. Adding a platform to a version that
  already had rows is an edit and sends no "added".
- **Changelog card actions.** Approving was a click on the amber "● PENDING" pill, which
  read as a label and got missed. Status is now a plain badge; a pending version has an amber
  bar with a green **Approve release** button; Copy / Edit are labelled; Mark as pending and
  Delete sit in a ⋯ menu, and Delete confirms in place. Filters are segmented controls, and the
  status filter shows counts. The demo carries a pending two-platform release.
- **Metrics page** (`wiki-metrics-section.tsx`): a **Period** control (the running month,
  then each stored month, built from data already on the page with no fetch) and a
  **Show** filter (groups). `01 // HEADLINE` shows four large cards: ★ picks first, then one
  from each group in turn (`headlineTileIndexes`). `02 // ALL METRICS` shows the rest.
  Choosing a group shows only that group.
- ⚠️ **Big Wedge's new revenue fields ignore the date range** (22 Oct 2026). `cash_revenue`
  £373.81, 8 monthly + 11 yearly, MRR £71.41 and `premium_users` 19 come back identical for
  August, September, October and a single day. User counts still follow the range.
  `revenueIsRangeScoped` compares the month with the day before. When the two match,
  "Revenue this month" is dropped. A month that has ended then keeps no revenue figures, and
  the running month keeps the counts and MRR, which are true now. Ask Big Wedge to scope
  revenue to `start_date`/`end_date`.

## 80. Recent Changes (October 2026) — Pulse measures code health from a full checkout

Prompted by Code Tuner (a competitor showing per-class complexity and a tech-debt view). Pulse
read source by sampling ~150 files through the GitHub API and pattern-matching. That can't say
"this method has a complexity of 34, at line 120". A repo scan now also takes a **shallow clone
and parses every supported source file with a real parser** (tree-sitter, as WebAssembly), in
`src/server/code-health/`. Validated against Code Tuner on `pallets/flask`: class line spans
match exactly. Weighted complexity is one lower per class, because they add 1 per class.

- **Pipeline:** `clone.ts` (hardened shallow clone) → `analyse.ts` (which files, then parse) →
  `measure.ts` (one tree walk: per-function complexity, length, params, nesting; per-class
  methods + weighted complexity) → `rules.ts` (thresholds, register, score) → `checks.ts` (7
  `code_health_*` checks, CODE_QUALITY). The report lives at `PulseScan.agentData.codeHealth`
  (no schema change). It's rendered by `CodeHealthPanel` on the scan overview and on the
  shared report/PDF (25 rows). Each register row links to the exact line on GitHub at the
  commit measured.
- **Languages:** TS, TSX, JS, Python, Swift, Kotlin, Java, Go, PHP, **Dart and Ruby** (phase 2).
  Anything else (Rust, C#, …) is counted under "Not measured", never as zero. ⚠️
  `web-tree-sitter@0.25.10` and `tree-sitter-wasms@0.1.13` are **pinned as a pair**. 0.20.8
  could not load Dart (ABI 15) or Ruby, and 0.22.6 crashed on Dart. 0.25 deprecates
  `setTimeoutMicros` (it throws), so parses are budgeted with a progress callback
  (`parseWithBudget`). Bump them together and re-run `src/server/code-health/__tests__/measure.test.ts`,
  which uses real parses. A wrong grammar node name fails silently (that construct just stops
  counting); that test caught Swift's `default_keyword`. ⚠️ **Dart puts a function's body beside
  its signature, not inside it** (`LanguageRules.bodyAfterSignature`).
- **Thresholds are published ones** (SEI complexity bands 11/21/51; class weighted complexity
  47, from Lanza & Marinescu). The register says **"large class", never "God Class"**: that rule
  also needs cohesion measures we don't take. There's **no dead-code check**, because that needs
  a whole-program call graph.
- **Score** (`scoreOf`) is share-based: big repos aren't punished for size, nested functions
  aren't charged twice, and tests are excluded. The formula is in the doc comment.
- **Clone safety:** github.com `owner/repo` only. The token goes in an HTTP header, never the
  URL. Hooks, symlinks and the file protocol are off, and git runs with a clean environment.
  Nothing in a checkout is ever executed. Limits: 500 MB repo, 90s, 2 clones at once, 6,000
  files, 60s of parsing. The directory is always deleted. A clone doesn't count against the
  shared GitHub REST limit (§62.7).
- **It never fails silently.** A clone or measure that can't run emits one INCONCLUSIVE
  `code_health_score` saying why. The sampled `clean_file_size` / `clean_nesting_depth` are held
  back while it runs, then dropped if it succeeded or shown if it didn't
  (`SUPERSEDED_BY_CODE_HEALTH`), so a scan never gives two answers to one question.
- **Deploy:** the runner image installs `git` (Dockerfile). `next.config.ts` externalises
  `web-tree-sitter` and traces the runtime plus the nine grammars. Paths resolve from
  `process.cwd()/node_modules`, never `createRequire`, which webpack warns on.
- **Measured** (shallow clone + parse): flask 1.0s · express 0.9s · Alamofire 3.4s ·
  okhttp 2.4s · cal.com (320k lines) 13.9s.
- **Phase 2 (shipped):**
  - **History** (`history.ts`): the clone is blobless + `--shallow-since` 12 months, so every
    commit and tree for a year, but only current file contents. `git log --name-only
    --no-renames` reads trees only, so nothing is fetched lazily. Bots and mass edits (>60
    files) are left out. Produces **hotspots** (change frequency × complexity, Tornhill's
    method), **bus factor** (fewest people who are main author of over half the changing
    code), owners, and **change coupling** across folders. Change is counted in commits, not
    lines, because line churn needs old file versions.
  - **Trend** (`trend.ts`, `enrich.ts`): against the last measured scan of the same repo.
    Debt is matched on kind + file + symbol, never line. Resolved items are only counted when
    the list was under the 100 cap.
  - **Costed register:** `EFFORT_HOURS` per kind × severity (published, coarse, "not a quote"),
    one per function at its worst. Days shown everywhere; **£ only in the internal view**
    (`showMoney`), priced with the workspace day rate (`blendedDayRateGbp`), never on a shared report.
  - **MCP**: the verdict carries `codeHealth` (score, effort, bus factor, top debt, hotspots).
  - **Language-aware repo checks** (`pulse-checks/repo-language.ts`): a repo that isn't a
    JavaScript project (no root package.json, JS not dominant) skips `has_typescript`,
    `has_unit_test_config`, `has_e2e_tests` and `is_monorepo`. `has_linter` now recognises ruff,
    flake8, Pylint, RuboCop, golangci-lint, detekt, SwiftLint, PHPStan and Dart analysis
    options. It reads `pyproject.toml` only when nothing else answered. Found by scanning Flask
    on production, which was told "No TypeScript".
  - **Weekly digest email** (`pulse-agents/monitor-digest.ts`): a monitor with recipients
    (`PulseMonitor.digestEmails`, additive) gets a summary after its scheduled re-scan once a
    week has passed. It rides on the existing `pulse-run-monitors` cron, so no new crontab
    line. It covers score movement, new/fixed/open confirmed issues, code health and hotspots,
    and one link to the shared PDF. One email per recipient, so client addresses aren't
    shared. The monitors GET/PATCH/DELETE routes now require `canManagePulse`; they returned
    webhook secrets, and now recipient addresses, to any session.
- **Still not built:** branch choice (the default branch is measured), Provenance
  `subjectCommit` (the commit is now known), C#/Rust.

## 81. Recent Changes (October 2026) — A shareable "What Pulse checks" page

`/pulse/features` is public, not indexed, and made for sending to someone. The **About Pulse** card
(`02 // ABOUT PULSE` on /app/pulse, replacing Research studies) shows the counts and copies the link.
Study is still reachable from a scan's results and at /app/study.

- **It stays current by construction.** The check total and per-area counts come from
  `CHECKS_REGISTRY` (`src/server/pulse-capabilities.ts`), and the product types come from the scan
  form's `PULSE_PLATFORM_LABEL`. The plain-English lines live in `src/lib/pulse-capabilities.ts`.
  `AREAS` is keyed by every `CheckCategory`, so a new category is a type error until it is described.
- ⚠️ **Shipping a Pulse capability? Add it to `EXTRAS` in the same PR.** Each entry names its
  `evidence` file. A test fails if that file is gone, so a removed feature can't stay advertised.
  Nothing can detect a *new* feature on its own; this rule is what keeps the page complete.
- Copy is written as if everything had always existed. A test rejects "new", "recently", "latest"
  and years.

## 82. Recent Changes (October 2026) — The platform families checked against 18 real projects

§37 shipped 116 platform checks tested only on fixtures, and said that real repos are what find the
wrong ones. This audit did that: 18 real projects, every non-PASS verdict checked against the
source (or with curl for live APIs). About 60 of ~450 verdicts were wrong. All of them are fixed,
each with a two-sided test.

- **The tool: `scripts/pulse-family-local.ts <clone> [--all]`.** It rebuilds the production
  snapshot from a local clone with the same selection functions, then runs whichever family the
  repo resolves to. It makes no API calls, so there's no rate limit. Use it on any new family
  before shipping.
- **Projects:** electron/fiddle, marktext, clash-verge-rev (Tauri); bluesky social-app (Expo),
  mattermost-mobile, rainbow; serve, np, zx, npm-check-updates; nowinandroid, NewPipe,
  thunderbird-android; darkreader, refined-github, uBlock, uBOL-home; plus live APIs (GitHub,
  Stripe, httpbin, jsonplaceholder, a public GraphQL, petstore).
- **The worst finds, all fixed:**
  - `stripCStyleComments` nested block comments. A common Java banner (`/*////…////*/`) never
    closed, and the Android family stripped the JOINED sample, so **89% of NewPipe's code was
    deleted before any check ran**. It now strips per file, and nests only for Swift, Kotlin and
    Dart (`nestsBlockComments`). The default is unchanged for other callers. ⚠️ JS/TS callers
    still treat block comments as nesting, which JS does not. That's a follow-up.
  - Safari Web Extension wrappers (an `.xcodeproj` + `SafariWebExtensionHandler.swift`) made
    **refined-github and uBOL-home scan as iOS apps**, and they were told they had no tests.
    `isSafariExtensionWrapper` in `resolveSnapshotShape`.
  - **API CORS reflection was a HIGH FAIL with no evidence of cookie login** (Stripe and three
    more). It's now FAIL only when a session cookie is seen, otherwise a MEDIUM WARN. The
    relevance gate also hid this check (and GraphQL introspection) behind feature `accounts` /
    `public_api` on most API scans. Those gates are now `feature: null`.
  - **GraphQL endpoints were scanned as websites**, because a bare GET returns 204.
    `pulse-lite/api-target.ts` `answersAsApi`.
- **Recurring causes, now fixed:**
  - JS/TS never reached the must-read sampling tier (`SOURCE_EXT`), the Dart bug of §34.6 again.
  - Tests, mocks, build scripts and fixtures were read as app code.
  - Keywords were matched inside comments and strings.
  - One global regex was satisfied by an unrelated call site. Checks are now judged per call site.
  - Monorepo manifests were read from the root only.
  - Expo `app.config.*` was never parsed (`parseExpoNativeConfig`, `rnAppShell`).
  - "Not found" was reported confidently on a 4–12% sample, or as SKIPPED. Absence now goes
    through the coverage gate and becomes INCONCLUSIVE.
- **Android reads more now:** manifests, module build files, convention plugins, the version
  catalog and the network-security config get their own budget (`selectAndroidBuildInputs`),
  outside the 60-file config cap. Thunderbird went from 8 to all 27 manifests. Cost: about 70–90
  more GitHub reads per Android scan.
- **Desktop sampling** is app-root aware (`desktopAppRoots` / `desktopRelevance`). MarkText's
  sample was half the bundled editor library.
- **Constants:** `RN_OLDEST_SUPPORTED_MINOR` = 86 (RN 0.88 is current, as of 2026-10-15).
- **Result:** the three FAILs left across all 17 repos are true: Thunderbird and Mattermost
  allow cleartext traffic, and Bluesky persists `accessJwt` to AsyncStorage.
- **Known follow-ups:**
  - Flutter's `xp_deep_link_both_platforms` counts the launcher intent-filter as a deep link, and
    its permission parity compares raw counts (React Native now maps categories).
  - JS block-comment nesting (above).
  - darkreader `ext_x_privacy_policy` dropped to INCONCLUSIVE, because `.tsx` files now compete
    for the sample cap.
  - Recommend retiring `android_x_app_bundle` (withheld).

Also in this change: **Code measures candidates' actual code** (§35), and **Countermarks are
pinned to the commit examined** (§38).

**Overview page polish (same day):** `/pulse/features` uses one search bar with a section
dropdown (not a wall of pills). Area cards are a fixed size and open a side panel (a bottom
sheet on phones) instead of expanding in place. "What it scans" maps each way in to the product
types it covers (`PULSE_INPUTS.products`, keys of the scan form's list, test-enforced). An
**example scan** section (`example-scan.tsx`, data in `src/lib/pulse-examples.ts`) animates a
score, the six pillar bars and findings per product type, with a slider that turns debt days
into weeks. Its overall score is computed with the real PILLARS weights, never typed. ⚠️ It
renders the finished values first, and the reset to 0 happens inside the first animation frame.
A hidden tab never runs one, and resetting earlier left a screenshot showing a score of 0 (§39).

## 83. Recent Changes (October 2026) — Code portfolio, import graph, OSV library audit, framework benchmarks

Built after a call with Julian Bass (Salford; his product "CodeTuner"), which demoed tech-debt tracking
across a portfolio of products, framework benchmarks, a debt register with vulnerable libraries,
and weekly snapshots. Pulse already had the register, history, trend, effort and weekly email (§80);
this adds what it lacked. Everything is deterministic: no AI anywhere in it.

- **Code portfolio** — `/app/pulse/portfolio` (API `/api/pulse/code-portfolio`, demo `/demo/pulse/portfolio`; ⚠️ NOT `/api/pulse/portfolio`, which is the top cards’ client scores), linked from the
  Pulse page. Every measured GitHub repo side by side (score sparkline, debt days, vulnerable
  libraries, cycles, bus factor), plus **"where to spend the next N days"**: a pure planner
  (`src/lib/code-portfolio.ts`, re-run in the browser as the slider moves) that ranks work items
  from every repo. Known vulnerabilities go first regardless of value per day; the rest is by risk
  removed per day, with debt in a hotspot weighted up to 4× (`churnMultiplier`; unknown churn = 1,
  never 0). Items that don't fit are skipped and smaller ones still tried; security items left out
  are counted on the page, never dropped silently. Loader `src/server/code-health/portfolio.ts`,
  scoped exactly like the scan list. It reads each scan's score with one `$queryRaw` on
  `agentData->'codeHealth'` so old reports are never loaded whole; a newer scan whose measure failed
  does not hide the last good one (listed as unmeasured instead).
- **Import graph** — `src/server/code-health/structure.ts`: imports read from the source the measure
  already parsed, resolved to files (tsconfig `paths`/JSONC/`extends`, go.mod, PSR-4, pubspec, Python
  packages, Java/Kotlin package dirs), iterative Tarjan for cycles, hubs (fanIn ≥ 8 and complexity ≥
  40, or fanIn ≥ 20), longest chain. New checks `code_health_import_cycles`, `code_health_hub_files`.
  ⚠️ **Two exclusions, both found by checking real repos, and both keep the claim honest:**
  TypeScript `import type` / `export type … from` are left out (erased at compile time; counting
  them reported a 79-file "cycle" in zod that was type references — the real one is 2 files), and
  Python imports are module-level only (column 0): an indented import is inside a function or
  `TYPE_CHECKING`, the deliberate way to break a cycle (httpie had 3 false cycles). Swift imports
  name modules, so a Swift-only repo has no graph (null → INCONCLUSIVE, never a pass).
- **Library audit** — `src/server/code-health/dependencies.ts`: npm (package-lock v1–3, yarn v1/berry,
  pnpm v5–9), PyPI (poetry, Pipfile.lock, pinned requirements, uv), Packagist, RubyGems, Go, crates.io,
  Pub, read from the checkout and checked against OSV (`api.osv.dev` querybatch + vuln details, no
  key). Check `dependency_osv_vulnerabilities` (SECURITY). OSV unreachable or no lockfile →
  INCONCLUSIVE, never "clean". It **supersedes `dependency_vulnerabilities`** (Dependabot via GraphQL,
  often unreadable with our token) **only when it actually ran** — `answeredByCodeHealth()` in
  `checks.ts`; `run-lite-scan.ts` releases any held sampled check the full measure didn't answer.
  Lockfile fixtures are named `*.fixture` so Dependabot doesn't flag this repo for them.
- **Benchmarks** — `src/server/code-health/benchmark.ts` + `benchmarks.json`: 20 open-source
  frameworks (Express, Fastify, NestJS, FastAPI, Django, Flask, Laravel, Gin, Alamofire, Bloc…) measured
  by the same measure, each pinned to a release tag + commit (a test enforces it). Drawn as dot strips in
  the code-health panel. Regenerate with
  `node --max-old-space-size=8192 --liftoff-only --import tsx scripts/code-health-benchmarks.ts <cloneDir>`
  (`--liftoff-only` because Node 24 OOMs compiling the Swift grammar; `npx tsx` can't pass it).
  `docs_src/` is now excluded from the measure (FastAPI keeps example code there).
- Weekly email lists critical/high libraries (marked new) and the cycle count. The code-health panel
  states the data handling: the checkout is deleted when the measure ends; only measurements, paths
  and function names are kept — which is the honest answer to a client NDA question.

Verified end to end against real repos (OWASP NodeGoat: 131 of 1,091 pinned libraries vulnerable, 28
critical; zod; httpie; gin), with every cycle checked against the source. Not verified against
production data — post-deploy, open `/app/pulse/portfolio` and re-scan one client repo so it gains
the structure and library sections (older reports show "not checked").

### 83.1 Reports that are clear and constructive, tested on a real client repo

Asked "is this the best it can be?", the honest answer was no: the facts were right, but the
report was ordered for developers and said what was wrong rather than what it meant.

- **Plain consequences** (`src/lib/plain-words.ts`): each vulnerable library gets "It could let
  someone get past sign-in…" from its advisory text; each debt item gets what it costs, naming the
  product area ("This is payments code…"). Areas match **whole path words** — substring matching
  read `state.dart` as reporting and `border` as orders, and called a content feed "data syncing".
- **A themed plan** (`src/lib/plain-impact.ts`, `actionPlan`): security as one step, a big import
  loop on its own, the most-changed files, then debt **grouped by product area** (payments and
  sign-in weighted ×3, which is what their step says), central files, and a catch-all last. Each
  step has time, benefit and cumulative risk removed. ⚠️ Item-by-item ranking on value per day was
  tried first and surfaced three trivial 2-file loops ahead of a 181-file knot on a real app.
- **Summary** adds how soon most risk is gone and, when one step does a lot, says so ("the first
  step alone, about 5 days, removes about 47%"). Code-health panel reordered to match the plan:
  summary + plan, stats, libraries, structure, register, history, benchmarks.
- **Portfolio** ranks by urgency (`urgencyOf`: serious holes → getting worse → one-person
  knowledge → poor → fair → unchecked → good), with a plain "Needs" column.
- **Real-data fixes from Fellas Android (Flutter, private):** build_runner output skipped by name
  (`.freezed/.gr/.config/.mocks/.chopper/.gen.dart`) and banner (`GENERATED CODE`, `DO NOT
  MODIFY`); `copyWith`/`copy` never registered as debt (size tracks field count by design) — the
  two together took its estimate from 248 to 159 days; a hub must be widely used **and** complex
  (a simple shared error type imported by 260 files topped the plan); "most changed" is the top
  three hotspots with ≥3 changes, because hotspot scores are relative and a quiet repo (69 commits
  a year) never reached the old fixed 0.5 threshold. Its 181-file loop was checked in the source
  and is real (`navigator_helper.dart` ↔ `home_page.dart`).

### 83.2 The whole report in plain English, and MCP scans that save

- **`src/lib/plain-report.ts` (`summariseScan`)** — an "In plain English" box at the top of every
  scan (in-app overview and the shared report/PDF): ready or not, up to five "Fix first" findings in
  plain words, and how many things Pulse could not check (never implied fine). Order is Pulse's own
  `rankFindings`; meanings match the check key (first rule wins, so `release_logging` = passwords
  in logs is ruled before generic logging), fall back to "Not yet in place: <label>", and one
  meaning is said once however many checks found it. Code-health checks are left to their own
  summary. Tested on Fellas Android's real findings: staging server, unencrypted traffic, no tests.
- **MCP `pulse_scan` takes `saveToClient`** (+ optional `projectName`): also creates a full in-app
  scan on that client, the same path as `POST /api/pulse/scans` (needs `ai.generate`, client must be
  in scope, runs in `after()`). Before this, MCP scans returned a verdict and saved nothing, so a
  repo scanned from Claude never reached the client's list or the code portfolio.

## 84. Recent Changes (October 2026) — Pulse checks bolstered; projects, history and compare

From a full Pulse audit (Dan: checks first, then tracking). Two parts.

### 84.1 The check catalogue

Every check family was re-read against the honesty rules (§35, §44, §58). Fixed:

- **Security** (`security-extended.ts`):
  - `subdomain_takeover_risk` FAILs only when the CNAME points at a provider AND the provider's
    "unclaimed" page is served or the target is NXDOMAIN (`assessSubdomainTakeover`). A CNAME into
    Heroku or S3 is how those are hosted, not a takeover.
  - `certificate_expiry_30d` reads the real certificate (`tls-certificate.ts`) instead of guessing from HSTS.
  - DNSSEC, bot protection and BIMI are good practice: absent reads **NOT_APPLICABLE**, never WARN.
- **Secrets.** `secret-formats.ts` (`findSecrets`) holds the vendor formats and marks Stripe `pk_live_`
  and Google `AIza…` as public by design. `no_api_keys_in_html` uses BOTH matchers.
  - ⚠️ `findExposedApiKeys` is still needed because `findSecrets` requires mixed case and so drops
    DeepSeek-style `sk-` + hex keys. Switching to `findSecrets` alone reintroduced exactly that false
    negative; `security-extended-fp.test.ts` catches it.
  - `secret_scanning_github` now covers only the server-side formats (Stripe `sk_live_`, Slack, PEM…).
- **Exposure probes.** `no_exposed_env` and `no_exposed_git` are INCONCLUSIVE when the probe went
  unanswered (status 0, 429 or 5xx). They check the body against the file's real format (`path-probe.ts`).
- **Legal** (`legal-extended.ts`, `business-operations.ts`): a regional privacy law whose market is
  anchored (₹, CNPJ, ICP, Pte. Ltd., en-CA…) but not mentioned on the homepage is **INCONCLUSIVE**.
  The notice usually lives in the privacy policy. An unrelated market stays SKIPPED. `eu_ai_act`
  needs real AI use.
- **AI** (`web-repo-source.ts`, `ai-app-safety.ts`): the `pulse_ai_*` safety rules run only when the
  repo DOES something with an LLM (`AI_USAGE`: an SDK import or API call), never when it names one.
  A long system prompt is flagged only in a file that ships to the browser.
- **Operational depth** (`operational-depth.ts`): a gap found by keyword is a **WARN, at MEDIUM
  confidence at most**. The control may live outside the repo.
- **Repo and web basics.** `repo-basics.ts` covers has_tests, has_linter, ci_cd_present and
  has_dependabot below the root. `web-basics.ts` covers custom domain, third-party scripts, response
  time over two samples, and error monitoring.
- **Private repos** (`private-repo.ts`): checks that need public metadata are not reported as
  missing for a private repo.

**Withheld:** 237 → 216. Twenty-four checks were fixed and un-withheld. Three still-keyword checks
were added: `roles_depth_default_deny`, `roles_depth_server_authorization` and
`auth_depth_generic_login_errors`.

**The advertised count is the live count.** `LIVE_CHECKS` (`checks-registry.ts`) is the registry
minus `standards_*` rows and minus WITHHELD keys. `ADVERTISED_CHECK_COUNT`, `pulseCapabilityCounts`,
the features page and `llms.txt` all read it. The count went from **1,700 rows to ~1,090 live, "over
1,000"**. Un-withholding a check raises it. The features page drops a section with no live checks
(Standards).

### 84.2 Projects, history and compare

- **A project is a target, not a name.** `targetKey()` (`src/lib/pulse-projects.ts`) gives
  `repo:owner/name`, or `url:host+path` (lower-cased, without `www.` or a trailing slash). It is the
  one rule used for the list, history, diff and portfolio. Before, they disagreed, so `Example.com/`
  was one project on the home screen and two in its history.
- **Home** (`PulseProjectsView`) is **By project** by default, with **All scans** one click away.
  Projects needing a look sort first (`buildProjects`):
  1. fell 5+ points since the last scan;
  2. the last scan failed;
  3. score below 50;
  4. not checked in 60 days.

  The portfolio average counts each project once, at its latest score. Re-scans used to inflate it.
- **Project page** `/app/pulse/projects/[slug]`: a dated score chart, a compare picker and every scan.
  **Compare** `/app/pulse/compare?from&to`: any two scans, via `GET /api/pulse/scans/[id]/diff?against=`.
  Access is checked on both scans. `ScanDiffBody` (`pulse-scan-diff.tsx`) is shared with the scan
  page's "since last scan" card.
  - ⚠️ "Couldn't check this time" is its own block. A problem the new scan could not re-check is
    still outstanding, not fixed.
- **The plain summary follows the gate.** `summariseScan(checks, n, gate)` takes its headline from
  the release decision. The box sits directly under the gate banner, above the tabs. Before this, a
  BLOCKED scan could open with "Mostly ready".
- Demo: `/demo/pulse`, `/demo/pulse/projects/…`, `/demo/pulse/compare` (older Northwind and Fairway scans).

**Not verified against production data:** projects grouping on real history, and the TLS read on
the VPS.

**Dependency advisories cleared (same day).** New advisories for zod, undici, nodemailer and
ip-address had turned `audit:dependencies` red on `main`, and the pre-push hook blocks on it. Fixed
in the lockfile only (`npm audit fix --package-lock-only`), as its own commit. Every bump stays
inside its current major version: puppeteer-core 25.1 → 25.16, zod 4.3 → 4.6, mailparser 3.9 → 3.12,
nodemailer 10.0 → 10.2. Verified with a real `npm ci`, the full gate, `next build`, and a
puppeteer-core PDF render.

### 84.3 One clear scan page

- **Four tabs: Summary · All checks · Plan · Technical.** There used to be eleven. The older tab
  ids still exist, mapped through `PRIMARY_OF`, so `setActiveTab("gaps")` from a card and old
  deep links still land in the right place.
  - Plan's five parts (Readiness, Gaps, Opportunities, Roadmap, Stack) are one row of choices
    inside the Plan tab.
  - Compliance by market sits under All checks.
  - Competitors, the discovery kit and the agent tools are in Technical.
  - The overview's duplicate roadmap card is gone.
- **Order above the tabs:** cover, then the release banner, then the plain-English box. The
  confidence/grades row moved into Summary and the agent panel into Technical, so the decision and
  the fix-first list come before the detail.
- **One set of status words** (`src/lib/pulse-status-words.ts`): Fix · Worth fixing · Passing ·
  Couldn't check · Doesn't apply. The scan page, the shared report, the status icons and the lead
  popup all use them. All checks shows a legend explaining each word and a "Couldn't check" filter.
- **Fix first says who does it.** `ownerFor(category)` in `plain-report.ts` names who usually fixes
  each finding: your developer, whoever runs your domain and hosting, whoever runs your content and
  marketing, or you or your legal adviser.
- **The shared report shows the gate's reasons.** `ReleaseGateBanner` moved to
  `release-gate-banner.tsx` and renders above the plain box in both places, in the same order.

### 84.4 Library audit covers Java, .NET and Swift

`src/server/code-health/dependencies.ts` now also reads `gradle.lockfile` (OSV `Maven`),
`packages.lock.json` (`NuGet`, with Direct/Transitive, the repo's own `Project` entries skipped) and
`Package.resolved` (`SwiftURL`, v1 and v2/v3 layouts, including Xcode's
`…/xcshareddata/swiftpm/Package.resolved`).
- ⚠️ OSV names a Swift package `github.com/owner/repo`, with no scheme and no `.git`. With either one
  the query returns nothing, silently. Checked live against swift-nio: 4 advisories under that
  name, 0 under the full URL.
- A Swift pin on a branch or a bare revision has no version, so it is skipped.
- `pom.xml` is deliberately not read: its versions come through properties, parent POMs and BOMs,
  and a version rebuilt from those would be a guess.

Tests use real lockfiles from Netflix/maestro, stripe-ios and WinMemoryCleaner.

### 84.5 Standards controls derived from live evidence

`standards-derived.ts` (`DERIVED_STANDARDS`) names 146 of the 391 `standards_*` controls that a live
check can speak to, and which checks each one rests on. It replaces `EVIDENCE_BINDINGS`, which had
two wrong bindings:
- a valid certificate alone passed "transport encryption required end to end";
- `web_unsafe_deserialization` was bound to the template-injection control.

`EVIDENCE_BINDINGS` also ignored WARN evidence.

How a derived control gets its verdict:
- Any FAIL or WARN at MEDIUM or HIGH confidence on its evidence gives that verdict.
- PASS needs a complete proving group. Only `deep_supply_01` (lockfile) and `deep_host_08` (Tauri
  updater key) have one.
- Anything else is INCONCLUSIVE and hidden.

**They are NOT counted in `LIVE_CHECKS`.** A derived row restates checks that already ran, and 144 of
the 146 can only ever fail. Counting them would raise the advertised number without Pulse observing
anything new. The classification of all 391 controls (146 derivable, 47 observable with new
collectors, 198 not observable from outside) is a plan for real new collectors, not a count.

### 84.6 Hidden checks fixed, round one

Two agent batches each fixed a withheld check, or made it honest, with a two-sided test built from
real pages and repos. Each fix was proved to discriminate by reverting it.
- **scanA (34):** auth, roles, SaaS, trust and legal page checks now read claims inside one visible
  text run (`page-claims.ts`), never across 300k characters of markup. Absence behind sign-in is
  INCONCLUSIVE, and laws that cannot apply are NOT_APPLICABLE (`legal-claims.ts`). Also new:
  `page-signals.ts`, `dkim-record.ts` and `dns-ttl.ts`.
- **platform (38):** the Android, iOS, desktop, React Native, extension and CLI checks.
  `branch_protection` now reads rulesets and FAILs only for an admin viewer.
  `no_service_role_key_exposed` uses `findSecrets`. `web_raw_html_injection` is judged per site
  (JSON-LD passes; `prose.tsx` in vercel/commerce still fails).

**Withheld:** 216 → 144. Every check still withheld either awaits a fix, or has a reason starting
"Not assessable from what Pulse scans:" (internal ops, a product's own emails, behind sign-in,
back office).

**Round two, scanB (41):**
- Payment, auth, roles, accessibility and sitemap checks now rest on parsed evidence:
  - real WCAG contrast ratios for inline colour pairs;
  - OAuth scope and `code_challenge` read from the page's own authorise link;
  - a Stripe webhook route must answer differently from a made-up sibling path;
  - page weight measured from HEAD Content-Length, and INCONCLUSIVE if anything can't be measured.
- Absence of an optional feature (Stripe, currencies, web push, trust badges) is NOT_APPLICABLE.
- Extra requests per URL scan: up to 40 HEAD requests (page weight) and 10 sitemap GETs.
- Withheld 144 → 103. Live checks: 1,206 ("over 1,200").

**Round three, repo (39):**
- Operational-depth rules can declare a per-file `scope`. Scoped rules strip comments and ignore
  docs, so a subject and its safeguard must sit in the same file.
- Containers: `nonRootVerdict` decides from the base image's default user when there's no USER line
  (official images run as root; `:nonroot`, Chainguard and Bitnami don't; any other base is
  INCONCLUSIVE).
- Django: DEBUG and SECRET_KEY are judged per settings module.
- Spring YAML: nested and list forms are parsed.
- CORS: a reflected origin is flagged only when origin and credentials sit in one config.
- CI: `on:` is read at any indentation.
- Validated against realworld, bakerydemo, commerce, petclinic and rreading-glasses.
- Withheld 103 → 64. Live checks: 1,245.

**Derived standards rows are never findings of their own** (`isDerivedRestatement`). The release
gate's failure count, `rankFindings` (and so Fix first) and the MCP verdict's issue lists all skip
them; the full check list still shows them. Found on the live linear.app scan, where one unlabelled
button was three gate failures, and vercel/commerce, whose vulnerable libraries appeared twice.

### 84.7 Rendered-page accessibility checks (`rendered-a11y`)

A new collector loads the page once in the shared `launchHeadlessBrowser()` Chromium (the same one the
render and visual agents use) and measures it. It runs only on internal website scans, in parallel
with PageSpeed. Measuring takes 0.5–1s; with launch and navigation it is 1.7–3.3s.
- **Where it lives:** `pulse-agents/rendered-a11y-agent.ts` (launch and guard),
  `rendered-a11y-scripts.ts` (in-page collection only), `pulse-checks/rendered-a11y.ts` (every
  verdict, pure and unit-tested).
- **Checks:**
  - `rendered_keyboard_reachable`: a Tab walk, up to 120 steps.
  - `rendered_no_keyboard_trap`.
  - `rendered_focus_visible`: computed style before and after focus, with transitions frozen.
  - `rendered_focus_not_obscured`.
  - `rendered_text_contrast`: computed colour over the composited background, rounded down; text on
    images or gradients is not judged.
  - `touch_target_size`: the old withheld key, now measured at 390px against WCAG 2.5.8.
  - `rendered_skip_link_works`.
- **No evidence, no verdict:** if the browser can't run, every key is INCONCLUSIVE and the collector
  is recorded as ERROR. These checks never pass on nothing.
- **Verified on real sites:** gov.uk passes. Hacker News fails contrast at 3.54:1 (#828282 on
  #f6f6ef) and tap targets (18×10px arrows), both correct. The W3C and Deque demo sites fail as
  expected.
- ⚠️ **Known weak spot:** linear.app's homepage mock-up uses real 14px buttons, so it fails tap targets
  on controls that are only a picture of the product. The evidence names each element. Nothing on the
  page marks the mock-up as decorative, so it is reported rather than guessed away.
- **Standards:** `inclusive_access_01–05` and `11` can now be refuted by these checks. Live checks: 1,252.

### 84.8 Consent before tracking (`consent-tracking`)

The static checks can tell whether a cookie banner is *mentioned*. They cannot tell whether the site
waits for the answer. A second browser collector now does: `pulse-agents/consent-tracking-agent.ts`
launches a **fresh** Chromium, so the visit is a first visit with no stored consent. It watches
requests and cookies for 6 seconds with nothing clicked, then presses the banner's first-layer Reject
control, reloads, and watches again. The verdicts are pure functions in
`pulse-checks/consent-tracking.ts`. It runs alongside `rendered-a11y`, under the same conditions
(an internal website scan).
- **Checks:** `consent_no_tracking_before_choice`, `consent_no_tracking_cookies_before_choice` and
  `consent_reject_honoured`. They are tagged EU + UK in `jurisdictions.ts` and feed the standards
  rows `deep_privacy_01` and `deep_privacy_08`. Live checks: 1,255.
- **Only beacons count, not scripts.** Loading `gtag/js` or `fbevents.js` is fine; only the request
  that reports a visit counts. DoubleClick is matched on beacon paths only, because
  `securepubads…/pagead/purl_config` is ad-serving set-up (a false FAIL on which.co.uk).
  Cookieless analytics (Plausible, Fathom) is not a tracker.
- ⚠️ **Advertising and analytics are judged differently, because the law differs.**
  - Advertising before a choice always fails.
  - Analytics before a choice fails where the EU applies (or the markets are unknown).
  - For a UK-only scan, analytics is a WARN that states the conditions of the UK exemption.
    Since 5 Feb 2026, PECR Sch. A1 para 5 (from the Data (Use and Access) Act 2025) allows analytics
    used to improve the service without consent, provided visitors are told, can easily object, and
    the data is used for nothing else.
  - The scan's markets are passed in from `resolveTargetMarkets`.
  - Don't flatten analytics into "needs consent" again: that is now false in the UK.
- **Consent Mode:** a Google request with `gcs=G100` is the cookieless ping and is a WARN, not a
  FAIL.
- ⚠️ **A block page is never judged.** To a headless browser, Akamai and Imperva serve a 15–26-word
  block page to John Lewis, Argos, ASOS, Boots and Currys. The first version scored that page as
  "clean". Under `MIN_PAGE_WORDS` (50) with no banner, or matching bot-wall wording, every key is
  INCONCLUSIVE.
- **Reject:** the first-layer button is found by its wording (UK and EU languages) or by the big
  consent platforms' ids. Pulse searches open shadow roots and up to 12 frames. Pulse never presses
  Accept. A cookie that was already set before the choice is not blamed on Reject.
- **Verified on real sites (27 Oct 2026):**
  - gov.uk, Nationwide and Monzo pass all three.
  - The Guardian's first layer has no reject button, so `consent_reject_honoured` is INCONCLUSIVE.
  - gitwork.co.uk fails: GA4 with Google Signals sends to DoubleClick and sets `_ga` before any
    choice, and there is no banner.
  - The BBC sets Chartbeat, Piano and DotMetrics cookies before a choice, and Chartbeat keeps
    pinging after "Reject additional cookies". For a UK-only scan these are WARNs.

### 84.9 Repository settings read from the repository (`repo-collaboration.ts`)

Seven keys used to be guessed from a website's HTML: "codeowners" or "semantic-release" appearing
anywhere in the page counted as PASS. They were withheld in the October audit. They are now answered
from the repository snapshot. That needs no extra GitHub call, because the full path list and every
`.github/workflows` file are already in it (§62.5). They run inside the `ci-workflows` collector.
- **File checks:** `github_codeowners` (only where GitHub reads CODEOWNERS: the root, `.github/` or
  `docs/`), `github_pr_template` and `github_issue_templates`. A missing file is a WARN, unless GitHub
  truncated the tree, in which case it is INCONCLUSIVE.
- **`release_automation`:** a release tool's config file, a workflow that publishes, or a
  package.json script that runs a release tool. Validated on real repos: express publishes with
  `npm stage publish`, and ky releases with `"release": "np"`. Both were missed at first and are now
  tests. If a listed workflow was not read, absence is INCONCLUSIVE.
- **`github_code_scanning` and `github_secret_scanning`:** a workflow that runs the tool is a PASS.
  ⚠️ No workflow is always INCONCLUSIVE, never a WARN, because CodeQL default setup and GitHub's
  built-in secret scanning are repository settings that leave no file.
- **`commit_signing_enabled`:** one more field on the existing branch-rules GraphQL query
  (`requiresCommitSignatures`, plus the ruleset rule `REQUIRED_SIGNATURES`), in `assessCommitSigning`
  (`code-agent.ts`). It follows the same visibility rule as `branch_protection`: only an admin viewer
  can establish "not required".
- **Still withheld, Dan's call:**
  - `github_branch_protection` and `github_required_reviews` are exact duplicates of
    `branch_protection`. Retire them as `MERGED_INTO`.
  - `stale_bot_configured` is an open-source chore, not a readiness finding.
- Live checks: 1,262. Withheld: 56.

### 84.10 Real-user Core Web Vitals (`crux-field.ts`)

PageSpeed's response already carried Chrome UX Report field data for each metric, and Pulse only read
its one-word summary (`crux_overall`). New checks `crux_lcp`, `crux_inp`, `crux_cls`, `crux_fcp` and
`crux_ttfb` judge the 75th percentile real Chrome users saw over the last 28 days, using Google's
published thresholds.
- **INP only exists as field data,** so these checks are what let standard `performance_core_02` be
  refuted. LCP and CLS field data also feed `performance_core_01` and `performance_core_03`.
- **URL data comes first,** then origin data. PSI's own `origin_fallback` flag counts as origin data.
  The detail says which, and origin data is MEDIUM confidence.
- **No Chrome traffic means no row at all,** as with `crux_overall`. A small site is unmeasured, not
  slow.
- ⚠️ **CLS arrives ×100** (`30` means 0.30). This was confirmed against a real response in Google's
  Site Kit fixtures (`google/site-kit-wp …/pagespeed--mobile.json`). A test checks that Pulse's
  verdict matches Google's own FAST/AVERAGE/SLOW category for every metric in that response.
- These only run where PageSpeed runs (internal scans). Without `GOOGLE_PSI_API_KEY` the anonymous
  quota returns 429 almost immediately.

### 84.11 Credentials left in git history (`code-health/history-secrets.ts`)

The commonest real leak is not a secret in today's files. It's a `.env` or key file that was
committed, noticed and deleted. Deleting it removes it from the checkout, not from history. The
code-health clone already holds 12 months of history (blobless), so `secrets_in_git_history`
works like this:
- It lists files **deleted** in that window whose names say they hold credentials. That means env
  files, private keys, service-account or credentials JSON, and `.npmrc` / `.pypirc` / `.netrc`.
  Tests, fixtures, examples and docs are skipped.
- It reads the version just before each deletion (`git cat-file -p <sha>^:<path>`), at most 15.
- It runs the existing secret formats over each one, plus the env-file rule from `secret-scanner.ts`.
- **A read fetches one old blob from GitHub on demand.** That is why the checkout's `git` helper now
  carries the same auth header and hardening as the clone (`gitConfig` in `clone.ts`). Without it,
  private repos would fail every read.
- **Never PASS on a gap.** INCONCLUSIVE when the history clone fell back to the latest commit only
  (`Checkout.hasHistory`), and when any candidate could not be read (older than the shallow
  boundary, or over the cap).
- **Out of scope, stated in the PASS:** a secret edited out of a file that still exists. Finding that
  needs every old version of every file.
- A FAIL says to rotate. Rewriting history is tidying, because clones and forks keep the old copy.
- **Validated on public repos (27 Oct 2026):** asvarshini/SafeRoute's deleted `backend/.env` was
  read from history and flagged. Two other "remove .env" commits turned out to edit
  `docker-compose.yml` and delete `.env.example`, and both correctly pass.

### 84.12 Library licence review (`code-health/licences.ts`)

`dependency_copyleft_licences` (LEGAL). The lockfile audit already knows every pinned
(ecosystem, name, version), and `auditDependencies` hands that list over through `onPackages`. For
the libraries the project **declares itself** (direct only, at most 300), the licence is looked up in
**deps.dev**. That's Google's free API with no key, covering npm, PyPI, Go, Cargo, Maven, NuGet and
RubyGems.
- **What is flagged:**
  - AGPL and SSPL (network copyleft), which reach users of a web service.
  - GPL (strong copyleft), which applies on distribution.
  - It is always a **WARN for a licence review, never a FAIL**: Pulse can't see how the software is
    distributed or whether there's a commercial licence.
- **What is not flagged:**
  - LGPL, MPL and EPL.
  - Dual licences with a permissive option ("MIT OR GPL").
  - `GPL … WITH <exception>`.
  - Same-family libraries in a project that is itself GPL or AGPL. That's read from its LICENSE
    file or package.json `license`.
- ⚠️ deps.dev's `non-standard` means "couldn't map to SPDX", and counts as **unknown**, not clean.
  Under 80% known is INCONCLUSIVE. MySQL's Python connector, which is GPL with an exception, is
  one example.
- Validated against live deps.dev data: PyQt5 is GPL-3.0 and flagged, the MariaDB JDBC client is
  LGPL and not flagged, and Flask passes with 22 of 25 identified. No check is emitted when the
  library audit found no lockfile.

### 84.13 The withheld list is empty (`repo-operations.ts`, `privacy-notice-rights.ts`)

There were 56 checks in `WITHHELD`, all of them keyword guesses over a website's HTML. Each one
was either rebuilt or retired, and `WITHHELD` is now `{}`. Adding a key back needs a reason, and
the key stays only until its defect is fixed.

- **Rebuilt (16), each on the evidence that answers it:**
  - From the repository (`repo-operations.ts`, run inside `runCiWorkflowChecks`):
    - Paging and alerting (Terraform, Alertmanager, Prometheus rules).
    - On-call and escalation.
    - Budgets (Terraform, Infracost).
    - Log shipping and log retention (Terraform, Compose, manifests).
    - Incident reviews.
    - Synthetic checks (Checkly, Terraform, scheduled workflows).
    - Automated accessibility tests.
    - AI route rate limiting.
    - Email preview text. Email layouts and templates are read from their own budget,
      `selectEmailTemplates`.
  - From the privacy policy (`privacy-notice-rights.ts`): the rights of access and portability.
    Portability applies only when the notice relies on consent or a contract.
  - From the domain's own name servers (`authoritative-ttl.ts`): DNS TTL, using a raw UDP query,
    because Node's resolver hides a CNAME's TTL.
  - Over HTTP/2 (`early-hints.ts`): early hints, sent as a browser. Cloudflare sends a 103 to
    browsers only.
  - From the release pipeline: the App Bundle check. Any current AGP can build a bundle, so the
    only defect is APK uploads to Play.
- **Retired (40):** RETIRED_CHECKS in `catalogue-compat.ts`, version `pulse-controls-2026.10`.
  - 20 are SUPERSEDED_BY, MERGED_INTO or ALIAS_OF a live check that reads real evidence.
  - 20 are WITHDRAWN because no scan can answer them: internal policies, back-office tooling, and
    things only visible after signing in.
- ⚠️ **A practice set up in a vendor's dashboard leaves no file.** Its absence from code is
  INCONCLUSIVE, never a WARN. The only adverse verdicts are defects the files themselves show:
  - a CloudWatch log group without `retention_in_days` (where `0` means forever);
  - an AI route with no limiter in a repository that uses none, with most of the source read;
  - email templates and layouts that were all read and none sets preview text;
  - an English privacy notice that omits a right.
- Validated against real data, which found 5 false positives:
  - vercel/chatbot's own `checkIpRateLimit` wasn't recognised.
  - A library `server.ts` was read as a route.
  - The React Email preview app and components were read as templates (documenso, cal.com).
  - A Storybook a11y panel was counted as a test (mastodon).
  - gov.uk's rights list, split across items, was missed.

  All five are fixed, with tests. maybe-finance's email WARN and Shopify's portability WARN were
  checked by hand and are true.

### 84.14 Multi-page crawl (`site-crawl.ts`, `pulse-agents/site-crawl-agent.ts`)

Internal website scans now read up to 15 pages, not just the homepage. It runs behind the same
switch as rendered-a11y. It never runs on the public embed, MCP, repo or store scans.

- **Which pages:**
  - Pages come from the homepage's links and the sitemap.
  - Pricing, signup, login, contact, about, product, blog, checkout and docs are picked first.
  - robots.txt is respected.
- **Limits:** 4 at a time, 8s per page, a 45s budget, then up to 40 links and 10 sitemap URLs
  checked. Every request goes through `fetchScannableUrl` (the SSRF guard).
- **13 `crawl_*` checks:**
  - broken internal links;
  - titles, meta descriptions, html lang and viewport;
  - mixed content and http form actions;
  - canonicals and noindex on key pages;
  - security-header consistency across pages;
  - sitemap URLs and image alt text;
  - a pages-read row.
- **Not counted as pages:** soft 404s (the homepage or a catch-all answer), app shells, bot walls,
  and 401/403/429/5xx responses.
- A PASS needs 2 readable pages beyond the homepage.
- It was run against 13 real sites, and 10 false positives were fixed. The validation notes are in
  the commit.

### 84.15 GitHub conditional requests (`src/lib/github-cache.ts`)

`githubRequest` now remembers ETag and Last-Modified per (URL, Accept, token hash) in an in-process
LRU: 2,000 entries, 50MB, with a 2MB cap per body.
- A `304` with a token does **not** count against the 5,000/hour limit, which was measured.
- Rescans of unchanged repos now cost close to nothing. A first scan still costs full price.
- ⚠️ Unauthenticated 304s still count, so don't try to prove the saving with tokenless curl.
- **It survives deploys.** A second tier in Postgres (`GithubResponseCache`, additive model;
  `src/server/github-cache-store.ts`) holds the validators and the gzipped body. Lookups read memory,
  then the table; stored 200s and deletions are written through in the background. Row id is
  SHA-256 of the cache key, so neither the token nor its hash is stored.
- **Bounded and pruned on write** — no cron (crons here have a habit of never being installed).
  At most every 10 minutes a write prunes rows unused for 30 days, then least-recently-used until
  under 20,000 rows and 500MB compressed. The table is safe to `TRUNCATE` at any time.
- **A dead database costs one timeout, not one per GET.** A store read slower than 500ms, or one
  that fails, is a miss, and the store is skipped for 30 seconds. Writes never block a request.
  A stored body is still only served on GitHub's own 304, so a stale row can't be returned as current.
- ⚠️ **Wired in `src/instrumentation-node.ts` (loaded by `src/instrumentation.ts`), not imported by
  `github.ts`.** Keep `instrumentation.ts`'s `if (NEXT_RUNTIME === "nodejs") await import(...)` shape:
  an early return is not dead-code-eliminated from the edge build, which then fails on `node:`. `github.ts` and
  `github-cache.ts` are in the browser bundle (two client components import them); a Node built-in
  or Prisma import there breaks the production build. The store is registered on `globalThis`
  (`setGithubCacheStore`). `github-cache-persistent.test.ts` fails if either file imports one.

### 84.16 Pulse has its own navigation (`src/lib/pulse-nav.ts`, `pulse-nav.tsx`)

The Pulse landing page used to stack everything. Each concern now has a page, and `PulseNav`
(segmented control, the wiki doc-tabs shape) sits at the top of each, with **New scan** on the right
for anyone with `canGenerateAi`. It is not on a scan's own report (`/app/pulse/[scanId]`).

| Item | Route | What is on it |
|---|---|---|
| Projects | `/app/pulse` | Projects / all scans, "What Pulse checks". Project pages and `/new` count as Projects |
| Monitors | `/app/pulse/monitors` | `PulseMonitorsPanel` (now a numbered card with an empty state) |
| Portfolio | `/app/pulse/portfolio` | Code portfolio 01–03, then workspace scan health (`04 // SCAN HEALTH`) |
| Compare | `/app/pulse/compare` | Unchanged |
| Growth | `/app/pulse/growth` | Sales page, public embed, About Pulse share card, leads. `/embed` counts as Growth |

- ⚠️ **Monitors and Growth are internal-only twice**, exactly as their panels were on the old landing
  page: their routes are in `INTERNAL_ONLY_PREFIXES` (module gate), and the content is inside
  `InternalOnly`. The nav hides them from external roles and while the account loads. Add a nav item
  and you must decide its `internal` flag; `pulse-nav.test.tsx` fails if the flag and the gate disagree,
  or if any item has no app page or demo page.
- `PulseTopCards` is gone; its four cards take a `number` prop and live on Portfolio and Growth.
  The scan list's own New scan button moved into the nav.
- Demo: the same nav with `base="/demo/pulse"` (`DemoPulseNav`, no New scan), plus new
  `/demo/pulse/monitors` and `/demo/pulse/growth` (demo monitors and embed config added to
  `dev-demo-data.ts`). Verified at 390 · 768 · 1440 and with `audit:clipping`: 0 findings.

### 84.17 Findings: one list, triaged, carried between scans (`pulse-findings`)

A scan used to show the same problem up to six times: AI-written blockers, gaps, quick wins, a
priority plan, a readiness checklist and two "fix first" lists. None of them could be acted on.

- **The list.** The scan page's "All checks" tab is now **Findings**. It holds one list of failing and
  warning checks, ranked by `rankFindings`, in five views: open, on the board, fixed, dismissed and
  couldn't check. The by-category view of every check is one click away. The AI write-up is the
  summary only. Its duplicate lists were removed from Summary and Plan. Plan keeps opportunities,
  roadmap, stack and the estimate. A `gaps` deep link lands on Findings.
- **The rules** are in `src/lib/pulse-findings.ts` and are pure:
  - A decision (`ACCEPTED_RISK` or `FALSE_POSITIVE`) outranks a board task.
  - A task marked done while the check still fails reads "Task done, still failing", never fixed.
  - **Fixed is never stored.** A check is fixed when it passes now after the team acted on it, or
    after it failed on the previous scan (from the diff).
  - A task deleted from the board makes its finding open again.
- **Storage:** `PulseFindingState` (additive), one row per `(workspace, targetKey, checkKey)`. It is
  keyed on the **project** (`targetKey`), not the scan, so a decision carries to every later scan of
  the same site or repo.
  - Tasks made with the older per-check "+ Task" button carry `metadata.pulseCheckKey`, and are
    read as on the board.
  - Sending to the board is idempotent.
  - Routes:
    - `GET`/`PUT /api/pulse/scans/[id]/findings`
    - `POST /api/pulse/scans/[id]/findings/task`
  - Reads need scan access; writes also need `pulse.manage`, now exposed client-side as
    `usePermissions().canManagePulse`.
- **The score does not change** when a finding is dismissed. It measures what Pulse found, and the
  Dismissed view says so.
- **The demo's Northwind scan carries a real scan's 289 checks** (`src/lib/demo/demo-pulse-recorded.ts`).
  They come from a python.org lite scan, renamed. They are stored as a `JSON.parse`d string, because as
  a literal the type checker ran out of memory. Regenerate the file rather than hand-editing it. The
  demo applies findings writes in memory, but the demo user has no `pulse.manage`, so the actions show
  only for a real user.
- **Cadenza and Fairway carry real scans too** (`demo-pulse-recorded-cadenza.ts`, `-fairway.ts`):
  - Cadenza is a repo scan of `bradtraversy/proshop-v2` (84, 192 checks, plus its code-health
    report). Fairway is a rendered URL scan of a small UK golf club's site (81, 264 checks).
  - Both are renamed throughout: repo, file and screen names, host, page slugs, crest URL and
    nameserver. The scores, tech stacks and code health come from the recordings. Diffs and
    finding seeds use the recorded check keys.
  - ⚠️ Real lite scans of small sites and repos all landed at 79–92. The `/pulse/features`
    examples need a middling (<75) and a weak (<50) result, so they keep the old hand-written
    scans (`exampleScanCadenza` / `exampleScanFairway`). All three `/demo/pulse` projects are
    now green.
- ⚠️ **`tsc` on main sits at the edge of Node's default 4GB heap** and ran out of memory
  intermittently. CI already used 6144; `npm run verify` now does too.

### 84.18 Checks are rebuilt, not withdrawn (`repo-practices.ts`)

⚠️ **Rule from Dan, 27 Oct 2026:** do not remove useful Pulse checks. Rebuild them on evidence Pulse
can read. A key can be retired only when it duplicates a live check (SUPERSEDED_BY, MERGED_INTO or
ALIAS_OF), and a WITHDRAWN retirement needs Dan's sign-off. `withheld-rebuilt.test.ts` fails if any
key is WITHDRAWN.

§84.13 had withdrawn 24 checks with nothing in their place. They were rebuilt the same day:

- **15 from the repository (`repo-practices.ts`):**
  - deployments recorded;
  - server-side product events;
  - double opt-in and contact segmentation;
  - a dedicated sending provider;
  - plain-text part (Rails views with no `.text.erb` are a WARN);
  - postal address in marketing templates;
  - breach procedure and record of processing in the docs;
  - e-signature (optional);
  - fraud screening (Stripe Radar is on by default, and a merchant of record carries the liability);
  - dispute handling;
  - one-time-code attempt limits and resend cooldown (home-made codes with neither are a WARN when
    most of the source was read);
  - stale triage (optional).
- **4 from the website (`business-operations.ts`):** anti-bribery policy, whistleblowing channel,
  sub-processor list and insurance. Each is a PASS with the quote when the site names it, otherwise
  INCONCLUSIVE, because none of them has to be published.
- **3 operational-depth rules**, restored with `absentIsUnknown`. A guard or deny default Pulse doesn't
  recognise reads exactly like none, so a missing one is INCONCLUSIVE. A forbidden construct it sees
  (a declared allow default) still fails.
- **2 duplicates now point at live checks:** `gdpr_ropa_maintained` → `gdpr_records_processing`, and
  `gdpr_data_access_control` → the repository ownership and tenant-scope rules.

Result: **1,711 active checks**, and 18 retired keys, every one with a live successor.

Validated against 8 real repositories, which found 5 false positives, each fixed with a test:
- `@vercel/analytics` was read as server-side events.
- `@react-email` was read as a sending provider.
- A template's `text:` prop was read as a plain-text part.
- Documenso's own packages were read as an e-signature integration.
- A CSS colour `#D1D5DB` was read as a UK postcode.

Confirmed true: maybe-finance's Rails mailers send HTML only.

### 84.19 Vendor names are not evidence (`vendor-evidence.ts`)

27 website checks passed when a vendor's or product's name appeared anywhere in the HTML: a blog
post naming Pingdom, "newrelic" in a comparison table, "affirm" as an English word, "statuspage" on
Atlassian's own homepage, `open.*source` running across a whole page. None was withdrawn and no
key changed. Each now rests on what the page does, in `src/server/pulse-checks/vendor-evidence.ts`:

| Evidence | Checks |
|---|---|
| A script the page loads from the vendor's host, or its init call (`NREUM`, `DD_RUM.init(`) | `apm_signals`, `real_user_monitoring` (self-hosted LUX still counts), `bnpl_options`, `crypto_payments`, `wallet_payments`, `payment_checkout_provider` |
| A link to the vendor-hosted listing or profile (`pageAnchors`), or the platform's own widget | `third_party_reviews`, `social_review_platform`, `g2_capterra_listed` (now G2 and the Capterra network only, as the label says), `product_hunt_badge`, `social_media_links`, `social_profiles_linked`, `social_short_form_video`, `github_org_public`, `amazon_app_store`, `public_roadmap` |
| The site's status page, linked and **opened** through the SSRF guard (192KB read: linearstatus.com puts its `<title>` 100KB in) | `status_page`, `uptime_monitoring`, `uptime_history_public` |
| The domain's SPF record (`include:sendgrid.net`, `spf.mtasv.net`…) | `email_provider` |
| A statement in visible prose or a badge's alt text, quoted | `compliance_certifications`, `investor_backing_listed`, `awards_recognition`, `conference_speaking`, `tax_automation`, `paypal_integration` / `regional_payment_methods` (via `nonCardPaymentMethods`) |

- **Couldn't look is INCONCLUSIVE.** A status link that answers 401/403/429/5xx, an `email_provider`
  with no recognised sender in SPF (mail may go from another subdomain), a status page on a product
  that can be updated by hand (Statuspage, own subdomain) for `uptime_monitoring`, and the Amazon
  Appstore named with no link.
- Social profiles also count from JSON-LD `sameAs`: atlassian.com draws its footer with JavaScript.
- Validated against 10 real homepages (linear, vercel, stripe, github, atlassian, posthog, gov.uk,
  basecamp, shopify; cal.com refused the fetch). Every remaining PASS was checked by hand. Removed
  false passes include: Atlassian's `status_page` (the word "Statuspage", its own product),
  `github_org`, `awards`, `investor` (an investor-relations link) and `public_roadmap` (an SVG id);
  Stripe's `bnpl`, `crypto`, `paypal`, `tax_automation` (product copy and scripts); Linear's
  `crypto`, `tax`, `awards`, `investor`. Basecamp's "backed by 37signals" is not investment.
- ⚠️ A prose claim is the site's statement, not proof. Shopify's homepage describes its own
  checkout ("Shop Pay, PayPal, and Apple Pay"), which `paypal_integration` reads as an option.

### 84.20 Findings follow-ups: counts, task links, one board path, reopening, and a split page

- **Open findings on the Projects list.** Each project row shows the open findings on its newest
  completed scan (`PulseProject.latestCompletedScanId` / `openFindings`), counted by
  `countOpenFindings` over the Findings tab's own `buildFindings`/`countByView`. The server reads
  every project in a fixed number of queries (`loadFindingStates` in `src/server/pulse-findings.ts`,
  which the scan page's read now goes through too). The demo counts from the same in-memory
  decisions as its scan page.
- **Task links.** `FindingTask.clientSlug` comes back with each task, and a finding on the board
  shows **View task** (`findingTaskHref`: `/app/portal/<slug>/tasks?task=<id>`, the deep link the
  task notifications and the Desk already use). Visible to anyone who can see the scan.
- **One send-to-board path.** The by-category view's **+ Task** now calls
  `useSendPulseFindingToBoard`, so it records a `PulseFindingState` and shows the same state as the
  Findings list (On board, Task done, Dismissed). It needs `pulse.manage`, like the route.
  `one-send-to-board-path.test.ts` fails if a Pulse component builds a board task itself again.
- **A dismissal reopens when the finding changes** (`staleDecision`, pure). A decision now stores
  `decisionFingerprint` (FNV-1a of detail + evidence, numbers folded, so "3 pages" vs "4 pages" is
  the same finding) and `decisionStatus` (additive, nullable). The read also reports whether a
  later scan of the same project passed the check after the decision, up to the scan being viewed.
  - Either decision reopens when the check passed after it and fails again, or when a warning has
    become a failure.
  - "Not a real issue" also reopens when the report itself changed. **An accepted risk does not**:
    it is about the issue, so new wording of the same failure leaves it accepted.
  - Decisions made before this change have no fingerprint and never reopen on wording.
  - A reopened finding sits in Open as "Changed since dismissed" (or "Worse since dismissed",
    "Failing again after passing") and keeps the old note.
- **The scan page is split** into `src/components/pulse/scan/`: `use-scan-view.tsx` (all state and
  derived values, returned as `ScanView`), `scan-toolbar.tsx`, `summary-tab.tsx`,
  `technical-tab.tsx`, `all-checks-view.tsx`, `plan-tab.tsx`, and the helper components it used to
  define inline. `pulse-scan-results.tsx` went from 3,076 lines to 138.
  - ⚠️ The tab renderers are **plain functions called in place** (`renderChecksTab(v)`), not
    components. That is deliberate: the running section numbers come from one `sectionNo()`
    counter, and a child component renders after its parent, so it would number out of order.
    Keep them as functions, or pass the numbers in as props.
  - Tests that check something is rendered on the page read `readScanPageSource()`
    (`src/components/pulse/__tests__/scan-page-source.ts`), not the one file.

### 84.21 Homepage-only checks answered from the crawl (`crawl-evidence.ts`)

Several checks ask what a business publishes and read only the homepage, or one fetched privacy
policy. A site that publishes the thing on a legal or trust page came back INCONCLUSIVE. The
internal crawl (§84.14) now feeds them.

- **More pages:** after its normal pick, the crawl reads up to 6 legal and trust pages linked from
  the pages it read (`selectTrustPages`: sub-processors, privacy, "your rights", trust, security,
  legal, terms, imprint, ethics, SLA), then up to 4 more one hop on (a privacy policy that links
  "Your rights"). Same-site, robots.txt respected, same SSRF guard and budget. They are kept in
  `observation.trustPages` and are not judged by the `crawl_*` checks.
- **18 checks** in `CRAWL_EVIDENCE_RULES`: business hours, VAT number, UK company number, company
  registration, director or responsible person, support response time, invoices, data retention,
  anti-bribery, whistleblowing, sub-processor list, insurance, lawful basis, EU representative (both
  keys), transfer mechanism, and the rights of access and portability. Modern slavery is a 19th: a
  statement found off the homepage stays INCONCLUSIVE (the Act wants a homepage link) and the
  detail says where it is.
- **Only an upgrade.** INCONCLUSIVE becomes PASS when a crawled page says it. A WARN is upgraded
  only where its own text says another page satisfies it (support SLA, data retention, UK company
  number). Nothing becomes FAIL or WARN, and a PASS is never replaced.
- **Same matchers.** Each rule reuses the homepage check's own regex (now exported), so the two
  cannot disagree. The PASS names the URL and quotes the text.
- **Only real pages, of the right kind.** Pages must pass `classifyPage` (no soft 404s, catch-all
  answers, bot walls or errors) and not be an empty shell. Blog posts and customer stories never
  count. Retention, transfers and sub-processors need a legal or trust page; hours, SLAs and
  invoices need a support, contact, help or pricing page; the rights checks need an English
  privacy page.
- **Wiring:** `runLiteScan` holds these keys back while a crawl may run (`holdForCrawl`), then
  ingests them once, upgraded or as they were. Persistence stays append-only. The public scan
  never crawls, so its answers are unchanged.
- Validated on 8 real sites. False positives found and fixed:
  - Atlassian's "24/7 support to employees and customers" on /enterprise read as its own hours.
  - Its "uptime SLA, our highest priority support" read as a support response time.
  - Stripe's "Invoice PDF" product feature read as invoices for Stripe's customers.
  - gov.uk's privacy notice gave the ICO's phone hours, not its own.
  - Linear's "Uptime SLA" and Basecamp's "response times may be a bit longer" read as a support
    SLA. This also changed the homepage check (`SUPPORT_SLA_CLAIM`): an uptime SLA and an
    unquantified "response times" no longer count.
- Crawl requests cut short by the crawl's own budget no longer count towards the host breaker.
- ⚠️ `runLiteScan` runs the crawl after the URL checks. If those trip the host breaker (2 timeouts),
  the crawl reads nothing and every one of these keeps its homepage answer. This was seen from a
  local machine and was not fixed here.

### 84.22 The Pulse pages stopped contradicting themselves (UI review, Oct 2026)

A review of every Pulse page at 1440px and 390px found several places where one number said
the opposite of the number next to it. Fixed:

- **Projects showed "On track" beside urgent findings.** The list now counts open findings
  *and* urgent ones (the P1s the Findings tab lists first) with one rule,
  `openFindingCounts` in `src/lib/pulse-findings.ts`. `applyFindingCounts`
  (`src/lib/pulse-projects.ts`) adds "N urgent findings" as a reason a project needs a look,
  and the server and the demo both call it. The page leads with four figures (projects,
  average health, need a look, urgent findings); clicking "Need a look" filters to those
  projects. The Scans column is gone; its count is in the Last checked tooltip.
- **On a phone the score was off the side of a scrolling table.** Below `sm` each project is
  a card with its score beside the name. The table stays from `sm` up.
- **"The code is in good shape (95)" sat above "9 critical".** The code score measures how
  hard the code is to change, not library security holes. The headline now names both when
  any library has a critical or high hole (`summariseCodeHealth`). The column and the stat
  are labelled **Code score** in the Technical tab and in Portfolio, so they can't be read
  as the project's health score.
- **"192 confirmed issues" beside 101 findings.** The confidence strip counted the derived
  standards rows, which restate checks already counted. It now skips them, reads
  "confirmed problems", and uses colour tokens.
- **The Compare tab was a dead end** ("pick two scans from a project's page"). With nothing
  chosen it lists each project's latest scan against the one before, with a link to the
  project page for any other pair.
- Portfolio's plan shows the first 8 pieces of work, then "Show all".
- The Projects list's urgent count opens the scan on the Findings tab (`?tab=findings`).
- Growth card copy: no em dashes, and no "free".

Left as they are, on purpose: ~200 Tailwind palette classes (`emerald-*`, `red-*`, `amber-*`)
across `components/pulse/`. `globals.css` remaps those families for dark mode, so they render
correctly; converting them to tokens is a tidy-up, not a fix. The scan page's cover keeps the
Foundry wordmark because it is the same component as the shared report.

**Follow-up (same day): the Projects list pages, filters and sorts.** Dan, on the live list of
42 projects: it needed pagination, filters and sorting, newest first. The rules are pure, in
`src/lib/pulse-projects.ts` (`filterProjects`, `sortProjectsBy`, `projectKind`), and tested.
- **Opens newest first** (`DEFAULT_PROJECT_SORT`), not by urgency. Urgency is now a filter
  ("Needs a look", "Has urgent findings") and the two stat figures toggle those filters.
- Every column but Needs sorts; one column at a time, a second click reverses it, and a
  project with no value (no score yet) goes last in **both** directions. Phones have no headers,
  so they get a sort dropdown.
- Filters: status, type (website / repository / store listing, told apart by host) and client.
  Type and client only appear when there is more than one choice.
- 20 per page with the shared `Pager`; any filter or sort change goes back to page one.

**Follow-up: All scans works the same way** (`src/components/pulse/pulse-scan-list.tsx`, rules in
`src/lib/pulse-scan-list.ts`). It is now a card like Projects, with inline filters (status, score
band, type, change since the previous scan, monitoring), sortable headers (project, score,
change, scanned), newest first, 20 a page and one card per scan on phones. Bulk delete stays, and
ticks clear on any page, filter or sort change, so "Delete selected" never reaches rows off screen.
Changes and monitor matching now use the shared `targetKey` (the old list lower-cased the raw URL,
so `a.com` and `a.com/` were two projects there). `SortHeader` is exported from
`pulse-projects.tsx` and shared. ⚠️ `app-select` and `app-input` are 100% wide: in a wrapping
filter row they need `sm:w-auto`, or each control takes a full row on desktop.

## 85. Recent Changes (October 2026) — A client's Google Drive folder in Portal and the wiki

Clients keep their files in a Google Drive folder (the link already on the client record,
`googleDriveFolderUrl`). It now shows as a **Drive tab** in two places Dan chose, rather than as
its own card or wiki section: Portal's **14 // DOCUMENTS** card (8 a page) and the wiki's
**Resources** page (12 a page). Views: **Added** (newest added, any depth), **Edited** (newest
changed, with who changed it) and **Browse** (the folder, with breadcrumbs). Nothing is copied into
Foundry; every look is a live read, so a file put in Drive shows on the next look.

- **Two readers, on purpose.** The TEAM reads with their own Google sign-in (`getUserGoogleAuth`,
  the existing `drive.readonly` scope), so Drive's own sharing decides what each person sees, and
  previews use Google's viewer in an iframe. The CLIENT has no Gitwork Google account, so their copy
  is read with the sign-in of the teammate who pressed **Show to client** (`ClientWiki.driveEnabled`
  + `driveReaderUserId`, additive). Their files come through Foundry: Google Docs and Slides as
  PDF, Sheets as Excel, Drawings as PNG, the rest as themselves up to 100 MB. Only PDFs and safe
  image types are served inline; everything else is a download with `nosniff`.
- ⚠️ **Only the client's folder, never anything else the reader can see.** Every folder, thumbnail
  and file id is proven to sit under the client folder first (`crumbsTo`, by walking parents). A
  folder id from outside falls back to the client folder; a file from outside is a 404. Two
  sabotage-checked tests pin this. Climbing out of the folder reaches folders the reader can't see,
  which Drive answers with 404. That means "not under this folder", not an outage.
- **Show to client** is refused unless the presser's own Drive can open the folder right now, so a
  client never gets a tab that says "unavailable" on day one. It uses the SIGNED-IN person, never
  the "view as" user. A reader who is archived (§57) or signs out of Google stops working at once.
  The team's tab then says so in amber and offers **Read as me**. The client sees only
  "These files aren't available right now"; whose account it is never reaches their copy
  (`forPublicDrive`).
- **Client routes** (`/api/wiki/[token]/drive`, `…/thumbnail/[fileId]`, `…/file/[fileId]`) use the
  hardened posture: the section on, a per-section link must be the RESOURCES one, a logged-in
  client user or a Gitwork session, and a per-IP rate limit. They don't use `resolvePublicWiki`,
  because building the whole wiki per thumbnail would be wasteful; `resolveWikiDriveAccess` is
  one light query.
- **Every failure is a sentence, never an empty list (§35):** no folder linked, connect Google,
  sign in again, your account can't see this folder, Drive didn't answer. The recent views
  search at most 120 folders, 5 deep, and say so when they hit the limit.
- Resources is now shown to the client when it has a resource OR Drive is shown to them.

**Not verified against real Drive.** It was driven at `/demo/wiki` and `/demo/portal` against a
fixture (`src/lib/demo/demo-drive.ts`), at 1440 and 390 with no overflow, and the client's mode
was checked by pointing the demo at it temporarily. Post-deploy: link a client's folder, open
Portal → Documents → Drive, press **Show to client** on the wiki's Resources, then open the share
link as a client user and open a Google Doc. It should preview as a PDF.

## 86. Recent Changes (October 2026) — Foundry for other businesses: the baseline and Phase 0

The start of making Foundry usable by other businesses. **The plan is `docs/multi-tenant-roadmap.md`
— read it before touching anything in this programme.** The rule above every phase: Gitwork sees no
change unless the change is deliberate, so every PR in it also runs `npm run test:baseline`
(`docs/build-checklist.md` §4a).

### 85.1 The baseline (`scripts/baseline.mjs`, `tests/baseline/snapshot.json`)

Visits every `/demo` page plus the public pages at 390, 768 and 1440 px, following demo links into
individual scans, docs and assessments (they link to the real `/app` routes, so the crawler maps
them back). It fails on a status error, a crash or console error, a blank page, sideways scroll,
more clipping findings than recorded, any recorded title, heading or widget header going missing,
and loosened auth gates. Deliberate changes are re-recorded with `--update` in the same PR;
`--update` refuses to record a run with a hard failure. `--only=/demo/care` checks one area.
Proved by breaking `/demo/care` three ways. It found a live bug on its first run: the candidate
coding-challenge page scrolled 64px sideways on a phone (unbreakable example test lines).

⚠️ It needs a dev server started with any `API_KEY` and `AUTH_SECRET`, or the gate checks see
local-mode behaviour. A dev server killed mid-run shows as every page failing with
`ERR_CONNECTION_REFUSED`: that is the server, not the pages. And `pkill -f "next dev"` inside a
Bash call matches its own command line and kills the shell before the server restarts.

### 85.2 Which modules a business has (`src/lib/workspace-modules.ts`)

`Workspace.modulesRestricted` + `enabledModules` (additive; default unrestricted, so every existing
workspace, Gitwork included, sees no change). One catalogue maps each module to its page and API
prefixes, longest prefix wins (Hiring's `/app/codeclear/devsignal` inside Staff's tree). Checked:
- in the **middleware, before every role check**, so a business's own Super Admin is refused a
  module it doesn't have (pages redirect to `/app`, APIs answer 403);
- on `/edge`, which is outside the middleware's `/app` branch;
- in the sidebar, the HQ strip links and the Settings rail (`hasModule` in `usePermissions`).

The list rides in the session token as `workspaceModules` (null = everything), refreshed on the
existing five-minute member recheck. ⚠️ A token minted before the field existed has it undefined,
read as unrestricted: correct today because every workspace is, and Phase 2 must not keep that once
a restricted workspace exists. Mobile JWTs and API-key callers are not checked yet (Phase 2).
`DEFAULT_BUSINESS_MODULES` is the bundle a new business gets.

### 85.3 A workspace's AI calls use its own keys (`src/server/ai-keys.ts`)

Server AI keys were read directly in ~14 places, mostly ahead of the workspace's own key. Every
site now calls `aiKeyFor(provider, ws, prefer)`, keeping the order it had (`prefer`), so a workspace
with `platformAiKeysAllowed: true` (default; every existing one) behaves exactly as before. A
business created with it false only ever gets its own key, and with none its AI is off. The flag is
**required** on the key type, so tsc forced 20 narrowed selects to fetch it. A sweep test fails on
any new `process.env.*_API_KEY` read outside `ai-keys.ts`.

### 85.4 Workspace secrets encrypted at rest (`src/server/stored-secret.ts`)

AI keys, the Resend key, the external API key and the Google service-account JSON were plain text.
Now written with `storeSecret` (the same AES-GCM envelope as the SMTP password) and read with
`readSecret`, which also accepts the plain values already stored: no migration, and each becomes
encrypted the next time it is saved. ⚠️ An encrypted value is recognised by its exact envelope, not
by a leading `{` as `readSmtpPassword` does, because a service-account file is plain JSON that also
starts with `{`. A sweep test fails on a new read of these columns that skips `readSecret`; it found
Docs AI chat using the stored key raw. **No existing value has been rewritten** — a one-off
backfill is a decision for Dan.

### 85.5 Platform admin and the Platform console (`/app/platform`)

`User.isPlatformAdmin` plus a seed list (Dan, Harry) in `src/server/platform/admin.ts`, checked live
from the database, never the token, and separate from workspace roles. `requirePlatformAdmin` goes
through `requireAuthedUser`, so an archived Gitwork membership removes it, and "view as" drops it.
The console (sidebar "Platform", platform admins only) lists every business and sets its modules and
whether it may use Gitwork's AI keys: a draft with Save/Discard; changing Gitwork's own workspace
needs explicit confirmation (`planWorkspaceUpdate`, pure, in `src/lib/platform-rules.ts`, shared
with the demo); every change goes to the business's own audit log as
`platform.workspace.settings_changed`. `src/server/platform/` is the one place allowed to read
across workspaces. Demo at `/demo/platform`; demo handlers can now refuse a write with
`{ error, __status }`.

**Not verified:** any of this against production data, and the iOS app (its repo isn't in this
session yet). (The console's dark mode can now be checked on the demo: §131.)

### 85.6 The console is built for many businesses (Oct 2026)

- **The list is paged in the database.** `GET /api/platform/workspaces?q=&page=&pageSize=&sort=&dir=&modules=&ai=`
  returns `{ workspaces, total, page, pageSize }`: 20 a page (max 50), newest first, search on name
  and slug, filters for modules (every / chosen) and AI keys (Gitwork's / own). The page is clamped
  to the last one, so a narrowing filter never shows an empty page. A bad value is a 400 naming it
  (`parsePlatformWorkspaceQuery`), never a silent default.
- **Pure twins.** `applyPlatformQuery` (in `platform-rules.ts`) does the same search, filter, sort and
  paging in memory for the demo and tests; `platformWorkspaceWhere` is the server's Prisma version.
  Change one, change both.
- **A business opens in the house two-column popup** (`.app-dialog-fixed`: Overview, Modules, AI keys,
  Activity), kept in `?business=<id>` so a link opens it. `GET /api/platform/workspaces/[id]` serves it.
  Closing with unsaved changes asks first.
- **Validation in `planWorkspaceUpdate`:** "chosen modules" with none chosen is refused (it would lock
  everyone out of everything but Settings), and a save carrying an older `expectedUpdatedAt` is a
  **409**, so two people editing one business can't silently undo each other. The Gitwork check runs
  first, then the empty-module check.
- Activity (`GET /api/platform/audit?page=&workspaceId=`) is paged and filters to one business.
- `/demo/platform` carries 45 businesses and runs the same rules, so paging, refusals and the 409
  can be driven there.

## 87. Recent Changes (October 2026) — Code becomes Staff (Phase 1, web)

The module is now **Staff** (sidebar: Staff, "People and availability"), a roster of everyone on
the team. Developer vetting is its **Hiring** half. Phase 1 of `docs/multi-tenant-roadmap.md`.

- **People** at `/app/staff` (`src/components/staff/staff-roster.tsx`, server `src/server/staff.ts`,
  rules `src/lib/staff.ts`, API `GET/POST /api/staff`, `PATCH /api/staff/[id]`). It lists every
  active member, plus Staff records with no active account behind them (contractors,
  developers who never sign in). Columns: job title, department, type, clients, start date.
  "Create profile" makes a record for a member who has none; "Add someone" makes one for
  someone with no login. List needs the `codeclear` permission (now labelled Staff); writes need
  `code.manage`.
- **Tabs** (`CodeClearTabs`): Staff = People · Developers · Archived; then Hiring = Overview
  (`/app/codeclear`, the old landing page) · Pipeline · DevSignal, shown only when the workspace
  has the `devsignal` module. `/app/code` redirects to `/app/staff`. Page titles say Staff or
  Hiring. ⚠️ The permission id stays `codeclear`: it is stored in every role matrix and override.
- **Schema (additive)**: `Candidate.memberId` (unique, FK to WorkspaceMember, SetNull),
  `jobTitle`, `department`, `employmentType` (EMPLOYEE | CONTRACTOR | FREELANCER, validated in
  code), `startDate`, `managerId` (loose id to another record). `githubHandle` is now optional:
  a record can be anyone.
- **Linking existing records**: `linkStaffRecords` runs on each roster read and sets `memberId`
  from the old email match, only when exactly one member and one unlinked record share an
  address. Ambiguous matches are left alone, never guessed. The ~7 places that still match by
  email (avatar sync, archived devs, client visibility, Backstage directory, mentions, team
  roster, merge) were deliberately NOT moved to the FK yet: their results are identical while
  every link comes from the same match, and moving them is a later, separate change.
- ⚠️ **Developer lists stay developers-only.** `DEVELOPER_RECORD` (`githubHandle` not null, in
  `codeclear-archived.ts`) is in `buildCandidateWhere` and the Overview counts, so Developers,
  Pipeline, Overview and the iOS Dev Directory (it reads `/api/codeclear/candidates`) show exactly
  the rows they did before. Every existing record has a handle.
- ⚠️ **`githubHandle` is always a string on the wire** (`""` = none). The iOS app decodes
  `DocsByGitworkCodeClearCandidate.githubHandle` as a required `String`, and a null would fail the
  whole list (Dev Directory, rate profiles, placement scheduling). GitHub analysis and repo
  validation refuse a record with no handle with a clear 400.
- ⚠️ **`memberId` is NOT `@unique`** (see §2): the first deploy failed on exactly that. One record
  per member is enforced in `src/server/staff.ts`, which reads the earliest (`staffRecords`, a list).
- **Known gaps**: `/app/codeclear` (Hiring Overview) belongs to the Staff module in the workspace
  catalogue, so a business with Staff but not Hiring could still open it by URL (it shows
  developer stats only). A non-developer placed on a client counts in Portal's dev count and cost,
  like any placement. Backstage's team directory and Settings → Team still have their own lists;
  folding them into Staff is still to do. Demo at `/demo/staff`.
- **Placeholder accounts are hidden** (`seedAccountUserWhere` / `isSeedAccount`, the filter Team and
  Backstage use), so the bootstrap "Foundry Owner" and seeded "admin" are not listed as people.
- **The table never clips.** It is `table-fixed`, edge to edge in the card, in its own scroller;
  Started shows from `lg`, Department from `xl`, Type from `2xl`, so Clients always keeps room. Below
  `md` each person is a card. Sortable Person, Job title and Started (`sortStaffBy`: blanks last both
  ways), 20 a page. Avatars use the shared `Avatar`, which falls back to initials when an image fails.
  `SortHeader` now lives in `src/components/ui/sort-header.tsx`.

### 87.1 The Staff pages left `/app/codeclear` (Nov 2026)

Every page under `/app/codeclear/**` moved; the old paths are `redirect()` stubs that keep the
query string (`withSearch` + `movedCodeclearPath` in `src/lib/legacy-redirect.ts`), so old links,
notifications and Slack messages still land.

| Old | New |
|---|---|
| `/app/codeclear` | `/app/staff/hiring` (Hiring → Overview) |
| `/app/codeclear/pipeline` | `/app/staff/hiring/pipeline` |
| `/app/codeclear/devsignal/**` | `/app/staff/hiring/devsignal/**` |
| `/app/codeclear/candidates` | `/app/staff/developers` (Staff tab) |
| `/app/codeclear/candidates/[id]` | `/app/staff/hiring/candidates/[id]` (external candidates; team members still redirect to `/app/staff/[id]`) |
| `/app/codeclear/archived` | `/app/staff?view=archived` |

- **Why `/app/staff/…` and not `/app/code`:** the tabs already read Staff = People · Developers and
  Hiring = Overview · Pipeline · DevSignal under one Staff sidebar item, and `/app/code` already
  redirects to `/app/staff`. Paths now follow the tabs.
- **Gates:** `/app/staff/hiring/devsignal` (`devsignal`) sits ahead of `/app/staff` in
  `MODULE_PATHS`, renamed in place; the legacy `/app/codeclear/devsignal` entry stays so the stubs
  keep the same gate. Workspace modules: all of `/app/staff/hiring` is Hiring (`devsignal`), which
  also closes the old gap where a Staff-only business could open Hiring's Overview by URL.
- Developers list rows open `/app/staff/[id]` directly; Pipeline rows open the Hiring candidate page.
- The permission id stays `codeclear`. `/api/codeclear/**` is unchanged.
- Tests: `src/lib/__tests__/legacy-redirect.test.ts` (map, query strings, every stub, and a sweep
  that no `/app/codeclear` path is left in `src` outside the stubs and the gates),
  `staff-tabs.test.ts`, and the module-gate / workspace-module cases for the new paths.

## 88. Recent Changes (October 2026) — Phase 2 begins in shadow mode

Phase 2 of `docs/multi-tenant-roadmap.md` makes every request find its own workspace. Step 1
changes **nothing anyone sees**: it carries the workspace in every token and compares it with
today's answer, which is still the only one used.

- **Tokens carry the workspace.** Web sessions get `workspaceId` at sign-in and on the
  five-minute member recheck (`auth.ts`, copied to `session.user` in `auth.config.ts`). Mobile
  and desktop tokens get an optional `wid` claim (`mobile-jwt.ts`), forwarded by the middleware
  as `x-foundry-user-workspace` (stripped from incoming requests like the other `x-foundry-user-*`
  headers) and read by `getRequestUser`. ⚠️ Tokens already on phones carry no claim and keep
  working; a test signs one without it and verifies it.
- **Shadow comparison** (`src/server/auth/request-workspace.ts`): `requireAuthedUser` records
  whether the token's workspace agrees with the one it served. It never uses the claimed one, and
  it never throws. "No claim" (an older token) is counted apart from a real disagreement, and a
  disagreement is logged once per user/claim/served combination.
- **Read the counts** at `GET /api/platform/workspace-shadow` (platform admins only; ids only;
  resets on deploy). The plan is a week with `mismatches: 0` before anything depends on the claim.
- **Ratchet** (`src/server/auth/__tests__/workspace-lookup-ratchet.test.ts`): `DEFAULT_WORKSPACE_SLUG`
  and `ensureBaseRecords` may only appear fewer times in `src`, never more. Lower the ceiling
  in the PR that removes some.
- Map of every place that resolves a workspace today, for the file-by-file work in step 2:
  `requireAuthedUser` filters by the Gitwork slug; ~184 files call `ensureBaseRecords()`; ~46 use
  `DEFAULT_WORKSPACE_SLUG`; crons vary (some loop over workspaces, some use the default, some are
  global). API-key callers have no identity and resolve to the bootstrap owner.

**Step 2.2a: first-time setup starts at server start-up.** `ensureBaseRecords()` was two things:
first-time setup (schema patches incl. pgvector, seeds, admin bootstrap, backfills) and "find the
Gitwork workspace". Setup only ran on whichever request called it first, so removing call sites
could have stopped it running at all. The memoised run is now `runFirstBootSetup()`
(`src/server/bootstrap.ts`), started by `src/instrumentation-node.ts` (not awaited; skipped
without `DATABASE_URL` and during `next build`). `ensureBaseRecords()` only delegates to it, so
there is still one run per process and every caller is unchanged. Tests:
`src/__tests__/first-boot-setup-at-startup.test.ts`.

**The isolation suite (`npm run test:isolation`, CI job `isolation`).** Seeds two businesses into a
throwaway Postgres (`scripts/isolation-db.sh`, `foundry_isolation` only). It then calls every API
handler as a Super Admin of one, with the other's ids, in both directions; a response carrying the
other's marker is a LEAK, and a changed row is a WROTE. Today 63 reads and 32 writes cross: mostly
Care (`support/clients/[clientId]/*`), wiki sub-routes, team, Docs by id and Pulse scans by id.
They are recorded in `tests/isolation/known-leaks.json`, and **that list is the Phase 2.2b
worklist**. The suite fails on a new crossing, and on a fixed one still listed (shrink it with
`ISOLATION_UPDATE=1`). ⚠️ Never add a new crossing to the list to get green. ⚠️ `rejected` and
`error` verdicts prove nothing: the suite sends `{}` bodies. Details: `docs/build-checklist.md` §4b.

**Scheduled jobs run per workspace.** `forEachWorkspace` (`src/server/workspaces/for-each.ts`)
runs a job once per matching workspace, in order, catching each failure so one business can't stop
the others. `docs-gdrive-backup` loops through it. Pulse monitors scan on the monitor's own workspace
(`createPulseScanRecord({ workspaceId })`). Two of these used to cross between businesses:
- `resolveBackupAuth` fell back to any user's Google token in the database;
- monitor scans were saved to Gitwork whoever owned the monitor.

Care's jobs (`support-sync`, `care-digest`, `embed-conversations`, `analytics-snapshot`) were
left until Nov 2026 and now loop per workspace too: see "Phase 2.2b, Care" below. Gitwork-only by
design: `meet-transcripts`, `wedge-course-feed`, `wedge-keepwarm`.

Tests: `src/server/__tests__/crons-per-workspace.test.ts`, `monitor-workspace.test.ts`,
`tests/isolation/crons.test.ts`.

**Phase 2.2b, Docs (Nov 2026).** Documents, proposals and templates are now looked up inside the
caller's workspace (`src/server/documents-scope.ts`), so another business's id reads as a 404,
the same as an id that doesn't exist. The workspace is the one `requireAuthedUser` already serves
(Gitwork, today), not the token's claim, so no Gitwork row stops matching. The workspace API key
(no user) still resolves to Gitwork's workspace, as before. Templates show the workspace's own
plus Foundry's stock ones (`workspaceId` null). 18 entries left `known-leaks.json`.
Every other `documents/[id]/*` and `proposals/[id]/*` handler (activity, AI, deck, DocuSeal,
signatures, comments, versions, presence, costing, engagement, export, PDF, relations, timeline)
starts with `requireDocumentInWorkspace(id, user)`. Routes that name a row under the document
(`comments/[commentId]`, `versions/[versionId]`, `signature-requests/[requestId]`) also run
`requireRowOfDocument`, or your own document could be used as the key to another business's
comment. ⚠️ The isolation suite can't prove these route by route (its `{}` bodies stop most writes
at validation), so `src/server/__tests__/document-routes-scoped.test.ts` fails on any handler under
those folders that doesn't call the guard. The fixtures now seed a comment, a version and a child
document per business; before that, those routes answered 200 with nothing to leak and read as
"isolated". The report lists `rejected` and `isolated` calls too, because neither proves anything
on its own.

**Phase 2.2b, Portal (Nov 2026).** Every `/api/clients/[slug]/**` route now finds its client in
the caller's workspace. They used to look the slug up in Gitwork's (`ensureBaseRecords()` +
`workspaceId_slug`), and slugs are unique per workspace only.
- **One rule:** `requestWorkspaceId(user)` / `workspaceIdForRequest(req)` in
  `src/server/workspaces/scope.ts`. It returns the served workspace, or Gitwork for a null caller
  (the API key), the same as today.
- **One resolver:** `clientIdForSlug` / `requireClientIdForSlug` (`src/server/clients-scope.ts`).
  A route naming a row under the client (platform, design, document link, request, course
  request) also runs `requireRowOfClient`.
- **The shared helpers take a workspace now:**
  - `src/server/clients.ts`: list, detail, create, update, delete, status, touchpoints, platform
    logins, bank;
  - CRM's `findLead`;
  - `resolveInternalLaunchpadTarget(slug, req)`, `resolveInternalSheets`;
  - `wikiIdForClientSlug(slug, workspaceId)` (it used to match a slug in ANY workspace);
  - the intake-comment scope;
  - onboarding links.

  `tsc` finds every caller, the MCP included (`user.workspaceId`).
- **Onboarding submit** creates the client in the workspace that sent the link (`row.workspaceId`).
  It used to always use Gitwork.
- **Tests:** `src/app/api/clients/__tests__/client-routes-scoped.test.ts` fails on any handler
  under `clients/[slug]` that names none of the scoped resolvers, and on any `ensureBaseRecords`
  there.
- **Left as it was:** `getClientNameBySlug` (page titles) takes an optional workspace and still
  defaults to Gitwork. Pages are scoped separately.

**Phase 2.2b, Team and admin (Nov 2026).** People & access, invites, the rate card, the audit log
and the Staff schedule work inside the caller's workspace.
- `src/server/team.ts`: `listMembers` / `listInvites` / `createInvite` take a workspace. The
  member and invite writes find their row by id **and** workspace (`MemberActor.workspaceId`;
  `findInvite`), so another business's id reads as not found. `updateMember` takes the actor.
- Every `/api/team/**` route resolves the caller with `requireTeamAdmin` (a database read, §57),
  not `auth()` + the session role. `invites/[id]` had no admin check at all, and `reset-password`
  could reset any user's password in any workspace; both are fixed.
  `src/app/api/team/__tests__/team-routes-scoped.test.ts` fails on a team route that uses the
  Gitwork slug, `ensureBaseRecords` or the session role.
- **Two older team routes brought into line (Dan's calls):**
  - `DELETE /api/team/[userId]` now **archives** the member through `archiveMember` (audited,
    restorable for 30 days) instead of deleting the User row. Same rules as Settings → Team.
  - `reset-password` never goes up the role ladder: it needs `canManageRole(actor, target)`,
    so an Admin can't reset an Admin's or a Super Admin's password. Your own is always allowed.
  - Tests: `src/app/api/team/__tests__/team-userid-routes.test.ts`.

**Phase 2.2b, Pulse scans and Study (Nov 2026).** A scan or study is found by id **and** workspace.
- `getPulseScan`, `renamePulseScan`, `deletePulseScan`, `reanalysePulseScan` and `getStudy` /
  `updateStudy` / `deleteStudy` / `listStudies` / `createStudy` take a workspace (`tsc` finds every
  caller, the MCP and the starters download included). `assertPulseScanAccess` refuses another
  business's scan before the "sees all clients" shortcut, so its Super Admin can't open one.
- The scan sub-routes (stream, email, pdf, run-browser, share) look up with `findFirst({ id,
  workspaceId })`. Re-analysis, fix-agent, discovery prep, study plans and study runs use the
  row's own workspace AI keys, not Gitwork's.
- The printable report page (`/app/pulse/[scanId]/report`) had no access check; it now has the
  same one as the scan API. The study plan POST now checks the study is the caller's first.
- Tests: `src/server/__tests__/pulse-study-workspace-scope.test.ts` and
  `src/app/api/pulse/__tests__/pulse-study-routes-scoped.test.ts` (fails on a scan or study route
  that uses `ensureBaseRecords` or an id-only `findUnique`).
- ⚠️ Still Gitwork-scoped: the scan **list**, projects and portfolio (they read Gitwork's
  workspace), and `getScanHistory`. Next block.

**Phase 2.2b, Staff, Hiring and DevSignal (Nov 2026).** Every `/api/codeclear/**` and
`/api/devsignal/**` route reads the caller's workspace (`workspaceIdForRequest`), not Gitwork's.
- `requestActor(req)` (`src/server/workspaces/scope.ts`) returns the workspace and who to credit.
  Notes, score changes, GitHub-analysis runs and validations used to be credited to the bootstrap
  owner ("Foundry Owner"); they now name the signed-in caller. The workspace API key still credits
  the owner.
- `src/app/api/codeclear/__tests__/code-routes-scoped.test.ts` fails on any route in those two
  folders that uses `ensureBaseRecords` or the Gitwork slug.
- Left on Gitwork on purpose: the public `/apply` flow (`src/server/devsignal/apply.ts`) is
  Gitwork's own careers page and has no caller to read a workspace from.

**Phase 2.2b, Settings, workspace config and the rest of Docs (Nov 2026).** Settings
(integrations, models, dev rates, Docs backup, custom hostname, Slack webhooks), workspace
branding/defaults/Pulse embed and pricing, roles, the rate card, snippets, the Docs AI routes,
document creation and Slack/meeting integrations read the caller's workspace. Routes that need
the whole workspace row read it with `findUniqueOrThrow({ where: { id } })`.
- Comments, versions and signature requests were recorded against the bootstrap owner; they now
  name the caller (`requestActor` also returns `id`). The API key still credits the owner.
- `src/app/api/__tests__/settings-docs-routes-scoped.test.ts` fails on a route in those folders
  that takes the WORKSPACE from `ensureBaseRecords` or uses the Gitwork slug. Taking the owner
  from it, for an API-key caller, is still allowed.
- ⚠️ Not done, on purpose: `/api/account` and `/api/account/password` still read the Gitwork
  membership by slug. They answer "which workspace am I in", which is what the sign-in switch
  settles; change them with it.
- `PUT /api/settings/integrations` (AI keys, Slack token, email) is Admins and Super Admins only
  (Dan, 3 Nov 2026), read from the database role.

**Phase 2.2b, the server modules (Nov 2026).** Handbook, Starters, Starter recipes, onboarding
forms, Launchpad templates and summaries, Foreman and Curator (queries, runs, proposals, restore),
Pulse (scan list, projects, portfolio, stats, benchmarks, retry, proposal from scan, monitors,
check config, agent prompt overrides) and the code portfolio take a `workspaceId` instead of
picking Gitwork themselves; `tsc` found every caller. Scan creation (`createPulseScanRecord`),
Foreman and Curator runs now require it.
- By-id lookups that ignored the workspace now refuse another business's row: onboarding forms
  and Launchpad templates (own rows plus Foundry's stock ones, `workspaceId` null), Curator runs,
  and Pulse retry (uses the scan's own workspace and AI keys).
- The bare `await ensureBaseRecords();` calls left over in tasks, Backstage, absences, standups,
  milestones, categories, Slack updates and two pages are gone: setup runs at server start.
- Left on Gitwork on purpose: the public Pulse embed funnel (leads, full-report delivery and its
  config), the `/apply` careers page, golf clubs, the Wedge jobs, meeting notes, the team-roster
  seed and the `/api/dev` one-shots. Care stays out entirely (Dan).

**Phase 2.3, the sign-in switch (Nov 2026).** Which workspace a person is in is decided by
`src/server/auth/home-membership.ts`, not the Gitwork slug: the workspace their token names while
that membership is active, else Gitwork, else their oldest active membership. Archived rows are
never chosen. Every path uses it: `requireAuthedUser` (per request), the web sign-in and its
five-minute recheck (`auth.ts`), the iOS and desktop token exchanges, guest password login, MCP
(`resolveEffectiveUserById`, `getMcpAdminState`), `/api/account` and the settings, analytics and
new-scan pages (`findSessionMembership`). Every Gitwork member resolves to Gitwork exactly as
before. Tests: `home-membership.test.ts`, `request-workspace.test.ts` (a token naming another
workspace the person belongs to is served it; one they don't belong to never is).
- ⚠️ Still with Gitwork on purpose, until businesses have their own sign-up: provisioning a NEW
  account (Google sign-in is `@gitwork.co.uk` only), the first-admin bootstrap, invite auto-accept,
  and the env `API_KEY` (no user → Gitwork). Each business now has its own keys and MCP
  connections are bound to a workspace (below).
- Someone in two workspaces lands in Gitwork, or the one their token names, and can switch
  (below).
- ⚠️ **The isolation suite can now see b→a.** With the second test business served its own
  workspace, 9 more Care crossings became visible (`support/**`, b→a). They are not new code,
  they were always there behind the Gitwork-only sign-in. Recorded on the Care worklist in
  `known-leaks.json`. A business created with `DEFAULT_BUSINESS_MODULES` cannot reach them: Care
  is not in the bundle and the module gate refuses `/api/support` before any role check. Fix them
  before Care is ever switched on for another business. Nothing outside Care crosses.

**Per-workspace API keys, and MCP bound to a workspace (Nov 2026).**
- **Settings → Developer → `01 // API KEYS`** (Admins and Super Admins). A key is named, shown
  once, stored only as a SHA-256 (`WorkspaceApiKey`, additive, loose ids), at most 25 live per
  workspace, revoked rather than deleted. Create and revoke are audited (`api_key.created` /
  `api_key.revoked`) and refuse to be called with a key. The old "External API key" box went:
  it saved `Workspace.externalApiKey`, which nothing read.
- **Format** `fwk_<keyId>_<secret>_<signature>` (`src/lib/api-key-token.ts`, WebCrypto, edge-safe).
  The signature is an HMAC under `AUTH_SECRET`, so the middleware refuses a made-up key without a
  database read. ⚠️ Rotating `AUTH_SECRET` invalidates every key (and every session).
- **A key acts as the person who created it, in its own workspace only.** `requireAuthedUser`
  resolves it (`resolveApiKey`) on every request: live, not revoked, and its creator still an
  active member of THAT workspace (`findActiveMembershipIn`, no fallback). Archive the creator and
  their keys stop. ⚠️ Every failure is `RevokedAccessError`, never `null`: null is the trusted env
  `API_KEY`, and a broken key must never be promoted to it.
- **The browser cookie is gone** (§57.6 item 3). The env `API_KEY` still works as a Bearer header
  for Gitwork's own integrations and crons, and still resolves to Gitwork.
- **MCP:** a request is served only from the workspace its `McpConnection` was approved in
  (`validateMcpBearer` → `resolveMcpActor(userId, workspaceId)`, strict). A revoked or missing
  connection refuses; the token refresh checks the same. A person in two businesses connects once
  per workspace.
- ⚠️ A key on a route that trusts any session (§57.6 item 2) gets what any session gets there.
  Those routes are the remaining Phase 2 worklist, the same as for sessions.
- Tests: `api-key-token.test.ts`, `src/server/__tests__/api-keys.test.ts`,
  `api-keys-routes.test.ts`, `mcp-access.test.ts`.

**Phase 3, first slice: businesses created by us, people sign in with a password (Nov 2026).**
Dan's calls: no public sign-up page until there's billing; people at a new business use email
and password. Google is out for them because Foundry's Google sign-in asks for Gmail and Drive
scopes, which Google only grants to outside users after verification and a yearly assessment.
- **Platform console → Add business** (`createPlatformBusiness`, `POST /api/platform/workspaces`,
  platform admins). Creates the workspace with `DEFAULT_BUSINESS_MODULES`, restricted modules
  and `platformAiKeysAllowed: false`, plus a 14-day owner invite addressed to the owner's email
  with role `SUPER_ADMIN`. The invite is emailed (`sendWorkspaceEmail`, the new workspace has no
  email settings, so it uses the server's SMTP) and its link shown to copy. Audited as
  `platform.workspace.created`. Slugs come from `businessSlug` and can never be `gitwork`.
- **Invites carry `email` and `role`** (`WorkspaceInvite`, additive). Rules in
  `src/lib/invite-rules.ts`: an addressed invite accepts only that email; the role defaults to
  `DEFAULT_PROVISIONED_ROLE`. Gitwork's open label-only invites behave exactly as before.
- **Accepting with a password** (`acceptInviteWithPassword`, `POST /api/auth/invite/[token]`,
  public, rate-limited). Creates the account and the membership, then signs straight in.
  ⚠️ Refused for an email that already has a Foundry account (it would take that account over),
  and for Gitwork's own invites (Gitwork is Google-only).
- **Who may use a password:** `isPasswordLoginAllowed(role, workspaceSlug)` in `types/auth.ts`.
  Gitwork, or an unknown workspace: guests only, as before. Any other business: every role.
- ⚠️ **The shared recovery key is gone.** `POST /api/auth/forgot-password` used to set ANY
  user's password on `INITIAL_ADMIN_PASSWORD`, which is why passwords were guest-only. It now
  emails a single-use, one-hour link (`src/server/auth/password-reset.ts`, `PasswordResetToken`,
  SHA-256 stored), only to accounts that may use a password, and answers the same either way.
  `/reset-password` uses it. **Never bring back a reset that doesn't prove control of the mailbox.**
- **Settings → Team invites** take an optional email (only that address can accept) and the role
  they join with. The inviter can only offer roles they may assign (`canManageRole`), checked again
  in `createInvite`, so an Admin can't mint a Super Admin invite.
- **Workspace switcher** (`src/components/workspace-switcher.tsx`, above the profile menu) for
  someone in more than one business. It calls `useSession().update({ workspaceId })`; the jwt
  callback switches only to a workspace the person is an ACTIVE member of
  (`findActiveMembershipIn`), then refreshes role, permissions and modules.
- **Getting started** card on HQ (`src/lib/getting-started.ts`, admins, never Gitwork): logo,
  invite the team, AI key, first client. Hidden once all four are done.
- **Google sign-in for a business** (`src/server/auth/business-google.ts`): a SECOND Google client,
  `google-business`, asking only for `openid email profile`, so it needs no Gmail/Drive review.
  Off until `AUTH_GOOGLE_BUSINESS_ID` / `_SECRET` are set (GitHub secrets, synced by `deploy.yml`);
  the login button only shows then. Admits someone with an active membership, an addressed
  invite, or (brand-new accounts only) an email on a domain exactly one business lists in
  `Workspace.allowedEmailDomains` (Platform console → a business → Sign-in;
  `src/lib/email-domains.ts` refuses public mail services and gitwork.co.uk). ⚠️ A domain never
  brings back an archived or removed account. Its refresh token is NOT stored (wrong scopes for
  the Gmail widgets), and it never touches Gitwork's provisioning or first-admin bootstrap.
- **iOS sign-in with a password** (`POST /api/auth/mobile-password` { email, password }, public,
  rate-limited per IP and per email). Runs `verifyPassword`, re-reads `findHomeMembership` and
  refuses again if `isPasswordLoginAllowed` fails, then mints the same token and JSON shape as
  `mobile-callback`, naming the member's workspace. Every refusal is one 401. ⚠️ It never creates
  or promotes anyone. The app side is Git-Dann/foundry-ios#1 (unbuilt until a Mac build).
- **Not done yet:** a public sign-up page.
- Tests: `src/lib/__tests__/signup-rules.test.ts`, `src/server/__tests__/password-reset-and-signup.test.ts`.
**Phase 2.2b, Care (Nov 2026).** Every `/api/support/clients/[clientId]/**` handler starts with
`requireSupportClient(req, clientId)` (`src/server/support-scope.ts`), which proves the Care
client is in the caller's workspace and returns that workspace id. A route that names a row
under it (conversation, ticket, connection, report, draft action, workflow rule) also runs
`requireSupportRow(kind, id, clientId)`. Another business's id reads as a 404 and nothing is
written. Lookups only: nothing a Gitwork user sees changed.
- `listSupportClients`, `createSupportClient`, `getSupportDashboardSummary`,
  `getClientQueueSummaries` and `listWorkspaceMembers` take a `workspaceId`; `getWorkspaceId()`
  (Gitwork) is gone. The dashboard, queue summaries and `support/reports/[reportId]` read the
  caller's workspace. Linking a Portal client (`workspaceClientId`) or a conversation to a ticket
  must stay in the same workspace / client.
- AI routes (draft, semantic search, narratives) and draft-reply sending use the client's own
  workspace keys. `buildSyncContext` and `syncClientConnections` use the connection's own
  workspace; the report Document is created in the Care client's workspace.
- The four Care crons loop with `forEachWorkspace` (workspaces with Care clients).
  `embed-conversations` selects only that workspace's conversations and embeds with its key.
- Exempt from the sweep: `support/webhook/[token]` (token is the credential) and
  `support/discord/channels` (holds no workspace data).
- Tests: `src/app/api/support/__tests__/support-routes-scoped.test.ts` (sweep),
  `src/server/__tests__/support-workspace-scope.test.ts`, `care-crons-per-workspace.test.ts`.
  `known-leaks.json` no longer has any `support/` entry.

**What the isolation suite can't see yet.** Once Pulse/Study landed, `known-leaks.json` held only
Care (now cleared). That is not the finish line: the sign-in check (`requireAuthedUser`) only serves Gitwork,
so every b→a call is refused before it reaches the code. A route that still reads Gitwork's
workspace directly passes the suite and would show Gitwork's data to another business the day
they can sign in. The `ensureBaseRecords` / `DEFAULT_WORKSPACE_SLUG` ratchet is the real
remaining worklist, then sign-in switches to the token's workspace (the shadow comparison's
0 mismatches are the evidence for that).

## 89. Recent Changes (October 2026) — A client's own board columns, and a one-line plan strip

A developer asked to add columns to a client's task board. **Columns** (beside Categories) adds
up to 12 named columns per client. Each one **counts as one of the five statuses**: "QA" counts as
In review, "Blocked" as Doing.

- **No new status, on purpose.** Standups, project updates, Foreman, the Gantt and the client's
  Delivery page all read `TaskStatus`. A column is a lane inside a status, so none of them change:
  a task in QA is still IN_REVIEW. Rules in `src/lib/tasks/board-columns.ts` (pure, tested).
- **Data (additive):** `WorkspaceClient.taskBoardColumns Json?` (`[{ id, name, stage }]`) and
  `Task.boardColumnId String?`. API `GET/PUT /api/board-columns?clientId=` (same scope as categories).
- **Where a task sits is derived** (`laneKeyFor`). It is in a custom column only while that column
  exists AND belongs to the task's current status, so a status change anywhere else (drawer, batch,
  MCP) drops it back to the status column. `statusTimestamps` also clears `boardColumnId` on any
  status change, and removing a column clears it from its tasks.
- **Slack names the column.** Standups, project updates and re-rendered cards show it at the front
  of the task line (`• Retry payment · QA · due Fri`). `columnName` on `StandupTaskCardInput`.
- ⚠️ **`/api/tasks` builds its list from an explicit allow-list** (`taskListResponse`), as does
  `taskListDTO`. A new `TaskDTO` field missing from either never reaches the board.
- Names are unique per board, ignoring case and spacing, and can't repeat a status ("Done").

**The plan banner is one line now.** It took ~130px above the board. It's a chip cluster at the
end of the filter row (`PLAN · 85% ON IT` · `24 off plan` · sort · `40 untouched 21d+`), and the
explanations moved into tooltips. Board and list only.

**Verified:** at `/demo/tasks` (seeded with a QA column): added a column through the dialog,
dragged a card from In review into QA, and checked 390px (no page overflow).
**Not verified:** against a real database. Post-deploy, add a column on a client, drag a task into
it, reload, then push a project update and confirm the line names the column.

## 90. Recent Changes (October 2026) — A Halloween theme

A pumpkin beside the header bell switches on a seasonal theme across `/app` and `/demo`:
- dark mode, with midnight-indigo surfaces and **pumpkin orange as the brand colour**;
- a solid pumpkin on the bottom-right of the logo;
- fog rolling along the bottom of the screen;
- ghosts and bats drifting across.

- **Where it shows: `HALLOWEEN_PATHS` in `theme-provider.tsx`**, currently `app` and `demo`. The
  same regex is in `layout.tsx`'s anti-flash script, and a test checks the two match. Never add
  a client deliverable or sign-in route.
- **On by default 20 Oct – 2 Nov** (`halloweenSeason`) for everyone. Anyone can switch it off
  with the pumpkin, and that choice is stored per browser in `foundry.halloween.v1`
  (`on` / `off`).
- **Colours are tokens:** `[data-theme="dark"][data-halloween]` in `globals.css`. It also points
  hardcoded `bg-blue-600`/`text-blue-600` at the orange, and gives white-on-brand badges dark
  text (white on orange is ~2.4:1).
- ⚠️ **Two layers, and neither may get in the way of Foundry (Dan's call).**
  - **Ghosts and bats sit BEHIND the content** (`HalloweenScene`, `-z-10` inside a shell root
    that is `isolate`). The page backgrounds behind them go transparent (`.halloween-clear` on
    the content column and header), so the creatures show in gaps and the header band, never on
    a card, button or line of text.
  - The sidebar stays solid on purpose: see-through, a ghost drifted behind the nav labels.
  - **The fog sits in FRONT** (`HalloweenFogFront`, fixed `z-45`), above the Desk drawer and
    below dialogs, at 0.42 opacity and faded upwards so text under it stays readable.
  - Both layers are `pointer-events: none`, `aria-hidden` and hidden in print. A hit-test of
    every visible control found none intercepted.
- **Nothing is hand-drawn (Dan's call).**
  - The toggle is Tabler's `IconPumpkinScary`.
  - The logo pumpkin and the bats are Microsoft Fluent Emoji (MIT, via Iconify).
  - The ghosts mix Fluent, Google Noto (Apache-2.0) and Tabler, so no two faces match.
  - The fog is Vanta's `FOG` shader (MIT) on three.js 0.134, loaded only while the theme is on.
  - Twemoji was skipped because CC-BY needs attribution.
  - The bats flap sideways (`scaleX`). A vertical squeeze read as pulsing.
- **Hydration:** the setting lives in the browser, so everything that renders from it waits for
  mount (`useHalloweenShown`). `readHalloween` is in `hydration-safe-storage.test.ts`'s
  allow-list for the same reason `readStoredMode` is.
- Reduced motion stills the fog and removes the ghosts and bats.

## 91. Recent Changes (October 2026) — Brand guidelines at /guidelines (Labs)

The Gitwork brand book as a 16:9 deck: a sidebar of chapters, a top bar with the breadcrumb,
`p. NN / 40` and previous/next, and every page a slide stacked down the screen. Opened from
**Settings → Labs**. Built from the Gitwork design system artifact (BG-2026-01: tokens, components,
README), plus Foundry's own logo files, so it also covers **how Gitwork's products are shown**.
The source artifact is linked from the top bar ("Artifact") and the ⋯ menu
(`GUIDELINES_SOURCE_URL` in `content.ts`).

- **Content is data:** `src/lib/guidelines/content.ts` holds the chapters, pages and copy (pure,
  tested). Eight chapters, 40 pages. Each page renders through one of 31 visuals in
  `src/components/guidelines/slides.tsx`, drawn at 1600 x 900 and scaled by `SlideFrame`.
- **Products chapter (06):** brand architecture (Gitwork → offers / products → modules), Foundry,
  the product lockup (name, dot in the product's colour, `by Gitwork` aligned to the dot),
  endorsement rules, Foundry's seven modules (plain type, never their own logo), and the product
  card a future product slots into. These rules are written down here for the first time; they
  follow the existing Foundry lockup (`public/foundry-logo.svg`), so check them before treating
  them as settled.
- **Leisure Tech and AfterDesk (added later in October 2026).** Leisure Tech is a trading name of
  Gitwork Group Ltd (its arm for caravan, motorhome and park businesses). It keeps its own identity
  and names Gitwork as the studio that delivers the software. AfterDesk (AfterDesk Ltd) is its
  warranty platform, built and run by Gitwork, and REMIT is in build. The architecture page has
  three columns (offers, Foundry, Leisure Tech), each has its own page, and the product-card page
  shows Foundry, AfterDesk and an empty slot. Their logos are copied from their own sites into
  `public/brand/` and the colours sampled from those files. ⚠️ AfterDesk only publishes a white
  logo, so it is always shown on its navy until a dark version exists. ⚠️ leisuretech.ai gives
  Gitwork Group Ltd's registered office as Congleton, while `src/lib/gitwork.ts` says Salford Quays;
  one of them is out of date.
- **Logos are the real files.** The Gitwork wordmark is `public/email/gitwork-wordmark-ink.png`;
  its paper and white variants are that file used as a CSS mask, with the purple dot put back on
  the paper variant (dot measured at x 456 to 478, y 77 to 98 of 480 x 100). The roundel is the one
  `GitworkMark`, now in `src/components/gitwork-mark.tsx` so this page does not pull in the whole
  Docs cover. The Foundry lockup is `foundry-wordmark-paths.ts`, generated from
  `public/foundry-logo.svg` by splitting its paths on their three fills (black name, `#9D9D9D`
  endorsement, `#4F46E5` dot). Regenerate it the same way if that file changes.
- **Edits are hidden and admin-only.** ⋯ → Edit text (or E) makes each title, subtitle and note
  editable in place. Saved as `Workspace.guidelinesOverrides` (additive JSON) keyed
  `<pageId>:<field>` via `PUT /api/guidelines` (`assertAtLeastAdmin`). Only the fields in
  `EDITABLE_FIELDS` can change, so an edit can change what a page says but never what it shows;
  `parseOverrides` drops stale keys. Clearing a field, or typing the default back, removes the
  edit. ⋯ also has Present (P, full screen), Copy link (the URL hash is the page), Print or save
  as PDF (one slide per 1600 x 900 page), and reset.
- **Wiring:** `isGuidelinesPath` in the middleware (session-gated like `/deck`), `/guidelines` and
  `/api/guidelines` in the Labs workspace module, `guidelines` in `FORCE_LIGHT` and the anti-flash
  script, `robots.ts` disallow. The viewer uses no dark-remapped utility class
  (`forced-light-routes.test.ts` checks it), because a brand book on paper has to look the same
  for everyone.
- **The copy keeps the brand's rules:** no em dashes, never "free", UK spelling. A test reads every
  title, subtitle and note for those.
- **Not verified against a database:** `/guidelines` needs a session, so the viewer was checked
  on a temporary scratch page (all 40 slides measured for overflow at 1440, the drawer at 390,
  edit and present mode). Post-deploy: open it from Labs, edit a subtitle as an admin, reload, and
  confirm the edit stayed.

## 92. Recent Changes (October 2026) — ⌘K command menu, and the EasyUI tracker

**⌘K / Ctrl+K opens a command menu** on every `/app` page and the demo. The palette is **EasyUI's own
Command Menu**, vendored at `src/components/ui/easyui/command-menu.tsx` (MIT, licence in
`docs/third-party-ui.md`), with colours mapped to Foundry tokens and dialog accessibility added.
What goes in it is `src/components/command-menu.tsx`, with the rules in `src/lib/command-menu.ts`. It jumps to a product, a client or a document, or switches theme.
The header has a Search button too, so it can be found without knowing the shortcut.

- **The pages are the shell's own `primaryNav`**, already filtered by module permission and workspace
  modules, so the menu can never offer a product the sidebar hides. Clients and documents load only
  after the menu is first opened, and only when the viewer has Portal or Docs (`useClientList` and
  `useProposalList` gained an `enabled` option for this). A result is only a link; the page it opens
  does its own gating.
- Empty query shows pages and actions; clients and documents appear once you type, capped at 6 per
  group (`GROUP_LIMIT`). Search is the shared `fuzzySearch`, so typos are forgiven.
- It is the one exception in `one-modal.test.ts`'s allow-list for a vendored dialog: it implements
  role="dialog", aria-modal, Escape, a focus trap and focus restore itself. The search field carries
  an inline `outline: none` because the global focus ring is unlayered (§69).
- **EasyUI components are used as EasyUI built them.** Our first rebuilds "in Foundry's style" looked
  nothing like the originals, so the rule is now: vendor the real component, keep its design and
  motion, and change only colours (to Foundry tokens, for light and dark), imports, accessibility and
  reduced motion.
- On the demo, `mapHref` sends `/app` links to the demo's own pages.

**`docs/easyui-adoption.md` tracks** the EasyUI-inspired components (undo toast, date picker, activity
heatmap, funnel chart and the rest): what each is for in Foundry, its status and its PR. Update it in
the same PR that changes a row.

## 93. Recent Changes (October 2026) — Undo toasts (EasyUI, vendored)

`useToast().undo(title, onUndo, { description, variant })` shows **EasyUI's Undo Toast**,
vendored (MIT) at `src/components/ui/easyui/undo-toast.tsx`, licence in
`docs/third-party-ui.md`. Same look, countdown bar and spring as easyui.site; colours mapped to
tokens (light + dark), pauses on hover **and focus**, Escape closes, no motion under
`prefers-reduced-motion`.

- **The action has already happened; Undo runs its inverse.** Nothing is deferred, so a toast
  that times out changes nothing. Offer it **only where a real server-side inverse exists** —
  never over a hard delete (`deleteTask`, `deleteWikiIntakeItem` are hard deletes: keep their
  confirms). An inverse that throws shows "Couldn't undo", never "Restored".
- **Restore what it was, not a default.** Requests' Undo puts back the request's old status
  (PROMOTED/TRIAGED), not the NEW that Reopen sets; Care's puts back new/open and is not offered
  from snoozed (setting SNOOZED back would leave `closedAt` stamped).
- Adopted: sheet row Remove (team — the confirm is gone; clients still confirm, they can't
  restore), Requests "Mark dealt with" (row, detail and batch), Care close (button and `E`).
- **Vendoring third-party UI:** put it under `src/components/ui/<source>/`, name the upstream
  file, licence and every change in a header comment, and add the licence text to
  `docs/third-party-ui.md`.

## 94. Recent Changes (October 2026) — People & HR, Phase 1a: profiles, personal details, suppliers

The first slice of the HR platform (spec: the "Foundry People & HR — spec" doc; build notes and
rules: **`docs/hr-platform.md`**). Staff is the record of every person; Backstage will read it.

- **Two new permissions, `hr.manage` and `hr.viewSensitive`, and no role has them by default.**
  `DEFAULT_ROLE_PERMISSIONS.ADMIN` is now every id **except** `HR_PERMISSION_IDS`. Personal and
  health data is granted to a named person (Siân), never inherited from a role. Super Admins
  always have both.
- **A profile page per person** at `/app/staff/[id]`, linked from People. One rule,
  `profileAccess` in `src/lib/hr.ts`, decides each tier for the page, the API and the demo:
  - directory: anyone with Staff;
  - employment (supplier, contract end, probation, notice, days per week): the person, their
    manager and `hr.manage`;
  - sensitive (date of birth, address, NI number, ID, right to work, emergency contacts): the
    person and `hr.viewSensitive` only. A manager never sees it.
- **The sensitive tier is encrypted** (one envelope per person, `StaffSensitive`). Every look by
  anyone but the person, and every change, goes to `HrAccessLog`, which names the fields and never
  the values. ⚠️ The page fetches personal details only when Show is pressed, and the query is
  never refetched in the background. A refetch is a second logged look, so don't add a broad
  `["staff"]` invalidation.
- **Suppliers** at `/app/staff/suppliers` (HR only): the partner company developers come through.
  Archived, never deleted. `Candidate.supplierId` is a loose id.
- `employmentType` gains **DIRECTOR**. Staff records gain `preferredName`, `pronouns`, `endDate`,
  `probationEndsOn`, `noticePeriodWeeks` and `daysPerWeek`. All additive.
- **Archive, restore and delete from the profile.** Someone who signs in goes through Settings →
  Team's archive/restore routes, so there is one way to take someone's access away. Someone without
  a login is archived on their record (`Candidate.archivedAt`). Delete is only offered for a record
  with no login, placements or developer reviews. ⚠️ Don't widen it: deleting someone with history
  erases who did what. **People → Archived** replaces the old Archived tab, which now redirects.
- `src/components/ui/segmented.tsx` is the in-card pick-one control (Active / Archived on Team and
  on People). `segmented-tabs.ts` stays the settings tab bar.
- Demos: `/demo/staff/r2` (profile, seen as HR) and `/demo/staff/suppliers`.

## 95. Recent Changes (October 2026) — Roles and permissions, tidied

Settings → People & access read as a list of every permission ever added. Now:

- **Eight permission groups, in sidebar order** (Pulse, Staff, Docs, Portal, Care, Backstage,
  Platform, Settings) instead of 14. Provenance and Study sit under Pulse, HR and Hiring under
  Staff, the daily roll-up under Portal, AI, MCP and Studio under Platform. Every label says what
  the person gets in a few words, and every description is one sentence.
- ⚠️ **Ids are unchanged.** They are stored in every role matrix and override. Change a label,
  never an id.
- **Two permissions retired:** `settings.branding` and `settings.content` controlled nothing (both
  pages redirect to Document defaults). Removing them from the catalog drops them from stored
  matrices on the next read (`normalizeMatrix` filters unknown ids).
- **No more Module / Field / Feature / Action tags.** That was our vocabulary, not the reader's.
  Only "High risk" remains. One `PermissionLabel` (`src/components/settings/permission-label.tsx`)
  is shared by the matrix and a member's access editor.
- **The matrix showed five role headers over four columns**, so Guest wrapped onto its own row with
  nothing under it. Guests get nothing by role by design, so the matrix shows Super Admin (locked),
  Admin, Staff and Developer, and says Guests are granted per person.
- **People & access:** Members first, then one **Add people** card (Invite link / Guest), then one
  **Invites** card with used invites folded away, then Merge accounts. Numbered in order (two cards
  were both "05").
- Invite copy no longer names `@gitwork.co.uk`; the allowed domain becomes per workspace in Phase 3
  of the multi-tenant roadmap.

## 96. Recent Changes (October 2026) — Staff: grouped cards, org chart, HR reminders, a fuller profile

- **People is cards, grouped under headings** (Admins, Staff, Developers, Guests, No login), not a
  table. Sort by name or newest; Cards / Org chart switch; CSV export (no rates, no personal
  details). The pager went: a team fits on one page, and the headings do the organising.
- **On hover, a person's clients rise from behind their card**, using EasyUI's macOS Folder Cards
  spring and pocket-card geometry (sheets nearly the card's full width). ⚠️ The card's motion
  wrapper needs its own `z-10`: its transform makes a stacking context, and without it the tabs
  paint over the card.
- **For HR** card on People (`hr.manage`): coming up in 60 days, and records missing details.
- **Profile:** Overview edits in place; Activity (EasyUI heatmap + placements) and Time off cards.
  ⚠️ Leave TYPE is shown only to the person and HR; everyone else sees "Off".
- Details: `docs/hr-platform.md`. Demo: `/demo/staff`, `/demo/staff/r3`.

## 97. Recent Changes (October 2026) — HR documents, with Google Drive copies

The documents vault from the HR spec (Phase 1b). Rules and details: `docs/hr-platform.md`.

- **A Documents card on each profile**: a required list per engagement type, what's on file, and
  adding more. One rule each for who sees a document (`canSeeDocument`: HR all, the person all but
  HR-only, a manager only what's shared with managers, nobody else) and who may add which type
  (`canUploadType`). A person's own upload waits as "to check" until HR accepts it.
- **Model:** `StaffDocument` (file, Drive link or request), `Workspace.hrDocumentSettings`
  (`{ selfUploadTypes, driveEnabled }`, both off by default), `Workspace.hrDriveFolderId`,
  `Candidate.hrDriveFolderId`. All additive.
- **Drive:** each upload is copied into a "Foundry HR" folder in the workspace owner's Drive when
  the business turns it on. `resolveWorkspaceGoogleAccount` (in `google-drive-backup.ts`) is now the
  one account lookup for every Drive copy; the Docs backup calls it too. ⚠️ Opening a file in Drive
  isn't in Foundry's access log.
- **EasyUI's Animated File Upload, vendored** (`src/components/ui/easyui/animated-file-upload.tsx`,
  with `uploadWithProgress` for real progress and the view-as headers). Used for HR documents,
  task screenshots and the new-document wizard. Deliberately not on Launchpad's requirement rows:
  a drop zone per row would swamp the list.
- **Shared profile parts** (`src/components/staff/profile-parts.tsx`): Field, dates, the header
  action. The profile, the Documents card and Backstage → Me use the same pieces.

## 98. Recent Changes (October 2026) — Backstage → Me

Phase 1c of the HR spec. Details: `docs/hr-platform.md`.

- **Me is the person's own Staff profile**, not a second copy: `StaffProfileView` takes
  `mode="me"`, which only removes the link back to People and the archive/delete controls. What
  they can see and edit is still decided by `profileAccess` on the server (relation `self`).
- `GET /api/staff/me` returns their record id (after `linkStaffRecords`, so HR's record with
  their email is found). `POST` makes one for an active member who has none: name and email only.
  ⚠️ `memberId` is unique; the create catches the P2002 from a double click and returns the
  winner's record.
- **Card 01 on Backstage** shows what HR is waiting on from them (documents requested or sent
  back), and only where the business has Staff.
- ⚠️ **Six units at `xl` is 146px a card.** It's `min-[1400px]:grid-cols-6`, and the
  two-column rule for that case is `sm:max-[1399px]:grid-cols-2`. Tailwind emits arbitrary
  `min-[…]` variants before named breakpoints, so a plain `sm:grid-cols-2` wins and six columns
  never appear. Measured at 1024, 1280 and 1440; `bento-grid.test.ts` pins both classes.
- `HandoverCard` now treats a non-array reply as empty (the demo's catch-all returns `{}`).

## 99. Recent Changes (October 2026) — A Staff tour for HR, and a Monday HR digest

Details: `docs/hr-platform.md`.

- **EasyUI's Product Tour, vendored** (`src/components/ui/easyui/product-tour.tsx`). First use: a
  one-time tour of Staff for whoever holds `hr.manage`, replayable from the For HR card. Targets are
  `data-tour` attributes on the roster. ⚠️ An empty `steps` must return before the step effect runs
  too, not only from the render (it read `steps[0].target` and threw).
- **Weekly HR digest** (`src/server/hr/digest.ts`): Monday 08:00+ UK, in-app (`hr.weekly_digest`)
  and email, to people granted `hr.manage`. Quiet weeks send nothing. Run from the `jobs` worker, so
  it needs no crontab line. `Workspace.hrDigestWeek` (additive) is the once-a-week claim.
  ⚠️ A Super Admin resolves to every permission, so they're a recipient only with an explicit
  `hr.manage` grant. A test caught this; the first cut sent Siân's digest to Dan too.
  ⚠️ Right-to-work dates (encrypted tier) are counted, never listed, because email leaves Foundry.

## 100. Recent Changes (October 2026) — One page per developer

Details: `docs/hr-platform.md`.

- A developer's **Staff page is their page**. Its new **Developer** card and **Notes** card carry
  everything the Code review page did (GitHub, stack, links, availability, Bench, rate, current
  clients, CV, edit, notes), built from one shared file, `src/components/codeclear/candidate-parts.tsx`,
  which the review page uses too. Placements gain their project and notes.
- `/app/codeclear/candidates/[id]` redirects anyone on the team to `/app/staff/[id]` and is now
  Hiring's page for **external** candidates only. ⚠️ Staff deliberately excludes `origin: EXTERNAL`,
  so do not redirect those. `candidate-profile-redirect.test.tsx` pins both directions.
- ⚠️ Deleting a team member now follows Staff's rules (archive unless there's nothing attached),
  not the review page's unconditional delete.
- `candidate-profile-form.tsx` and `HandoverCard` tolerate a missing list from their API instead of
  crashing (the demo's catch-all returns `{}`).

## 101. Recent Changes (October 2026) — A motion library, Lottie bats and a spider that drops

An audit of every animation in the app found the same thing hand-rolled over and over: 13 ring
spinners in five sizes and two styles, ~73 identical skeleton blocks, five pulsing status dots,
and four drawers sliding in four ways. They are now shared components in
**`src/components/ui/motion/`**, catalogued in **`docs/motion.md`** and live in
**Settings → Labs → Motion library** (a two-pane popup: pick a piece, see it move, copy the import).

- **The pieces:** `Spinner` (`<Button loading>` draws it), `LoadingState`, `Skeleton` and its
  presets, `StatusDot` (pulse or ping), `FadeIn` (moved from onboarding/brand.tsx, which
  re-exports it), the `motion-backdrop-in` / `motion-sheet-right` / `motion-sheet-up` classes for
  drawers, `useCountUp`, and `Lottie`.
- **About 60 files migrated** onto them, all behaviour-preserving. Left alone on purpose:
  - refresh buttons that spin while refetching;
  - pulsing text placeholders;
  - card-grid skeletons whose cards are fills, not outlines;
  - check-explorer's breakpoint-switched sheet;
  - the public scanner's tickers, because the embed is an external contract.
- **`Lottie`** is the only Lottie player.
  - It loads lottie-web's light build (MIT, `5.13.0`) and the JSON from `public/motion/` on first
    mount, so neither is in any bundle.
  - It pauses off-screen and in background tabs, and shows a still frame under reduced motion.
  - `color` recolours a file without editing it, and a bad file renders nothing.
  - ⚠️ The light build has no expression engine.
- **⚠️ Reduced motion:** `layout.tsx` stops all CSS motion globally. JS motion (framer-motion,
  rAF, Lottie) must check for itself, which every piece here does.
- **`Skeleton` honours a radius you pass.** `cn` doesn't merge Tailwind classes, and in the
  compiled CSS `rounded-[6px]` would otherwise beat a plain `rounded`.

**Halloween:**
- **The bats** are now Dan's "Bat - Halloween" Lottie (`public/motion/bat.json`), recoloured
  `#2B2550` with a violet rim glow, replacing the Fluent emoji.
- **The spider** (`halloween-spider.tsx`) peeks from the top-right corner, dips on hover, and drops
  on its thread when clicked. It bounces, sways, then climbs back after 5s.
  - It is a framer-motion spring, not the supplied Lottie's timeline, which only moved it 9 units
    in a 32-unit frame. The art is that file's sprite (`public/motion/spider.webp`).
  - It must not break: desktop only, and only where AppShell shows the header band (it hangs in
    the band's 32px right gutter). Only the sprite takes clicks; it sits below dialogs; hammering it
    just retargets the spring; unmount clears its timer.
  - `halloween-spider.test.tsx` pins this. Removing the timer cleanup, the click-through frame or
    the desktop-only class each fails it.
  - ⚠️ **The art is Spider-Man (Marvel).** It is internal-only and deliberately not mounted on the
    public `/demo` pages; a test asserts that. Swap the sprite before it ever goes anywhere public.

**Verification technique:** the preview pane runs the primary checkout's dev server, not a
worktree's. Start the worktree's own server via a temporary `launch.json` entry
(`npm --prefix <worktree> run dev -- -p <port>`) and drive it headlessly with playwright-core at
2× DPR. The pane downscales a 1440 viewport too far to judge a 30px sprite.

## 102. Recent Changes (October 2026) — Staff: a real org chart, leads' clients, and a steadier toolbar

Three defects Dan found on Staff → People, all live.

- **The org chart was a list.** It drew only from the manager field, and nobody has one set:
  Gitwork keeps no list of who manages whom, because the admins are the managers. So
  `org-chart.tsx` now places people by role (`orgTiers` in `src/lib/staff.ts`):
  - Leadership (Super Admins) → Admins → Staff / Developers / Guests / No login, joined down the
    middle.
  - A manager set on a profile wins. That person hangs under their manager as a branch, with
    border-drawn lines (`.org-tree` in globals.css).
  - More than four leaf reports stack in a column. Wider than the card, the chart scrolls in its
    own frame and opens centred.
  - Nobody has to fill anything in for it to make sense. An earlier cut asked HR to pick
    everyone's manager; Dan's call was that the admins are the managers.
- **You and Harry read "No clients".** A person's clients came only from Code placements, which
  is how *developers* are on a project. Leads are on one through the client's **product team**
  (`productTeamUserIds`). `src/server/staff-clients.ts` merges both, ACTIVE clients only. It is
  used by the roster cards and the profile. `ClientAssignment` is deliberately not read: it is an
  access grant.
- **The toolbar's actions landed wherever the row wrapped.** It is now two fixed rows: switches
  and actions on top, search and filters below, with every control 36px (`Segmented` gets
  `h-9`). On a phone the actions ride beside the layout switch; Department takes its own row and
  Type and Sort sit two-up.

The demo roster gained a fuller team under Tom so `/demo/staff` exercises the stacked column.

## 103. Recent Changes (October 2026) — Clients approve releases from their own Changelog

Luke at Big Wedge asked for an "Approve" button in Foundry. One existed, but it sat at the
foot of each release, under all the notes, and only on the team's page: the client's page was
read-only.

- **The pending status is the button.** A pending release's status chip is a split control:
  **● Pending | ✓ Approve**, the green half doing the one thing it's waiting for. Once
  approved it reads **✓ Approved**, with "Approved by <name> · <date>" under the title.
- **A callout leads the page** whenever anything is pending: "1 release is waiting for (your)
  approval". It names each version, links to its notes, and carries the button. It is built
  from every release, not the filtered list, so a filter can't hide one; a test pins that.
  The old bar at the foot of the card is gone.
- **Clients approve on their own page:** `POST /api/wiki/[token]/changelog/approve`, in
  `src/server/wiki-changelog-access.ts`.
  - Anyone the page itself lets in may approve: a signed-in client user or a Gitwork session.
  - A per-section link must be for the Changelog.
  - A client can approve, never un-approve. Ids outside the wiki and already-approved entries
    are ignored.
  - The approver's name comes from their session, never from the request.
- **Recorded:** `approvedAt` and `approvedByName` on `ClientChangelogEntry` (additive). They are
  set on approval, cleared on going back to pending, and named in the Slack ping ("…approved for
  iOS by Luke McFarland").
- ⚠️ **The internal changelog routes checked nothing.** `PATCH`/`DELETE …/changelog/[id]` acted
  on any id, unauthenticated beyond the middleware session, so any member could approve or
  delete any client's release. Create used the default workspace. All three now require
  Developer+ with access to that client, and scope every entry to the client in the URL (404
  otherwise). Developer, not `canManageClients`, because developers write release notes.

## 104. Recent Changes (October 2026) — Every client's monitors on the Gitwork wiki

The Gitwork client (`gitwork`, `src/lib/agency-client.ts`) is us, and its wiki's Monitors section
now opens with an **all-clients board** (`monitor-board.tsx`) above Gitwork's own monitors: a
headline (`All systems operational` / `1 service down — Fellas Loaded` / degraded / not being
checked), Gitwork's services first, then any client with trouble worst-first, then the rest, and a
"Not monitored" list of active clients with no monitors. Each client links to its own Monitors section.

- **Rules are pure** (`src/lib/monitor-board.ts`): a stale monitor is never shown as its last
  result, and "operational" needs every monitor checked and answering.
- **Fast:** `loadMonitorBoard` is two queries for any number of monitors (the monitors, and one
  `groupBy` for 24h uptime). The page re-reads it every minute.
- **Internal only.** `GET /api/clients/[slug]/wiki/monitors/board` answers for `gitwork` and
  404s for every other slug. It needs a signed-in person, and a restricted user sees only
  clients they can already open. It is not in the wiki DTO, so no share link can show it.
- **Motion** (`docs/motion.md`): only a DOWN service pings (headline + its card); the client
  heading's dot stays still. Skeleton while loading, a pulse on the Live label while refreshing.
- **Slack:** alerts keep GitHub Status's layout; the button is now **View all monitors**, opening
  this board. The linked title still goes to the client's own monitors.

## 105. Recent Changes (October 2026) — Live figures stay live: Metrics and the monitor board

- **The running month refreshes itself.** `refreshRunningMonths` runs from the every-minute
  `jobs` worker. It reads stored capture times, and only calls a client's API when that client's
  running month is over `MONTH_TO_DATE_STALE_MS` (15 min) old. A failed fetch waits
  `RUNNING_MONTH_RETRY_MS` (15 min) before retrying. Before this, "October so far" refreshed only
  when someone at Gitwork opened the page, so it trailed Big Wedge's own admin (131 vs 134
  subscriptions).
- **Refresh now always re-reads the running month** (`force`). Before, it skipped one under an
  hour old, so the button could do nothing.
- **Last refreshed is the newest real fetch** of anything on the page, not the headline month's.
- **Big Wedge's total estimated revenue** stays on the running month as an as-of-now total. Their
  `cash_revenue` doesn't follow the date range, so it isn't this month's takings.
- **Settings' "What the client sees" is an accordion**, folded by default.
- **The monitor board** shows "Last check" (the newest actual probe) and a Refresh now button.
- **Retired metrics** (`AnalyticsAdapter.retiredKeys`): keys an adapter stopped reporting
  because they were wrong for a month are left out on read, so months stored before the change
  don't still show or star them. Big Wedge retires `users_total` and `users_returning`, which
  are all-time counts.
- **A finished month keeps its month-end figures** (`AnalyticsAdapter.carryAtMonthEnd`,
  `carryMonthEndFigures`). Big Wedge's subscription counts, MRR and revenue total are as of now
  for any range, so the read that finalises a month can't give them. They're carried from that
  month's last capture taken during the month (every 15 minutes, so within 15 minutes of month end).
  Nothing is carried from a capture taken outside the month.
- **Outages are confirmed in seconds.** A first failure is re-checked after `CONFIRM_AFTER_MS`
  (20s) in the same run instead of on the next one, so "down" lands about 20s after it's spotted.
  "Check now" and a just-added monitor skip the wait.
- **Foundry is watched from outside.** `.github/workflows/foundry-watchdog.yml` checks
  `/api/health` from GitHub's runners every 5 minutes, because Foundry's own monitors run on the
  box they'd be reporting. Down → the run fails, and GitHub emails whoever last edited the
  schedule. If the `SLACK_OPS_WEBHOOK_URL` secret is set, it also posts once per outage, plus once
  on recovery.
- **Wedge shows everything its report carries that's meaningful** (checked against the live API
  on 30 Oct 2026). Added: daily active users, daily/monthly active (stickiness), average handicap,
  revenue per subscriber per month, revenue per subscription, premium share, churn, and feedback
  in the last 7 and 30 days (a separate `/feedback/stats/` read). Fields marked `now` on `FIELDS`
  are today's state for any range: shown on the running month, dropped from a finished month's
  own read, and carried from its last capture instead (`NOW_KEYS` ⊂ `carryAtMonthEnd`). Left out
  on purpose: `top_active_users` (usernames), `average_scores` (meaning not documented), the
  growth percentages (trends are worked out from the months).
- **Lists** (`MetricCard.list`): a ranked list rather than a figure — Big Wedge's most played
  courses (keyed by rank, since the courses change month to month) and game-mode share (keyed by
  name). A list renders as rows with no trend, is hidden as one (`listHideKey` → `list:<id>`), is
  one row in Settings, and can never be featured or take a headline slot.
- **The three Big Wedge reads run at once.** The report alone takes ~4s at Big Wedge; the month,
  the day before and feedback were read one after another.

## 106. Recent Changes (October 2026) — Monitors: expiry, heartbeats, maintenance

From a competitor review (UptimeRobot, Better Stack, Healthchecks, Cronitor) and a search of Slack,
where most outages were reported by the client first.

- **SSL + domain expiry** (`src/server/wiki-monitor-expiry.ts`, rules in `src/lib/monitor-expiry.ts`).
  The `jobs` worker reads a few monitors per tick: each HTTPS certificate twice a day
  (`readCertificate`, Pulse's helper), each registrable domain once a day over **RDAP**
  (`rdap.org`). Warnings at SSL 30/14/3 days and domain 30/7 days, plus "expired", each **once
  per tier** (`sslAlertedTier` / `domainAlertedTier`), cleared on renewal. A failed read keeps
  the last tier: "could not look" is not "renewed". Monitors sharing a domain share one lookup
  and one alert. Hosts on a platform suffix (`*.vercel.app`) have no domain to renew.
  ⚠️ **One alert per certificate, not per monitor:** monitors on the same host share one TLS read,
  one stored tier and one post (two Foundry monitors on one host posted twice, 30 Oct 2026).
  **Auto-renewing issuers** (Let's Encrypt, Google Trust Services, ZeroSSL, Amazon, Cloudflare)
  skip the 30-day warning: they renew themselves around then, so it is noise. They warn from 14
  days, when renewal has evidently failed (`sslTier`).
- **Heartbeat monitors** (`HEARTBEAT` type, `wiki-monitors/heartbeat.ts`). Foundry gives the
  monitor a ping URL, `/api/public/heartbeat/<token>` (`/fail` reports a failed run). Down when
  no ping arrives within the interval plus grace (default a fifth of the interval, 5–60 min),
  or at once on `/fail`. Checked the minute the deadline passes (`heartbeatCheckDue`). A ping
  runs a check immediately, so a recovery is announced straight away. ⚠️ The ping URL is the
  credential: `forPublic` strips it (and the target) from the client's copy.
- **Maintenance windows** (`maintenanceUntil` / `maintenanceNote`). Alerts are paused, checks
  keep running, and the board says "Maintenance". The alert state is frozen and the fail streak
  restarts when the window ends. Set from the card's "Maintenance…" picker (1 h / 4 h / 24 h).
- **Cards** show one mono line: SSL days, domain days, maintenance, last ping. Amber inside the
  warning window, red near or past expiry.

Not built yet (in the competitor report's top ten): request headers/auth, a second probe
location, incident records with acknowledge, email/webhook channels, client incident updates,
long-term SLA history, escalation.

## 107. Recent Changes (October 2026) — Monitors: request headers, a second location, incidents

- **Headers, sign-in and a body for HTTP checks** (`src/lib/monitor-request.ts`). "Name: value"
  per line, or the username/password helper (writes `Authorization: Basic …`). Stored encrypted
  (`requestHeaders` / `requestBody`, `storeSecret`); the browser only ever gets header NAMES, and
  the client's copy gets none. Host, lengths and connection headers are refused. ⚠️ With headers
  or a body set, redirects to another origin are refused (`sameOriginRedirectsOnly`), or a 302
  would hand the token to another host.
- **A second check location** (`src/server/wiki-monitors/remote.ts`, route `/api/monitor-probe`).
  When a check fails from the VPS, the same check runs from this app's Vercel deployment (another
  network and region). Rules in `combineLocations`: both failed → DOWN, confirmed; only the VPS
  failed → DEGRADED with the reason (no page, counts as up), never UP; second location
  unavailable → the VPS result stands. Configured by `MONITOR_REMOTE_PROBE_URL` +
  `MONITOR_PROBE_SECRET` on the VPS (synced by `deploy.yml`) and `MONITOR_PROBE_SECRET` on Vercel.
  Unset → checks behave exactly as before. The route 404s without the secret and reads no database.
- **Incidents** (`WikiMonitorIncident` + `…Update`, additive; rules in `src/lib/monitor-incidents.ts`).
  One per outage: opened when the down/unstable alert fires (unstable escalating to down updates the
  same one), resolved by the recovery alert. **Acknowledge** and **Post update** (status + message,
  "Show to the client" on by default) on the client's Monitors page and on the Gitwork all-clients
  board (`POST /api/clients/[slug]/wiki/monitors/incidents/[incidentId]`, signed-in, client access
  checked). Posting also acknowledges.
- **The client sees incidents on their status board**: public updates only, no names from our side
  ("Gitwork is on it" once acknowledged). `publicIncident` in `forPublic`.
- **One post per client, not per service** (`shouldPostAlert`, `GROUP_ALERTS_WITHIN_MS` = 10 min).
  A second service going down within 10 minutes of another on the same client is folded into the
  first post, whose list already shows every service. "Back" is posted once, when nothing on the
  client is still out. Incidents are still recorded per monitor. ⚠️ So a partial recovery (one
  service back while another is still down) is silent until the whole client is back.
- Not built: an Acknowledge button inside the Slack alert, emailing client users on updates.
