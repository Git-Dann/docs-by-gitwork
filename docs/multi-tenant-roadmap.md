# Foundry for other businesses: the multi-tenant roadmap

## Progress

| Step | State |
|---|---|
| Baseline check (`npm run test:baseline`) | Done, CLAUDE.md §86.1 |
| Phase 0.1 Workspace module switch | Done, §86.2 |
| Phase 0.2 Workspace AI keys win | Done, §86.3 |
| Phase 0.3 Secrets encrypted at rest | Done for new writes; backfill of existing values awaits a decision, §86.4 |
| Phase 0.4 Platform admin + console (businesses, modules, AI keys, activity) | Done, §86.5 |
| Phase 1 Staff (web): People roster, Staff/Hiring split, schema, record linking | Done, CLAUDE.md §87 |
| Phase 1 Staff (iOS) | Draft PR [Git-Dann/foundry-ios#1](https://github.com/Git-Dann/foundry-ios/pull/1): tabs follow workspace modules. Unbuilt, needs a Mac build |
| Staff and Platform polish (paging, popup, validation, seed accounts hidden) | Done, §86.6 and §87 |
| Phase 2.1 Workspace carried in every token; shadow comparison | Live 29 Oct 2026 (#743), CLAUDE.md §88. Read the counts at `/api/platform/workspace-shadow` |
| Phase 2.2a Run first-boot setup at server start-up | Next. Needed before 2.2b, see below |
| Phase 2.2b Replace single-workspace lookups, file by file | Not started. A ratchet test stops the count growing |

## Context

Dan wants to offer Foundry to other small businesses as a project planner/tracker. Each business would:
- connect its own services (Slack, Google, AI keys, later ClickUp, Asana and OneDrive);
- have its own logo and branding;
- get a slimmer product: no Pulse and no Labs, but with MCP and Staff.

At the same time, **Code becomes Staff**: a tracker for every member of staff, with the developer vetting moved out of it.

Dan's decisions:
- **One shared copy for everyone** (true multi-tenant SaaS).
- **Staff replaces Code for everyone**, and dev vetting becomes a Gitwork-only add-on.
- **Sign-in:** Google with the customer's own domain, plus email and password.

### What exploration found

Foundry is single-tenant all the way through.

**Data**
- The schema is already mostly tenant-shaped:
  - 67 of 167 models carry `workspaceId`;
  - `WorkspaceMember` is `@@unique([workspaceId, userId])`, so a user can already belong to several workspaces.

**Workspace resolution**
- Every request resolves the same workspace:
  - `ensureBaseRecords()` (`src/server/bootstrap.ts`) is called in 191 files;
  - `DEFAULT_WORKSPACE_SLUG = "gitwork"` (`src/server/proposals.ts:29`) is used in about 63 filters;
  - `requireAuthedUser` in `src/server/auth/effective-user.ts` hard-filters on that slug.

**Sign-in**
- Sign-in is limited to `@gitwork.co.uk` in three places:
  - `src/auth.ts:126`;
  - `api/auth/mobile-callback`;
  - `api/auth/desktop/start`.
- `KNOWN_SUPER_ADMIN_EMAILS` is in `src/server/permissions.ts:37`.

**API access**
- There is one global `API_KEY`, and the middleware puts it in every browser's cookie.
- 113 API routes trust any session without resolving a user (§57.6). In a shared copy, that is a cross-tenant hole.

**Modules**
- There is no workspace-level control of which modules a workspace gets. Module access is per user only (`hasModuleAccess`, `PERMISSION_CATALOG`).

**Integrations**
- Already per workspace: Slack (pasted token), email, Turnstile, Anthropic and Care Gmail.
- OpenAI and Gemini let the **env var override the workspace key** (`src/server/ai-provider.ts`).
- Env only: GitHub and the Google OAuth client.
- Stored in plain text: several secrets, including AI keys, `emailApiKey`, `externalApiKey` and service-account JSON.

**Branding**
- `Workspace.branding` exists, but it only affects document covers.
- Everything else is hardcoded Gitwork/Foundry: app chrome, the colours in `globals.css`, public pages and emails (`src/server/email-templates.ts`, `src/lib/gitwork.ts`).

**Code module**
- Already half a staff roster.
- `Candidate` links to people **only by email match**. There is no foreign key, and about 7 places depend on that match.
- `githubHandle` is required and is part of the unique key.

---

## Recommended approach: eight phases, each shippable on its own

### Phase 0: Guardrails (no visible change for Gitwork)
1. **Workspace module switch.**
   - Add `Workspace.enabledModules String[]` (additive), with Gitwork = all.
   - Check it in `hasModuleAccess` (`src/server/auth/module-gate.ts`) **before** the role bypass, so even an admin can't open a module the workspace doesn't have.
   - Hide matching sidebar items in `app-shell.tsx`.
   - Gate the API routes for each module the same way.
2. **The workspace's own key wins.**
   - Flip the OpenAI and Gemini precedence in `ai-provider.ts`.
   - Route the direct `process.env.*_API_KEY` callers through `resolveAiConfig`: embeddings, document-ai, fix-agent and others.
   - Env keys become an explicit "platform key allowed" flag, which only Gitwork has.
3. **Encrypt plaintext secrets** using the existing `src/lib/encryption.ts`, with read-both compatibility, as the Slack token already does.
4. **Platform admin, separate from workspace admin.**
   - Add `User.isPlatformAdmin`, replacing `KNOWN_SUPER_ADMIN_EMAILS`.
   - `SUPER_ADMIN` stays a role *inside* a workspace.

### Phase 1: Staff (replaces Code; useful to Gitwork straight away)
- Add `Candidate.memberId` → `WorkspaceMember`, as a nullable foreign key.
  - Backfill it from today's email match.
  - Then move the ~7 email-match sites to the foreign key: `auth.ts` avatar, `codeclear-archived.ts`, `client-assignments.ts`, `backstage.ts`, `wiki-intake-mentions.ts`, `team-roster.ts` and `team.ts`.
- Make `githubHandle` optional. The Postgres unique key still holds for non-null values.
- Add general fields:
  - job title;
  - department;
  - employment type (employee, contractor, freelancer);
  - start date;
  - manager;
  - skills (renamed from `techStacks`).
- New module `/app/staff`:
  - **People** (everyone): the roster, profile, placements, notes and CV.
  - **Availability**: Backstage leave plus allocation from placements.
  - **Archived**.
- Rate and cost stay behind the existing `code.viewRates` and `clients.viewFinancials`.
- Move the Backstage team directory and the Settings → Team roster into Staff, with one place per fact. Settings keeps access and roles only.
- Dev vetting becomes a separate default-off module, **"Hiring"**:
  - the existing `/app/codeclear/*` pipeline, DevSignal, GitHub analysis and scores, and `/vet/*`;
  - Gitwork only.
- `/app/code` redirects to `/app/staff`.
- Keep `MODULE_PATHS` honest: rename the devsignal entry **in place** (§11).

### Phase 2: Find the right workspace for every request (the big one)

> **Found while starting 2.2 (29 Oct 2026):** `ensureBaseRecords()` is not just a lookup. Its first
> call in each server process also runs first-boot setup: schema statements (the pgvector column
> and index among them), seed data, contract templates and the first-admin bootstrap. So removing a
> call from a route can, on a fresh container, skip setup another route quietly relied on. Step
> 2.2a moves that setup to server start-up (`src/instrumentation-node.ts` already runs once there)
> and keeps `ensureBaseRecords()` as a cheap, already-done lookup. Only then can 2.2b replace call
> sites with `user.workspaceId`, which today gives the same answer and later switches in one place.
Every request has to land in the right workspace before any customer can be given access.

- **The active workspace lives in the session.**
  - Store `token.workspaceId`, chosen at sign-in.
  - Changing workspace is done with a switcher in the profile menu.
  - URLs stay unchanged, so there is no subdomain routing for now.
  - Custom domains (`customHostname`) can come later.
- **One way to find it.**
  - New `getRequestWorkspace()` and a reworked `requireAuthedUser`, both returning the active membership's workspace.
  - Replace `ensureBaseRecords()` and `DEFAULT_WORKSPACE_SLUG` call sites file by file.
  - `ensureBaseRecords` survives only as first-boot setup.
- **A sweep test** (like `roster-active-member.test.ts`) that fails on any new `DEFAULT_WORKSPACE_SLUG` or `ensureBaseRecords().workspace` outside an allow-list.
- **API keys are per workspace.**
  - Store keys hashed in `WorkspaceApiKey`; the caller is bound to that workspace.
  - Stop putting `API_KEY` in browser cookies.
  - MCP tokens are bound to a workspace.
  - The 113 session-trusting routes resolve a user and a workspace (§57.6 item 2).
- **Public token routes** (docs, wiki, sign, onboarding, timeline) already resolve their workspace from the token. Audit them for any default-slug fallback.
- **Crons and jobs loop over workspaces**, not the default one: Foreman, Curator, digests, monitors, Care sync and the Wedge feed. Gitwork-only crons (the Wedge feed) are gated to Gitwork.
- **Isolation tests**: seed two workspaces and assert that every list, get and write route refuses the other workspace's ids.
- **Audit the ~100 models without `workspaceId`.** Each must be reached only through a parent that has one, or be explicitly global.

### Phase 3: Sign-up, sign-in and invites
- **Signup** (`/signup`): creates the business and its workspace, with the owner as `SUPER_ADMIN` of that workspace. New workspaces get the default module bundle (Phase 0).
- **Allowed domains** (`Workspace.allowedEmailDomains`) replace the hardcoded `@gitwork.co.uk` in all three sign-in paths. Share one `provisionOrRefuse(email, workspace)` across them (§57.6 item 4).
- **Generic email domains** (gmail.com and similar) can never be an allowed domain. People on those addresses join by invite only.
- **Email and password for full members**, extending `password-login.ts`, with reset through the existing forgot-password page.
- **Invites** reuse the existing invite acceptance.

### Phase 4: Branding per workspace
Extend `Workspace.branding`:

| Setting | Where it shows |
|---|---|
| Logo (light and dark) | App chrome |
| Product name | App chrome |
| Favicon | Browser tab |
| Accent colour | App chrome |
| Email sender identity and footer | Emails |
| Company details | Documents and emails |

- **Accent colour.** It sets `--brand-*` CSS variables at runtime and is clamped for contrast in both themes. White-on-accent must reach AA, or the text switches to dark.
- **Shared rule.** `src/lib/gitwork.ts`'s `GITWORK` constant becomes the *Gitwork workspace's* default. A new `workspaceIdentity(ws)` feeds:
  - `app-shell.tsx`;
  - `layout.tsx` titles;
  - `email-templates.ts`;
  - public pages (`/docs/[token]`, sign, onboarding, `/portal/login`).
- **"Powered by Foundry"** is one small, optional footer line.

### Phase 5: Customers connect their own services
- A workspace-scoped `IntegrationConnection` (provider, authMode, health, encrypted tokens), modelled on Care's `AccountConnection`.
- A Settings → Integrations page with one card per provider, showing connection health.
- **Slack:** a distributed Slack app with an OAuth install, one install per workspace, replacing the pasted bot token. It keeps `getSlackBotToken(ws)` as the only reader.
- **Google:** one published Foundry Google OAuth app.
  - ⚠️ Gmail and Drive are *restricted* scopes. Offering them to outside businesses needs Google verification plus a yearly CASA security assessment.
  - Start customers on Calendar plus sign-in, which are sensitive rather than restricted. Add Gmail and Drive once verified.
- **AI:** bring-your-own Anthropic, OpenAI or Gemini key. AI features are off until a key is added; no Gitwork key is used.
- **Email:** their Resend or SMTP, falling back to a Foundry sender with their name.
- **GitHub:** only needed by Pulse and Hiring, which customers won't have. Skip it for now.

### Phase 6: New connectors (after the core works)
- **ClickUp and Asana:** import first (tasks, lists, milestones). The task importer and the `clickupId` dedup columns already exist. Two-way sync only if customers ask for it.
- **OneDrive and Microsoft:** a Graph OAuth connection for files. Microsoft sign-in would come later.

### Phase 7: Running it as a product
- **Plans and billing:** Stripe, with a `Plan` that supports both per-seat and flat pricing and sets `enabledModules`.
- **Platform console:** plans, usage and announcements are added (see Platform console above). It starts in Phase 0.
- **Data and legal:**
  - per-workspace export and delete;
  - a DPA and terms (Gitwork becomes a data processor);
  - backups that already cover the shared database.
- **Rate limits per workspace.**
- **Demo and onboarding:** a starter workspace with sample projects.

### Default module bundle for a new business

| Included | Excluded |
|---|---|
| HQ | Pulse |
| Portal (clients and projects) | Provenance |
| Tasks and Gantt | Labs, Studio and Study |
| Docs | Hiring/DevSignal |
| Staff | Starters |
| Backstage (leave and expenses) | Analytics |
| Handbook | Gitwork-only wiki sections, such as course requests |
| MCP | |
| Settings | |

Care is left out until it's fixed. Handbook goes in once its Gitwork-specific content is rewritten (Phase 4). The bundle is just a list in one place, so it is easy to change.

---

## Platform console: Gitwork's admin for every business
A new sidebar item, **Platform**, at `/app/platform`. Only platform admins (Dan and Harry, via `User.isPlatformAdmin`) can see it. Every other user, including a customer's Super Admin, sees nothing. Its own API sits under `/api/platform/*`.

**What it does**

| Area | What it does | Built in |
|---|---|---|
| Businesses | List every workspace (name, owner, members, plan, created, last active). Create one for a customer by hand, and suspend or reactivate it. | Phase 0 (list), Phase 3 (create/suspend) |
| Modules & overrides | Per-workspace module switches over the plan's defaults, plus feature switches for rolling out to Canary first, then chosen businesses, then everyone. | Phase 0 |
| Plans & seats | Assign a plan, override a price or seat limit, set a trial end. | Phase 7 |
| Branding | View or correct a business's logo, name and colour. | Phase 4 |
| Integrations health | Which services each business has connected, and which are failing. | Phase 5 |
| Usage | Seats used, AI spend on their own keys, storage, and errors per workspace. | Phase 5–7 |
| Support access | "View as" a business to help them. Off by default, read-only unless switched to edit, with a red banner the whole time, time-limited, and audited. | Phase 2 |
| Audit log | Every platform action: who did it, to which business, and when. | Phase 0 |
| Announcements | A notice shown in every workspace, or a chosen set (maintenance, new features). | Phase 7 |

**Rules**
- **It reads across workspaces on purpose.** So it is the one place allowed past the Phase 2 workspace scoping. It does that through a separate `platformDb` helper, so the exception is explicit and the sweep test can find it.
- **Every write is audited**, and nothing is ever hard-deleted from here. Suspend is reversible, and deleting a business is a separate, confirmed, delayed job.
- **Gitwork is one of the businesses in the list**, managed the same way. It is the reference workspace that all modules switch on in.

## Rule one: nothing that works today breaks
Gitwork is tenant #1. For every phase, Gitwork must see **zero change** unless the change is deliberate (Staff). How that's enforced:

1. **Schema is additive only.** No drops or renames. Every `prisma/schema.prisma` diff is checked for drops before merge (§2). A `pg_dump` is taken on the VPS before any deploy that touches the schema.
2. **Everything new sits behind a switch.**
   - The new path is built beside the old one.
   - The old path stays the default until the new one is proven.
   - Switches live on the workspace (`enabledModules` and the like) or are env flags, so turning one off is one setting, not a revert.
3. **Phase 2 runs in shadow mode first.** `getRequestWorkspace()` runs alongside the old `DEFAULT_WORKSPACE_SLUG` lookup and logs any mismatch, while still serving the old answer. It only becomes the real answer after a week of zero mismatches on production.
4. **A baseline test suite, written BEFORE any change** (`npm run test:baseline`), against the `/demo` routes and the API:
   - Playwright journeys for each live module: HQ, Portal, tasks, Docs, Care, Pulse scan view, wiki and share links, Backstage, Settings → Team, and MCP `whoami` / `list_clients` / `create_task`.
   - API response-shape tests for the DTOs both the web and iOS app read.
   - `audit:clipping` at 390, 768 and 1440 px.

   It must pass on today's `main` first, then on every PR.
5. **Three passes before production.**
   - (a) `npm run verify` + `npx next build` + the baseline suite locally.
   - (b) The same in CI on the PR.
   - (c) After deploy, a scripted smoke run against production with the Gitwork workspace: sign-in, the key pages loading, an MCP call, and the iOS sign-in exchange.

   That smoke run is the §50.3 check, scripted rather than remembered.
6. **A second, hidden test workspace on production** ("Canary Ltd"), owned by Dan. Each phase is tried there first, then switched on for anyone else.
7. **Small PRs, one phase step each**, so any regression points at one change. Each PR states what it changes for Gitwork, which is "nothing" unless deliberate.
8. **Rollback per phase is written down before the phase starts**: which switch to turn off, and whether a data backfill needs reversing.

## iOS app
The iOS app isn't in this repository. Its source repo needs adding to the session (I'll check `list_repos` / `add_repo`) before any iOS work.

What has to change there, phase by phase:
- **Phase 0–1.**
  - The app reads module availability from a new `GET /api/me/workspace` (enabled modules, branding, role) and hides tabs the workspace doesn't have.
  - The Staff screens replace any Code/dev screens.
  - Leave and expenses stay where they are.
- **Phase 2.**
  - The mobile JWT carries `workspaceId`.
  - `mobile-callback` picks the workspace, and a user in several workspaces chooses one at sign-in.
  - A switcher goes in the app's account screen.
  - Every iOS-facing endpoint gets the same isolation tests as the web.
- **Phase 3.**
  - Email-and-password sign-in on iOS, alongside Google.
  - The Google ID-token audience allow-list (§54) stays an allow-list of **our** client IDs. Customers use Foundry's iOS app, not their own.
- **Phase 4.**
  - The app shows the workspace's logo, name and accent colour from `/api/me/workspace`.
  - The App Store icon stays Foundry's, since one app serves every business.
- **Phase 5.** Push notifications (`DeviceToken`, APNs) are scoped per workspace, so nobody is notified about another business.
- **Compatibility rule.** The server must keep accepting the **current** app version's requests and tokens until the new app version is live. Old tokens without `workspaceId` default to Gitwork. Response shapes only ever **add** fields. The baseline suite includes the iOS DTOs for exactly this reason.

## My pushback and suggested order
- **Do Phase 0 and Phase 1 first.** They're useful to Gitwork now, low risk, and prove the module switch.
- **Phase 2 is a hard gate.** No customer gets access until the isolation tests pass. A data leak between businesses ends the product.
- **Not ClickUp/Asana yet.** They're months of maintenance for a feature nobody has paid for. Ship import-only, and only when a real customer asks.
- **Restricted Google scopes cost real money and time** (verification plus CASA, yearly). Launch without them.
- **Rough scale, for one person working with Claude:**
  - Phases 0–1: about 2 weeks;
  - Phase 2: about 4–6 weeks;
  - Phases 3–5: about 4 weeks;
  - Phase 7: ongoing.
- **CLAUDE.md, ONBOARDING.md and the rules assume one business throughout.** Each phase updates them in the same PR.

## Decisions recorded (Dan, 28 Oct 2026)
- **Product name is Foundry.** Customers brand their own workspace (logo, colour, company details), but the product stays "Foundry". The default bundle's footer line is "Powered by Foundry".
- **Handbook goes into the bundle, rewritten.** Gitwork-specific content is generalised or removed for other workspaces. Each workspace gets its own handbook, starting from a neutral starter set. Gitwork's existing handbook stays in the Gitwork workspace untouched.
- **Care stays out for now.** It needs fixing first (§11, the two-UI problem). The module switch means adding it later is one setting.
- **Pricing is undecided, so billing is built to support both per-seat and flat plans.** A plan record holds the price model, the seat limit (nullable) and its modules. Nothing is hardcoded to either model.
- **The order is my recommendation, phase by phase.** Each phase starts only after the previous one has passed the three test passes and run cleanly on production.

## Verification (per phase)
- **First PR of all: the baseline suite** (see Rule one). It passes on untouched `main` before anything else is built.
- `npm run verify` and `npx next build` on every PR. Each new sweep test must be proved to discriminate by breaking the thing it guards.
- **Phase 0:** a unit test that a disabled module is refused even for `SUPER_ADMIN`, plus a test that env AI keys don't override the workspace key.
- **Phase 1:**
  - backfill dry run against production data through the MCP, reporting counts of email matches and unmatched cards;
  - `/demo` Staff pages checked with `audit:clipping` at 390, 768 and 1440 px;
  - Portal dev counts and costs unchanged before and after.
- **Phase 2:**
  - two-workspace isolation suite across every route;
  - the cron loop tested with two workspaces;
  - a staging-like run on a copy of the database before switching production.
- **Phase 3:** sign in as a non-Gitwork Google domain and as an email-and-password member, and confirm each lands in their own workspace only.
- **Phase 4:** contrast check of the generated accent colour in both themes, plus screenshots of app chrome, an email and `/docs/[token]` per brand.
- **Phase 5:** connect a real test Slack workspace and a Google account in a second workspace, and confirm Gitwork's are untouched.
