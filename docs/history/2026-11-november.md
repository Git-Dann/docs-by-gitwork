# November 2026

Foundry by Gitwork — what changed, and what it cost to learn. Split out of `CLAUDE.md`
so the rules stay small enough to read. The section numbers are unchanged, because the code
cites them: 939 `§N` references across 496 files, 277 of them spelled `CLAUDE.md §N`.
`CLAUDE.md` indexes every section here.

---

## 108. Recent Changes (November 2026) — Monitors is its own page

The all-clients monitor board (§104) is now a sidebar product, **Monitors** at `/app/monitors`,
between Care and Backstage. Monitors are still created and run in each client's wiki, as before;
this page only reads them.

- **Permission `monitors`** (module, `PERMISSION_CATALOG`). STAFF and ADMIN get it by default
  (`reconcileNewPermissions` adds it to saved matrices on boot). DEVELOPER does not: grant it per
  person in Settings → Team (first: Waqar). `canViewMonitors` / `usePermissions().canViewMonitors`.
- **Shows every client's status, not just assigned clients** — watching every service is what the
  permission is for. A "Manage" link to a client's wiki, and incident Acknowledge / Post update,
  appear only for clients the person can already open (`openableClientIds`: null = all, from
  `seeAllClients`; their assigned clients otherwise; none without Portal). Opening a client still
  goes through Portal's own checks.
- **Internal only.** `/app/monitors` is in `INTERNAL_ONLY_PREFIXES` and `GET /api/monitors`
  refuses external roles, so a guest granted the module still can't see the client list.
- **Page** (`src/components/monitors/monitors-workspace.tsx`): status headline + four figures,
  open incidents, a searchable grid of client cards (All / Needs attention), and clients with no
  monitors. Reuses the wiki board's state rules and pieces (`monitor-board.tsx` exports them).
  Refreshes every minute.
- Tests: `src/app/api/monitors/__tests__`. Demo: `/demo/monitors` (§108.3).

### 108.1 Portal's Drive tab: no screenshots, and a steady height

- **Screenshots are left out of Added and Edited** (`isScreenshotName` in `src/lib/client-drive.ts`).
  That covers any file named "Screenshot", "Screen Shot" or "Screen Recording", and every folder
  so named along with everything inside it. Gitwork's "Screenshots Archive" was filling the whole
  list. Browse still shows them. Applies to the wiki's Drive tab too.
- **The card is the same height in every tab.** The line under the tabs always holds something
  (breadcrumbs in Browse, otherwise what the list is). The list reserves `pageSize` rows (`ROW_H`),
  and the pager is always laid out (hidden on a single page). The "some subfolders weren't
  searched" note moved into that line.

### 108.2 Monitors page: current clients only, coloured headers

- The board (and so "Not monitored") lists only clients Portal lists: `hidden: false` in
  `loadMonitorBoard`. Hidden demo/test clients (Acme Health, Northwind Labs, Testing Portal,
  syed-project) no longer appear.
- Every client card's header carries its state's tint, green when all is operational, with the
  label "Operational · 3/3". Label text uses the `-700` palette shades (`LABEL_TEXT`): the `-500`
  tokens are ~3:1 on their own `-50` tint.
- Every card header is a fixed `h-12`, so headers line up across the grid. Gitwork's "Our
  services" tag sits on the name's line (hidden below `sm`) rather than adding a second line.

### 108.3 Add monitor from the Monitors page, synced with the wiki

- **Add monitor** in the CLIENTS card header (and on each "Not monitored" client, opening on that
  client) opens the house fixed-height popup (`src/components/monitors/add-monitor-dialog.tsx`):
  a client dropdown (clients this person can open, Gitwork first), then the wiki's own fields.
- **One copy, so nothing to sync.** It saves through the client's wiki route
  (`POST /api/clients/[slug]/wiki/monitors`), so it IS that client's wiki monitor. Every monitor
  write (wiki or page) calls `invalidateMonitorViews` (`use-wiki.ts`), which refreshes the
  client's wiki, the Gitwork all-clients board and `["monitors-page"]` together.
- **The fields are shared:** state and request rules in `src/lib/monitor-form.ts`
  (`formToMonitorInput` checks the server's limits and says what to fix), drawn by
  `monitor-form-fields.tsx`. The wiki's add/edit uses the same two, so they can't drift. Inputs
  are 16px on a phone.
- The add route now checks the caller: guests are refused and a restricted developer can only add
  to clients they're assigned. Edit/delete/run routes are unchanged.
- ⚠️ **A `<Modal>` inside `<FadeIn>` is trapped.** FadeIn animates a transform, which makes it the
  containing block for `position: fixed`, so the dialog centred on the content column and ran off
  the bottom of the screen. Render dialogs outside it. Found by screenshot, not by any test.
- Demo: `/demo/monitors` (add works end to end in memory). Verified there at 1440 and 390.

### 108.4 Environments, and Edit from the Monitors page

Asked for by Shahab (Nov 2026): clients should only see production statuses, never staging.

- **`WikiMonitor.environment`** (additive, default `"production"`, so every existing monitor is
  production): production · staging · development · testing. Rules in
  `src/lib/monitor-environment.ts` (pure, tested).
- **The client only ever sees production.** `forPublic` drops every other monitor, and the
  incidents on them, before the wiki leaves on a token; the team's "Show what the client sees"
  preview and `clientVisibleSections` apply the same rule, so a wiki watching only staging offers
  the client no Monitors section. ⚠️ The check is exactly `"production"`: an unrecognised value
  stays internal.
- **Gitwork sees every environment, labelled** (a `STAGING` tag on the wiki cards, the all-clients
  board and the Monitors page). The Monitors page has an Environment filter when more than one is
  in use. Alerts name a non-production service ("API (Staging)"), the board headline says
  "Fellas Loaded (Staging)" when only staging is down, and alerts are grouped within one
  environment so a staging outage can't carry production's under its headline.
- **Edit on the Monitors page** (pencil on each monitor, for clients the person can open): the Add
  popup opened on one monitor, read in full from `GET /api/clients/[slug]/wiki/monitors` and saved
  through the wiki's own PATCH. A heartbeat's blank target is now "leave it" on PATCH.
- **Every monitor route checks the caller may work on the client** (`assertMonitorWriter`,
  `src/server/wiki-monitor-access.ts`): GET (it carries heartbeat ping URLs), POST, PATCH, DELETE
  and Check now. Only POST did before. A sweep test covers all five.
- **MCP:** `add_monitor` takes `environment` and now HEARTBEAT monitors (no target; it returns
  the ping URL), and `list_monitors` returns each environment. New, in
  `src/server/mcp/monitor-tools.ts` (a factory spread into TOOLS, like sheet tools):
  `summarise_monitors` (every client: headline, problems and why, open incidents, not monitored;
  filter by environment), `update_monitor` (incl. `setEnvironment`, pause, maintenance window),
  `check_monitor`, `delete_monitor`, `list_monitor_incidents`, `update_monitor_incident`
  (acknowledge or post an update). The every-client readers need the `monitors` permission, as
  the Monitors page does; writers need 'Manage clients'. Two monitors sharing a name are told
  apart with `environment`; ambiguity is an error.

## 109. Recent Changes (November 2026) — Seasonal themes are a workspace setting

The pumpkin in the header is gone. **Settings → Appearance** (Admins and Super Admins) has one
switch, "Show a seasonal theme", and while it's on, a dropdown of themes. It applies to everyone
in the workspace. Supersedes §90's date window and per-browser toggle.

- **Catalogue:** `SEASONAL_THEMES` in `src/lib/seasonal-themes.ts` (Halloween today). Adding
  Christmas = one entry there, plus its styles and a `data-*` attribute alongside `data-halloween`.
- **Stored on the workspace:** `seasonalThemeEnabled` (default false) + `seasonalTheme` (keeps
  the choice while off). Additive. `GET /api/settings/seasonal-theme` (any member),
  `PUT` (Admin+, only a shipped theme id).
- **Applied by the theme provider** on `/app` pages: it reads the setting, copies the active id
  (or `off`) into localStorage `foundry.seasonal.v1`, and the anti-flash script in `layout.tsx`
  paints from that on the next load. A failed read keeps what's stored. The demo has no session,
  so it shows whatever the same browser last saw on `/app`.
- No date default any more: it is off until an admin turns it on.

### 109.1 The Christmas theme

Pick **Christmas** in Settings → Appearance.
- **Keeps each person's light or dark mode** (unlike Halloween, which forces dark). Only the brand
  moves: Gitwork Blue → festive red (`[data-christmas]` in globals.css; white on `#B91C1C` is
  ~6.5:1 in light, dark text on `#F87171` in dark). A Fluent Emoji tree sits on the logo.
- **Snow that settles on cards** (`src/components/seasonal/christmas.tsx`, physics in
  `src/lib/seasonal/snow.ts`, pure and tested). It uses bounding-box collision: flakes fall over
  the page, and one that reaches the top edge of a `.widget-card` (or `[data-snow-surface]`) joins
  that card's pile. Piles are 4px columns, capped at 9px, thinner at the corners, and melt slowly.
  - Piles sit ABOVE a card's top edge, so snow never covers content.
  - A card counts only if its top edge is on screen and not covered (`elementFromPoint`,
    re-checked every 600ms). Positions are read every frame, so piles follow scrolling.
  - One fixed canvas at z-45 (above content, below dialogs), `pointer-events: none`, hidden in
    print. Nothing runs under reduced motion, and rAF stops in a background tab.
- `data-christmas` is set by the anti-flash script and the provider (`christmas` in `useTheme()`),
  the same way as `data-halloween`.

## 110. Recent Changes (November 2026) — MCP access re-checked on every call

Reviewed after a developer (Nasir) was given the MCP. Three fixes:

- **Taking someone's access away now cuts off their MCP.** `resolveEffectiveUserById`
  (`src/server/mcp/auth.ts`) only finds an ACTIVE membership, and `resolveMcpActor` also needs
  `mcp.connect`. It runs on every `/api/mcp` call and on every token refresh
  (`/api/oauth/token`). A refused refresh revokes the token, so the connection dies rather
  than retrying. Before this, both were only checked when someone first connected, so an
  archived member or a revoked permission kept working for as long as Claude kept refreshing.
- **`list_members`** returns current members only, with email only for Admins.
- **Documents are limited to the caller's clients** (`src/server/mcp/document-scope.ts`):
  their assigned clients plus client-less documents they own, or everything with
  `seeAllClients`. `list_documents` and `update_document` both use it; out-of-scope ids read
  "Document not found". ⚠️ The web Docs list is NOT scoped this way yet: a developer still
  sees every client's lightweight documents there.

## 111. Recent Changes (November 2026) — Pulse → AI search (stage 1: Google positions + AI visits)

A page at **`/app/pulse/ai-search`** (Pulse nav → AI search, internal-only like Growth) showing how
Gitwork shows up for buyers: how many Google searches we appear in, how many sit in the top 10 and
top 3, and visits from AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot…), each against
the previous period of the same length. For Gitwork's own sales, not a client feature.

- **Credentials: the workspace Google service account** (Settings → Integrations), not anyone's
  sign-in. Adding these scopes to sign-in would make every teammate sign in again. The service
  account is added once as a read-only user on the Search Console property (Restricted) and the
  GA4 property (Viewer); the page shows its email with Copy. Properties are set in `05 // SETUP`
  (admins; `PUT /api/pulse/ai-search/config`), stored on `Workspace.aiSearchConfig` (additive).
- **The last sync is stored** in `AiSearchSync` (one row per workspace × range, additive). The page
  serves it while it is under 30 minutes old and re-reads Google otherwise; **Sync now** forces a
  read. Concurrent syncs of one range share one run. No cron: the page syncs itself when opened.
- **Truth rules** (`src/server/ai-search.ts`, pure parts in `src/lib/ai-search.ts`), each tested by
  breaking it:
  - The Google period ends on the day before Search Console's own `firstIncompleteDate`, and every
    figure is read with `dataState: "final"`. Never "today minus a guess".
  - GA4 has no completeness signal, so its period ends 2 days back (Google documents up to 48h).
  - **A failed sync keeps the last good figures** (`mergeSync`), shown greyed with "couldn't be
    synced … these are the last good figures, synced <time>". It never becomes a zero, and a
    working source is never held back by a failing one. Figures over 24h old are flagged.
  - Every card states "Data to <day> · synced <time>" and the page header the last sync.
  - **What Google withholds is stated:** the share of impressions from searches Google won't list
    (its totals vs the listed rows), GA4 thresholding (`subjectToThresholding` — Google Signals is
    on), the `(other)` row, and row caps. AI visits note that some AI clicks arrive as direct.
  - Changing the properties deletes the stored syncs, so old figures can't pass as the new one's.
- **Top 10 / top 3 use Google's average position per search**, inclusive (≤10, ≤3).
- **AI sources match by host, never substring** (`classifyAiSource`): `notchatgpt.com` and
  `openai.com` don't count. The GA4 regex only narrows the report; the classifier decides.
- Demo at `/demo/pulse/ai-search` (`src/lib/demo/demo-ai-search.ts`, run through the real rules).

### 111.1 Buyer questions (stage 2)

Card `01 // BUYER QUESTIONS` at the top of the page. A list of buyer questions (12 UK examples
ship in `EXAMPLE_BUYER_QUESTIONS`, editable under "Edit questions", admins) is put to **ChatGPT,
Claude, Perplexity and Gemini** with each one's own web search on and a UK location
(`src/server/ai-answers-engines.ts`). Each answer is judged by `judgeAnswer`
(`src/lib/ai-answers.ts`, pure): **named** = a brand name as a whole word; **cited** = a cited
source (or a link in the text) whose host is one of our domains, never a substring. Gemini's
sources are Google redirect links, so a title that is *exactly* a domain counts too.
- **Only cited sources count**, never every page a search looked at.
- **A failed or refused answer is "Couldn't ask"** and is left out of both sides of every figure.
- **Every tick can be read back:** the excerpt and sources of each answer open under the question.
- **Change vs the previous run** uses only the question × assistant pairs both runs asked
  (`comparableSummaries`), so editing the list never shows as a rise or fall.
- **Runs:** "Ask now" (admins, `POST /api/pulse/ai-search/answers`, runs in `after()`, the page
  polls every 5s) and weekly from the every-minute `jobs` worker (`startDueAnswerRuns`) once the
  questions are **saved** (unsaved examples are never asked on their own). One run at a time; a
  run still "running" after 30 minutes was cut short by a restart and is shown as such.
  Stored in `AiAnswerRun` (additive); config in `Workspace.aiAnswersConfig`.
- **Keys:** the workspace's AI keys via `aiKeyFor` (Anthropic, OpenAI, Gemini), plus the new
  server-only `PERPLEXITY_API_KEY` (synced by `deploy.yml`). An assistant without a key is listed
  with what it needs and skipped. Models are `AI_ANSWER_MODELS` in `ai-provider.ts` (dated; a
  retired id shows as "Couldn't ask" with the provider's error). Usage is logged as `PULSE`,
  operation `ai_search.answers.<engine>`. Each run is questions × assistants paid calls.
- Demo: `/demo/pulse/ai-search` (`src/lib/demo/demo-ai-answers.ts`, judged by the real rules).

## 112. Recent Changes (November 2026) — Code Handover: compare versions

Requested for a client's firmware handover (PollenIQ's Sender / Receiver): see what changed between
two versions without downloading both zips.

- **Compare** on each module with two or more versions, on the team's wiki AND the client's share
  page (the code is already fully shared, so the client sees nothing new). From / To pickers, swap,
  a file list (Changed / Added / Removed / Renamed / Unchanged with +/− counts), every changed line
  with old and new line numbers and 3 lines of context, the newer version's release notes,
  "Ignore whitespace", "Whole files", and **Download .patch**, which `git apply` accepts.
- **Each version row says what it changed** since the version before it ("Since v1.1.0: 2 files ·
  +10 −3 · See changes"). "Before" means created earlier, not listed earlier.
- **The rules are pure, in `src/lib/code-diff.ts`.** It uses Myers' diff (the minimal one; it
  matched `git diff --minimal` on 200 random cases) after trimming the common start and end. It
  handles 15,000-line files in ~15ms. Files are matched by name; a removed and an added file with
  identical contents are a rename. ⚠️ Past `MAX_EDITS` (2,000) changed lines the line diff isn't
  attempted: the file says so and gives tallied counts, and the patch replaces the whole file
  (still exact). Never relax that into a guessed alignment. A missing final newline is a real
  change (it is in git too), and CRLF-only changes are reported as such rather than shown as nothing.
- **The patch never ignores whitespace**, whatever the view says. Its format was checked line for
  line against `git diff`, and 300 random version pairs were applied with `git apply` and matched.
- In-line emphasis marks the changed part of an edited line, widened to whole words
  (`9600` → `115200`, not `96` → `1152`). There is none on a line that shares only its indentation
  (`worthEmphasising`), because highlighting a rewritten line end to end says nothing.
- **New version starts from the current version's files** ("Start empty instead" to opt out), so
  only what changed is edited. **Upload files** reads text files (binary or over 500,000 characters
  refused with the reason; same name replaces). A live "Changes from vX" line shows what the draft
  changes. Only the current version gets the filled Download button.
- A file with over 400 changed lines starts folded (`FOLD_ABOVE_LINES`).
- No schema or route change: files were already stored as text.
- Demo: `/demo/wiki#code-handover` (Receiver has three versions with real edits).

## 113. Recent Changes (November 2026) — Who is a developer is a fact on their Staff record

Abdullah Farooq had the Developer role in Settings → Team and was missing from Code → Developers.
That list only counted records with a GitHub handle, and nothing made a record for a new hire. A
first fix (#799) also counted the Developer **role** and made records whenever the list loaded.
That was replaced the same week, for two reasons. Everyone signs in as DEVELOPER (§57.6), so the
role listed every new hire, developer or not. And a list that writes records when you look at it
is a fix after the fact.

- **`Candidate.isDeveloper`** (additive, nullable) says someone is a developer. A record counts
  when it has a GitHub handle OR the flag is on (`DEVELOPER_RECORD` / `isDeveloperRecord` in
  `src/server/codeclear-archived.ts`). ⚠️ **The role is never read.** A test fails if it comes back.
- **It's decided by a person, at the right moment:**
  - **"They're a developer"** on an invite (`WorkspaceInvite.isDeveloper`). Every path that accepts
    an invite calls `applyInviteDeveloperFlag`, which makes or marks their record. A sweep test
    fails if one doesn't. It never stops someone joining if it fails.
  - **The Developer switch** in a person's Staff details and in Add someone. It's shown on and
    locked when they have a GitHub handle, which lists them anyway.
- **People already here were settled once** by `backfillDeveloperFlags`
  (`src/server/staff-developer-flag.ts`, run at server start). It only looks at records and
  memberships from before `DEVELOPER_FLAG_SINCE` (5 Nov 2026), and sets every such record to true
  (a handle or the Developer role) or false. So it can't go on reading the role, and it writes
  nothing once done. It makes a record for a Developer who had none, linking by email first, under
  an advisory lock.
- **Developers fill in their own details** in Backstage → Me (`MyDeveloperCard`,
  `PATCH /api/staff/me/developer`, rules in `src/lib/developer-self-details.ts`). That's their GitHub
  username (a pasted github.com link is cleaned), stack, location, time zone and links.
  - Only their own record, and only once it's marked as a developer, so adding a handle can't put
    someone on the list.
  - A blank handle means "leave it", never "remove it".
  - A handle already on someone else's profile is a 409 that says so.
  - It opens on the form while the handle or stack is missing.
- **Developers says who's missing details**: "N developers are missing a GitHub handle or main
  stack" with Show them / Show everyone (`missing=1`, `MISSING_DEVELOPER_DETAILS`, counted in the
  list response as `meta.missingDetails`).
- A developer with no handle reads **"No GitHub yet"** (`githubLabel`), not a bare "@".

## 114. Recent Changes (November 2026) — Code Handover: edit, uploads, file viewer

A second pass on the wiki's Code Handover (§112).

- **Edit version** (team only, ⋯ on a version row): the New version popup opens prefilled
  (label, notes, files) and saves through the existing `PATCH versions/[versionId]`. Files replace
  the version's files wholesale, and the live line reads "Changes from the saved vX".
- **Uploads**: drop files, a folder or a .zip onto the Files pane, or use **Upload files** (a .zip
  is accepted there) / **Upload folder**. Paths are kept (`src/radio.h`), and a single folder every
  path shares is dropped, so a zipped `receiver/` lines up with the previous version's names.
  The rules are pure, in `src/lib/code-upload.ts`, and mirror the server: text only (NUL bytes =
  binary), 2,000,000 characters per file (raised from 500,000 in Nov 2026; a PollenIQ sketch was ~535,000) and 10,000,000 per version, 200-character paths, 50 files per version. Tooling,
  dependency and build folders (`.git`, `node_modules`, `.pio`, `build`, `__MACOSX`) and OS files
  are ignored and counted. Everything else left out is listed with its reason.
- **Version viewer**: several files get a picker above the code (chips, or a dropdown past
  `FILE_CHIPS_MAX` = 12) instead of every file stacked. It sits above rather than beside the code,
  because a module card is often half the page wide. Code has line numbers (`NumberedCode`) and
  each file has Download beside Copy.
- **Syntax colours in the compare view**: the tokenizer moved to `code-highlight.tsx` and the
  viewer and the diff share it. `segmentLine` splits a token where the changed-word emphasis cuts
  through it, so both keep their colour. `tokenLines` tokenises the whole file first, so a block
  comment is coloured on every line it spans.
- **Older versions fold**: the newest three (current first) show, the rest behind
  "Show N older versions" (`VISIBLE_VERSIONS`).
- **Copy link** in the compare dialog opens that exact comparison
  (`src/lib/code-compare-link.ts`). ⚠️ The pair rides in a `?compare=<module>:<from>..<to>` query
  parameter, never in the hash. The internal wiki routes on an exact `#<section>` hash and rewrites
  it on every section change, and the client's share page routes on `?section=`, so anything
  appended to the hash would land on the dashboard or be overwritten. A link to versions that
  aren't there is ignored. Closing the dialog removes the parameter.
- Demo: `/demo/wiki#code-handover` (Receiver now has four versions, the newest with `src/` paths
  and a rename).

## 115. Recent Changes (November 2026) — Commitments: the promises you've made, in one list

Backstage → Commitments (`?area=commitments`, a strip above the Backstage cards) and the API the
Mac app will use. Dan's brief: a Gitwork take on a "commitment tracker" (promises pulled from email,
Slack and meetings), easy to use by hand and intelligent. Full doc: **`docs/commitments.md`**.

- **Suggested, never acted on.** Sources: the person's sent Gmail and own Slack messages (opt-in,
  one light-tier AI read), Scribe action items, and calendar follow-ups after external meetings
  (no AI). A suggestion waits in `02 // SUGGESTED` until accepted.
- ⚠️ **A Gmail/Slack suggestion must quote words that are in the message** (`quoteAppearsIn`) and
  cite a message the model was shown. Don't relax it: it's the only thing between the model and an
  invented promise.
- **Only the promise is stored**, never a message body. **Private**: owner only, "view as" refused.
- Models `Commitment` + `CommitmentSettings` (additive, loose ids, no `@unique`), `AiModule
  COMMITMENTS`. Rules `src/lib/commitments.ts` (pure, tested), server `src/server/commitments.ts`,
  routes `/api/backstage/commitments/**`, scheduled reads from the `jobs` worker.
- Demo: `/demo/backstage/commitments`.
- **Not verified against real Gmail, Slack or Calendar.** The sources follow CRM's readers, but
  `format: "full"` sent-mail reads and own-message Slack filtering are new. Post-deploy: switch on
  Sent Gmail, press Check now, and check the suggestions quote your own words.
- **Foundry for Mac:** Dan wants it rebuilt (it "looks shit" and isn't on the latest macOS). It
  can't be built in a Linux session, so the rebuild is a separate task for a Mac session. It
  consumes the API above.
- **To-do fields for the Mac app (Nov 2026):** lists (`CommitmentList`, archived on delete), tags,
  priority, when/evening/someday, reminders, checklists, `orderKey` + `POST …/reorder`, and repeats
  (`nextOccurrence`; completing one creates the next in the same transaction, PATCH returns
  `{ commitment, next }`). Contract in `docs/commitments.md`; the Mac app is written against it.

## 116. Recent Changes (November 2026) — People & office: Staff + Backstage only, for Siân

Siân runs Gitwork's own staff: their records in Staff, and their leave and expenses in
Backstage. She doesn't look after developers. Her access is the **People & office** preset
(Settings → People & access → a member → Quick presets), not a new role: role STAFF, with
`codeclear`, `code.manage`, `hr.manage`, `hr.viewSensitive`, `backstage`, `backstage.approve`
and `backstage.expenses` (`PEOPLE_OPS_PERMISSIONS`). Every other STAFF default is saved as a
revoke, so her sidebar is Staff and Backstage.

- **Expenses are a per-person permission, `backstage.expenses`** ("Review expenses"). Until
  now only Super Admins could open them. Like the HR permissions, it is in no role's defaults
  (`PER_PERSON_PERMISSION_IDS`), so no Admin gained the ledger when it arrived. A new expense
  notifies Super Admins and holders (`target: permission`, `listExpenseReviewerEmails`), no
  longer every leave approver, most of whom couldn't open it.
- **A leave approver who isn't an Admin looks after Gitwork staff only**
  (`src/server/backstage-people.ts`). Admins and Super Admins still look after everyone.
  "Developer" is the Staff record's own fact (`DEVELOPER_RECORD`), never the sign-in role.
  Someone with no record counts as staff. For that approver, the approvals queue, the team
  leave list, Team today, staffing alerts and the HR reminders (and the Monday HR digest) leave
  developers out, and approving, editing or cancelling a developer's leave is refused. A
  developer's leave request notifies Admins only (`leaveApproverUserIds`).
- **The holiday year runs from the person's start date** (`src/lib/leave-year.ts`): it starts
  on the anniversary of the start date on their Staff record. With no start date it stays
  January to December. A 29 February start falls on 28 February in other years. The allowance
  carries `periodStart`/`periodEnd`, shown on Backstage → Leave and the Staff profile.
- **Holiday days can be set per person** at last. `WorkspaceMember.annualLeaveDays` existed
  with no way to write it, so everyone had the workspace's 25. The Staff profile's Time off card
  has **Edit allowance** for whoever handles that person's leave
  (`PATCH /api/backstage/members/[userId]/allowance`, `canSetLeaveAllowance`); blank = default.
- **HQ for someone with no Portal:** Gmail and Calendar tiles now need `clients`, and three new
  tiles appear: **Team leave** (`backstage.approve`: leave waiting + who's off next),
  **Expenses** (`backstage.expenses`: waiting, the total per currency, the latest few) and
  **HR** (`hr.manage`: dates coming up + records missing details). ⚠️ So Admins and Super
  Admins also get Team leave, and Super Admins get Expenses and HR.
- **"View as" now follows through HQ and Backstage.** Both used the real role, so a Super
  Admin previewing Siân kept the Admin bypass and saw Agentic workflow, Analytics/Starters,
  Handover and Expenses she doesn't have. HQ draws for `viewRole`; Backstage's
  `useBackstageAccess` reads the preview too. The developer view (standup, My Clients)
  now needs Portal: "not scoped to every client" only means a developer when they work on
  clients. The On Your Desk drawer is hidden without Portal (every tab is client work).
- **Staff → People shows Gitwork first for her** (`splitGitworkStaff`): non-developers under
  a "Gitwork" heading, and "Developers and everyone else" folded in a `<details>` below. Only
  for someone who isn't an Admin; Admins see the roster as before. Follows "view as".
- Pulse monitor alert emails now go to Admins (`listAdminEmails`), not the Backstage approver
  list they had borrowed, which would have emailed a leave approver too.

## 116. Recent Changes (November 2026) — A scan with no AI write-up says so plainly, once

Dan, on a scan whose AI call failed: the Summary carried a grey "AI analysis not available" box
printing Anthropic's raw JSON (`400 {"type":"error"… credit balance is too low…}`). Now:
- **Summary shows nothing** for a missing AI write-up. The checks, score and gate don't use AI.
- **The Plan tab is hidden** when there is no write-up: every part of it (opportunities, roadmap,
  stack, estimate) is AI output. A link to one of its parts opens Summary (`activeTab` in
  `use-scan-view.tsx`).
- **Raw provider errors are never shown.** `describeAiError` (`src/lib/ai-error-words.ts`, pure,
  tested) turns them into one sentence: out of credit, key rejected, not set up, rate limited,
  no answer, or a generic error. The Technical tab keeps its Regenerate banner with that sentence
  (the raw text is in its tooltip), and the agent panel uses it too.

## 118. Recent Changes (November 2026) — Who counts as Gitwork, and leave that doesn't use allowance

Follow-up to the People & office section (Siân) above.

- **Gitwork's own staff = Employee or Director on their Staff record, and not a developer**
  (`isGitworkStaff` / `GITWORK_EMPLOYMENT_TYPES` in `src/lib/staff.ts`). "Not a developer" was
  wrong: Hassaan (Product Manager, Contractor) and Syed (no Staff record) landed in Gitwork.
  Contractors, freelancers and anyone with no record are "everyone else". The same rule drives
  Staff → People, whose leave Siân approves and hears about, Team today, staffing alerts and her
  HR reminders (`gitworkUserIds` / `gitworkUserFilter` in `backstage-people.ts`). A staff-only
  viewer always sees their own leave too, even before their record has a type. ⚠️ So a Gitwork
  employee needs an Employment type on their Staff record to be Siân's.
- **Leave can be marked as not using allowance** (`LeaveRequest.countsToAllowance`, additive,
  nullable; rules in `src/lib/leave-allowance.ts`). Null (older requests) keeps the old rule:
  only Annual counts. New requests default the same way and the leave form has a "Counts towards
  holiday allowance" tickbox that follows the type until someone sets it. The allowance query
  uses `COUNTS_TO_ALLOWANCE_WHERE`. Leave lists say "not from allowance" / "from allowance"
  when a request goes against its type's default.
- The leave form's buttons are pinned to the bottom of the dialog (`BackstageModal`'s `footer`,
  submit via `form=`); they used to float mid-panel above empty space.

## 117. Recent Changes (November 2026) — Uptime alerts only for what's on fire

Dan: "if they are back up within maybe 5 mins, don't ping Slack". Rules in
`src/lib/monitor-alerts.ts`, all pure and tested:

- **Nothing is posted until a service has failed every check for `ALERT_AFTER_MINUTES` (5).**
  Checks run every minute while failing, so a real outage posts about 5 minutes in; a blip,
  a deploy or a provider hiccup that's back before then posts nothing at all, not even a
  "back up". Timed from `WikiMonitor.streakSince` (additive): the start of the CURRENT unbroken
  run of failures, so an earlier blip it recovered from can't make a fresh outage count as old.
  The post's "Down for 6 min, since 14:37" starts there too. Failed checks still count in
  uptime % and show on the Monitors page straight away; only telling people waits. Incidents are
  opened with the post, so a blip records no incident.
- **"Unstable" needs flapping**: 3 of the last 6 checks failing in at least two separate runs,
  for 5 minutes. One unbroken run that has just ended is an outage that recovered — without the
  runs rule, a 4-minute outage posted "unstable" on the very check that showed it back.
- **Only production posts to Slack.** A non-production monitor's alert passes
  `skipSlack` to `dispatchNotification` (new option), so it still records the incident and tells
  admins in Foundry, but never reaches the channel.
- **Shorter posts.** Only the services that aren't fine are listed, then one line —
  "4 other services OK", or "All 5 services are OK" on a recovery — instead of a green tick per
  service.

## 119. Recent Changes (November 2026) — The free scan's score errs low

StayPay's free scan said **93**; the full scan said **83**. Its homepage is drawn by
JavaScript, so the free scan (no browser) could judge only 69% of what it set out to check,
and Pulse leaves unjudged checks out of the score. So the score went UP the less it saw, and
the lead arrived thinking they were nearly perfect. Dan: "err on the side of a lower score".

- **`freeScanScore`** (`src/server/pulse-lite/free-score.ts`): every check the free scan
  couldn't judge gets **half marks**, halfway between the score from what it saw and the
  breakdown's `lowerBound` (as if everything unseen had failed). A scan that saw everything
  is unchanged. StayPay's shape (93 at 69%) comes out at 79, under the full scan's 83.
- Under **70% coverage** (`PROVISIONAL_BELOW`, `src/lib/pulse-free-score.ts`) the score is
  labelled provisional with one sentence why, on the widget and in our lead email.
- Used by: the stored `PulseLiteScan.healthScore` (so the lead and the leads list carry it),
  the widget's API, the public report and our lead email. The anonymous benchmark corpus
  still records the score from what it saw, so it stays comparable with full scans.
- **The visitor's own report email is unchanged**: it carries the FULL scan's score, which
  loads the page and matches the PDF it links to.

## 120. Recent Changes (November 2026) — A clearer "who's off" Slack post

The weekday post to the absence channel (`src/server/availability-digest.ts`, cron
`availability-digest`) was misread: a half day on Wednesday showed on Monday's weekly round-up as
"Dan Lindsay — leave, 11 Nov–11 Nov", which reads like a whole day off. The wording now lives in
`src/lib/availability-digest-format.ts` (pure, tested):

- Headings say which week or day: **Who's off this week · Mon 9 – Fri 13 Nov** (Mondays) and
  **Who's off today · Wed 11 Nov** (Tue–Fri). The weekly post covers Mon–Fri only.
- One day is written once ("Wed 11 Nov"), and a range doesn't repeat its month.
- A half day says **½ day**. Inside a longer booking, the half days are named ("½ day on Fri 13 Nov").
- Longer bookings say when the person is back; the daily post counts working days left (bank
  holidays aren't known there, so they count).
- A footer gives the number of people and says it comes from **approved leave in Foundry
  Backstage**, not anyone's calendar.

## 121. Recent Changes (November 2026) — Two Staff records for one person: "Same person as…"

Hassaan showed twice in Staff: his old developer card ("Hassaan", @hassaan, nine placements,
a rate, **no email**) and the record made for his login ("Hassaan Bin Sajjad").

- **Why the old card vanished.** `activeDeveloperWhere` (`src/server/codeclear-archived.ts`)
  was `NOT { OR: [email matches] }`. In SQL that is NULL, not true, for a NULL email, so every
  record with no email dropped out of Developers and Staff → People. With the card hidden and
  unlinkable (`linkStaffRecords` links by email), "Create profile" made a second record. The
  filter now has an explicit `{ email: null }` branch, with a test. ⚠️ Any new `NOT` on a
  nullable column needs the same.
- **"Same person as…"** on a profile (`MergePanel`, `POST /api/staff/[id]/merge`,
  `mergeRecords` in `src/server/hr/profile.ts`, rules in `src/lib/staff-merge.ts`). Needs Staff
  manage plus Admin or `hr.manage`. The **older** record is kept (its id is the one placements
  and links use). Everything on the other moves onto it: placements, notes, activity, GitHub
  analysis, checks, DevSignal rows, documents, personal details, the HR access log, anyone it
  manages. Blank fields are filled from the other; the login's name wins over an old card's.
  Refused for two different logins, two different GitHub handles, or personal details on both.
  One transaction; the other record is deleted before the kept one takes its GitHub handle,
  because `(workspaceId, githubHandle)` is unique. Audited as `staff.record.merged`.
- **Edit developer saves without a GitHub handle or main stack.** It used to disable Save, so
  a new developer's rate couldn't be entered until they'd filled those in. A blank handle or
  stack is now left out of the save, never cleared.
- **The Developers list always names its groups** (Bench / Off Bench), even when a filter
  leaves one group. The "missing details" view showed Abdullah Farooq with no group heading,
  so it wasn't clear he was already on the Bench.

## 122. Recent Changes (November 2026) — Clients stay signed in for 30 days, renewed as they use it

A client's wiki sign-in (`wiki_access_<wikiId>`, set by `/api/portal/login`) lasted **7 days
from sign-in and was never renewed**, so a client who opened their wiki every day was still
signed out a week after they last typed their password. It is now 30 days
(`WIKI_ACCESS_COOKIE_MAX_AGE` in `src/lib/wiki-access-cookie.ts`, edge-safe), and the
middleware sets the cookie again on every GET of a `/wiki/` page, so a client is only asked to
sign in after a month away.

- Renewal copies the cookie as it is. It is still checked on every request against the user and
  their current password hash, so removing a client user or resetting their password still signs
  them out at once.
- Only page visits renew, not `/api/wiki` fetches.

## 123. Recent Changes (November 2026) — Releases: the version a task ships in

Big Wedge plans by release (Luke's own Gantt groups every item under one, e.g.
"v2.0.0 | Q4: Refinement Session"), so a client's tasks can now belong to a **release** as well
as a category. A category says what a task is about; a release says when it ships.

- **Model:** `ClientRelease` (version, optional name, optional start/end dates, orderKey) per
  client, and `Task.releaseId` (nullable, `SetNull`). Additive. Deleting a release keeps its
  tasks; they just leave it.
- **Rules** (pure, `src/lib/tasks/releases.ts`): the label ("v2.0.0 · Q4 Refinement Session"),
  the order (start date, undated last, then version compared **numerically**, so 2.9 comes before
  2.10, then orderKey), the span (own dates, else estimated from task due dates via `blockSpan`,
  drawn dashed), progress (0% with no tasks, never 100%), and `findReleaseByVersion` ("2.0.0"
  finds "v2.0.0"; two loose matches is an error, never a guess).
- **Where it shows:** a Release select on the task form, a Release row in the drawer, a mono
  version chip on board cards, a Release menu on the bulk bar, and a **Releases** dialog beside
  Categories on a client's tasks page. The internal Gantt and the client's wiki Timeline get a
  **Categories | Releases** switch (shown only when the client has releases). The wiki's
  `timeline.releases` carries the same client-safe fields as `blocks`: titles, done, timestamps.
  The headline "% complete" stays the plan's, whichever way the chart is grouped.
- **Scoping:** `/api/releases` is scoped like feature blocks (`assertClientInScope`). Every task
  write that sets a release checks it belongs to that task's client (`assertReleaseInClient`),
  and a bulk "set release" refuses a selection that spans clients.
- **MCP:** `create_task` / `update_task` take `release` (a version or an id; '' detaches), plus
  `list_releases` and `create_release`.
- Not wired: the CSV import, Sheets "send to board", and the public `/timeline/[token]` share.

## 124. Recent Changes (November 2026) — Product cards, linked dev tasks, default board columns

A client plans **product features**; developers track the **work behind them**, split by
platform and step. On Wedge only 16 of Luke's 199 planned items matched a Foundry task by name,
because "Tee Shot Planner" on his plan was "Calculate tee shot planner", "Tee Shot Planner - IOS"
and two more on the board. Both levels now live on one board.

- **A task with an `itemType` (feature · sub-item · bug · feedback) is a PRODUCT CARD.** It can
  also carry `tier` (free · premium · scoping), `area` and `estimateHours`; `externalRef`
  (e.g. `forge:247`) lets a re-run import link instead of duplicate. All additive columns on Task.
- **A dev task delivers a card through `productCardId`** (loose id) and stays exactly where it
  is: never re-parented, because subtasks are hidden from the board and a dev task that vanished
  would be lost work. Rules in `src/lib/tasks/product-cards.ts` (`linkProblem`): same client, a
  real card, not itself, **one level only** (a card links to nothing; a card can't deliver a card).
  Refusals are `ProductCardLinkError` (409) with the reason as a sentence. Taking the type off a
  card that still has dev tasks is refused. Deleting a card unlinks its dev tasks; archiving does not.
- **A card's progress is derived** from its linked, unarchived dev tasks (`cardProgress`): one
  `groupBy` per list in `attachCardInfo`, never stored. Nothing linked is `null`, not 0%.
- **UI:** Type / Tier / Area / Estimate on the task form, and a **Delivers card** picker for a dev
  task (anchored combobox, §55). The drawer shows a card's **Dev tasks** (link, unlink) and a dev
  task's **Delivers** link. Board cards carry type, tier and `2/3 dev` chips. MCP `create_task` /
  `update_task` take `itemType`, `tier`, `area`, `estimateHours`, `productCard` (id or exact title).
- **Default board columns.** A custom column can be the default for its status (`isDefault`, one
  per status): that status's own column is then not shown, and a task of that status with no
  column (or a stale one) sits in the default. Statuses without one are unchanged. This is what
  lets a client's whole board be their own workflow (Wedge's 12 columns) without re-filing tasks.
- **A task in a release counts as planned** (plan health, My Day "From the plan", Foreman
  PLAN_DRIFT), not only one in a category.

## 125. Recent Changes (November 2026) — Importing a client's plan from their planning tool

Big Wedge plans in a WordPress "Forge" board that publishes the whole plan as public JSON
(`https://ops.bigwedgegolf.com/wp-json/forge/v1/items`: features, sub-items, bugs, feedback,
releases). `src/lib/forge-import/` (pure) and `src/server/forge-import.ts` import it onto the Wedge
board as product cards (§124). Admin-only: `POST /api/clients/[slug]/forge-import/plan` (dry run)
and `/apply`, and MCP `forge_import_plan` / `forge_import_apply`. Audited as
`tasks.forge_import.applied`.

- **The dry run writes nothing.** Apply is ONE transaction under a per-client advisory lock
  (`pg_try_advisory_xact_lock`): a second apply while one runs gets 409, planning happens after the
  lock is held, and a failure part-way leaves the board as it was. Each card carries `externalRef`
  "forge:<id>" and is never imported twice; so does each release (`ClientRelease.externalRef`).
- **A fill never overwrites.** Each field is written in its own `updateMany` with "still empty" in
  the WHERE, so a value the team set meanwhile wins, and each field is filled at most once
  (`metadata.forge.filled`), so a value the team CLEARED stays cleared. A team task is never moved
  into a column; only a card the importer makes is placed.
- **A sub-item waits for its feature's card** (`waiting` in the plan) rather than being made
  top-level, and hangs one level deep (under its feature card's parent if that card is a subtask).
- **Feed values are hostile input:** looked up as own properties only (`"constructor"` can't hit a
  built-in), strings capped at parse time (`FEED_LIMITS`, titles 500 and flagged), and a match that
  only works with a platform tag stripped ("Bag Management - iOS") goes to review.
- **Release docs are kept** (`ClientRelease.docUrl`, http(s) only via `safeReleaseDocUrl`): editable
  in the Releases dialog and shown as "Release doc ↗" on the internal, wiki and public timelines.
- **Only an exact title match is acted on** (`src/lib/forge-import/match.ts`, a port of the
  hand-checked comparison, incl. difflib's ratio). A live, top-level team task becomes the card;
  an archived task or a subtask stays where it is and is linked to a new card. Anything looser, or
  not one-to-one, waits in the review list for a decision (a task id, `create` or `skip`).
- ⚠️ **Apply never deletes, archives, reparents, renames or re-statuses a team task**, and every
  update is `updateMany` scoped to the client. A linked task keeps its own status; the dry run says
  where Big Wedge's stage differs.
- **Stages → columns** (`stages.ts`): the importer only references Wedge's columns by name and
  refuses to run until all eleven exist. ⚠️ There is no "In Review" column: a board column may not
  repeat a status's own name, so that stage is the In Review status lane.
- **Product cards are no longer auto-archived** after 30 days done (`autoArchiveDoneTasks`), or
  Live Features would empty overnight.
- **The real-data test** (`plan-real-data.test.ts`) runs only with `FORGE_FIXTURES_DIR` set. The
  repo is public, so the client's plan and our task list are never committed as fixtures.
- `scripts/forge-import-report.ts` renders a plan as the markdown summary that gets approved.

Same change: releases in the CSV import and Sheets "send to board" (validated to the client, team
only), releases on the public `/timeline/[token]` link with the Categories | Releases switch, and a
card's dev tasks read from the server (`GET /api/tasks/[id]/linked`, archived included) instead of
the board's cached list.

### 125.1 Incident: the first live dry run froze the site

Title matching is n × m (199 feed items × every Wedge task) and each spelling comparison is
O(len²), all on the one thread that answers requests. The first live dry run (18 Nov 2026), run
twice because the browser gave up on the first, froze foundry.gitwork.co.uk for minutes.

- **Exact upper bounds first** (`ratioUpperBound`, difflib's real_quick_ratio + quick_ratio):
  the slow comparison only runs when it could reach 0.85. ~18× faster, and checked identical to
  the old matcher on 446,954 real and near-threshold pairs.
- **The server pauses between feed items** (`matchFeedYielding`, `setImmediate`) and stops with a
  503 past `MATCH_BUDGET_MS` (60s) rather than run on.
- ⚠️ **Anything O(n × m) over a client's whole board must yield and have a budget.** Unit tests on
  fixtures did not catch this: the real board is bigger than the snapshot, and a CPU-bound loop
  doesn't fail, it just stops the site answering.

## 126. Recent Changes (November 2026) — The client's Board: move, add and sign off cards in their wiki

A client-wiki section, **Board** (id `board`, `ClientWiki.boardEnabled`, additive): the client's
product cards on the team's own task board, in the client's columns (default columns included,
§124), grouped by release under each column. Asked for by Big Wedge, whose own planning site
had a Kanban grouped by release and who wanted Foundry to be the one place the plan lives.

- **It is the real board.** A card the client adds is a `Task` at once (`createdById` null,
  `metadata.createdByClient`), a move is a real status change (`moveTaskForClient` in
  `tasks.ts`, same status stamps as a team move). Nothing is copied, so nothing is lost between
  the client's view and the devs'.
- **Rules** (`src/lib/wiki-board.ts`, pure, tested):
  - ~~The client moves cards between any columns except into or out of Done.~~ **Superseded
    (§126.3):** the client has full control of their cards, Done included. The one thing they
    can never do is set who works on a card.
  - ⚠️ **The client only acts on their product cards and the cards they added**
    (`clientMayActOn`). The team's plain dev tasks are a 404 to every client write and read of
    the feedback thread.
  - The client adds cards only to **Backlog and To do** columns, as Feature, Sub-item, Bug or
    Feedback (§126.3). Links must be http(s) (the Launchpad allow-list) and are stored as markdown
    in the description.
  - **Sign-off is derived** from the latest Approved / Changes needed entry, never stored. A
    comment never changes it. "Changes needed" must say what. Only the client signs off: a
    Gitwork session on the client's page, or the team's own route, can only comment.
- **Data:** `TaskClientFeedback` (additive): the thread both sides see, unlike `TaskComment`
  (internal notes, never shown to the client). `TaskDTO.clientSignOff` is derived from it in
  `attachCardInfo`, one query per list, and is in both list allow-lists.
- **Loader:** `loadWikiBoard` (only while the section is on) sends top-level, live tasks.
  `isCard` marks product cards. ⚠️ **A dev task's description is never loaded for the board**
  (`descriptionsFor` reads descriptions for cards only): devs paste internal notes, Slack and
  sometimes secrets into them. **The client doesn't see dev tasks at all** unless the team
  switches on `ClientWiki.boardShowAllTasks` ("Show the client all tasks (titles only)" on the
  team's Board); even then a dev task goes as title, column and people only, read-only, and the
  client's counts leave them out when it's off. Done columns send their newest 50 cards and newest 50 other tasks, with counts.
  Layout is pure (`src/lib/wiki-board-layout.ts`) so the server and the demo build it the same.
  People on a card are first name + initial; no emails, ids, internal notes or money.
  `forPublicBoard` rebuilds every card from an allow-list.
- **Writes** go through `src/server/wiki-board-access.ts`, the Sheets posture: token → section on
  → a per-section link must be for the Board → wiki sign-in or this client's team → per-IP rate
  limit. ⚠️ **A Foundry session alone is not the team** (`teamWriterFor`): it must be an active,
  non-guest member of the client's own workspace who can open this client. A session from
  another business, a guest or an unassigned developer is treated like anyone else. It looks the token up directly rather than through `resolvePublicWiki`, which builds the
  whole wiki (this board included) per call; a drag writes on every move. Every write then loads
  the task **scoped to the wiki's client** (`loadOwnTask`), so another client's card is a 404.
  A move is a compare-and-set (`moveTaskForClient`'s `expect`): it lands only while the card is
  on this client, live and still in the status the client saw. Otherwise 409.
- **Limits** (`src/server/wiki-board-limit.ts`, pure thresholds): a client adds at most 30 cards
  an hour and 200 a day (counted from `metadata.createdByClient`, so team and imported cards
  never count) and 60 comments an hour. The team hears about new client cards once per wiki per
  10 minutes, with a count, claimed on `ClientWiki.boardClientNotifiedAt`.
- **A per-section link for another section doesn't carry the board** (`scopeBoardToSection`).
  ⚠️ Known gap: the other sections aren't cut down that way; a per-section link still sends the
  rest of the wiki DTO, behind the wiki login.
- **Settings** (`PATCH /api/clients/[slug]/wiki/board` { enabled?, showAllTasks? }) are gated
  like Sheets' (`resolveInternalSheets`): 'Manage clients' and access to the client.
- **Team side:** the task drawer has a **Client feedback** section (thread + reply), on product
  cards always and on other tasks once the client has said something. Board cards show the
  sign-off chip. The internal wiki shows the same Board (`audience="team"`): drag anywhere,
  reply, and add, edit, delete and restore cards (§126.3).
- **Notifications:** new event `tasks.client_feedback` (in-app + push) to the card's assignees,
  or the client's team when nobody is on it, grouped per card. A client adding a card raises
  the existing `tasks.client_request`.
- Demo: `/demo/wiki#board` (team view; moves, replies and the toggle work in memory).

### 126.1 Timeline view

A **Board | Timeline** switch at the top of the Board (both audiences): the same cards and filters,
drawn as Big Wedge's own planning site does. Each release is a bar from its start to end date with
**% done**; its cards sit beneath it, each a bar across the release's dates, tinted by type (the
same families as the type chips; no side stroke). A today line, Weeks / Months, Today, Collapse
all; releases that ended over a week ago start folded. Clicking a card opens the Board's detail.

- Layout maths are pure in `src/lib/wiki-board-timeline.ts` (whole UTC days, so a bar never slips
  a column with the viewer's time zone; end date inclusive).
- ⚠️ **% done is counted on the server** (`WikiBoardRelease.cards` / `done`, via
  `countReleaseCards`) from every card before a Done column is capped at 50. Counting what the
  browser has would understate a release with more than 50 cards live. Only cards the client sees
  are counted, never the team's dev tasks.
- One scroller holds the header and every row (§45.2), and the name rail is sticky on the left.

### 126.2 Calendar, card images, straight side stroke

- ~~**Calendar**~~ **Replaced by the Schedule (§128).** (Board | Timeline | **Calendar**, `wiki-board-calendar.tsx`, maths in
  `src/lib/wiki-board-calendar.ts`): a Monday-first month or week, today circled, cards on their
  due date (no due date → not on the calendar, never an invented date), each release a thin span
  across its days with "starts"/"ends" markers, "+N more" opening the day's list. Phone: an agenda
  of the days with something on them.
- **Images:** the Forge import copies each item's screenshots onto its card as task attachments
  (`src/server/forge-images.ts`, rules in `src/lib/forge-import/images.ts`). After the import's
  transaction, never inside it; 3 at a time, 120 s budget, SSRF guard, 10 MB cap, PNG/JPEG/GIF/WebP
  by magic bytes (no SVG). Recorded per card in `metadata.forge.images` (URL → attachment id), so a
  re-run copies nothing twice; a failed image is reported, not thrown. Cards carry `images`
  (attachment ids, cards the client may act on only); the client's dialog reads them through
  `GET /api/wiki/[token]/board/tasks/[taskId]/images/[attachmentId]` (same access as the thread,
  nosniff + sandbox CSP).
- **Side stroke:** back, but straight: `rounded-l-none` wherever `border-l-[3px]` is drawn
  (`straight-side-stroke.test.ts`). A stroke that bends round a rounded corner is what Dan ruled out.
- **Sheets** sat under Working together until it was retired into the Board the same month (§127).

### 126.3 A cleaner toolbar, and full control of the cards (the client's ops-board parity)

Dan: "the top section needs a lot of love… too much going on", and Big Wedge (Luke) needs to do
everything on Foundry's Board that he did on his own ops board. Dan's ruling: **"he needs full
control over the tasks basically… what he can't do is assign it to a dev."**

- **One toolbar row** (`wiki-board-section.tsx`): Board | Table | Timeline | Calendar on the left (Table: §127.1); search,
  **Filters** (an anchored popover with Type, Release, Area, and Cards / Everything where both
  exist, plus a count badge) and **+ Add card** on the right. Team only: a **⋯ Client view** menu
  holding "Client sees: Their cards only / Cards and dev task titles" and **Preview as client**,
  which shows a one-line "Previewing <client name>'s view · Exit" strip. The old Client sees
  banner and the Cards/Everything/Client's view control are gone. On a phone the views take the
  first line and the rest the second (icons only), nothing clipped. The Timeline's and Calendar's
  own controls stay in their view's own header line.
- **What the client can do, on every card they can see** (product cards, including imported
  `forge:*` and team-made ones, and cards they added): add (Feature, Sub-item, Bug, Feedback),
  edit every field (title, type, release, tier, area, priority, estimate 0–1000h, due date,
  description, links, depends on, screenshots), move anywhere **including into and out of
  Done/Live** (`clientMoveRefusal` is deleted; `moveTaskForClient` no longer refuses Done), and
  delete.
- ⚠️ **The one thing they can never do is choose who works on a card.** `boardCardEditSchema` and
  `boardCardCreateSchema` (`validators.ts`) are `.strict()` and have no assignee field, so
  `assignees` / `assigneeId` is a **400**, not silently dropped (`board-card-schema.test.ts`).
  Status goes only through the move route. **The team's dev tasks are still untouchable**: every
  client write loads the task through `loadEditableTask` / `assertClientMayAct`, and a dev task
  is a 404, the same as one that doesn't exist.
- **Edits** (`updateBoardCard`) are an `updateMany` scoped to `{ id, clientId, parentId: null,
  archivedAt: null }`; 0 rows is a 409. Releases and "depends on" are checked against the same
  client (a client may only depend on cards they can see). An edit that changes nothing writes
  nothing.
- **Every change is a readable entry in the card's thread**: `TaskClientFeedback.kind = "change"`, body one sentence from `describeCardChanges` + `changeSentence`
  (`src/lib/wiki-board-edit.ts`, pure): "Luke changed the priority from Medium to High and set
  the due date to 4 Dec 2026." Never JSON. Change entries don't count as feedback or sign-off and
  don't count against the feedback limit. A client's edit notifies the card's people (or the
  client's team) at most once per card per 10 minutes (`shouldNotifyCardChange`).
- **Links** stay where they were: a markdown block in the description (`cardDescription`), which
  the team's task drawer shows. `splitCardDescription` reads that exact block back out for the
  edit form; anything else stays as text.
- **Depends on** is `task.metadata.dependsOn = [taskIds]`, same client, up to 20; cards carry
  `dependsOn: [{ id, title }]` and the client's copy keeps only cards they can see.
- **Sub-items** need a parent that is a top-level **feature** card on this client (one level);
  they become its subtask and show inside it, not on the board.
- **Screenshots** (`addBoardCardImages`, `POST …/tasks/[taskId]/images` multipart `file`):
  PNG, JPEG, GIF or WebP **by magic bytes** (`checkBoardImages`; SVG refused whatever it's
  called), 10 MB each, 10 a card, stored as `TaskAttachment` the way the Forge copy stores them
  (bytea + a 320px JPEG thumb) and served through the existing token-scoped image route.
  ⚠️ `TaskAttachment` has no `storageKey`, so these don't go through `blob-storage.ts`; moving task
  attachments to the bucket is its own change.
- **Delete is soft** (`deleteBoardCard`: `archivedAt` + `metadata.deletedFromBoard`, with a
  confirm step). A product card's linked dev tasks are **not** deleted: their `productCardId` is
  cleared, each gets a `TaskComment` saying who deleted the card, and their ids are kept on the
  card so **Restore** links them again. The team is notified. On the client's link only a signed-in
  client user may delete; the team deletes from the internal wiki.
- **The team** has internal routes `/api/clients/[slug]/wiki/board/cards` (POST),
  `…/cards/[taskId]` (PATCH, DELETE), `…/images` (POST) and `…/restore` (POST), through
  `resolveInternalBoardWriter`: `requireAuthedUser`, Developer or above, client in scope, and
  'Manage clients' to delete or restore. The internal Board lists **Deleted from the board** with
  Restore (`WikiBoardSection.deleted`, team copy only; `forPublicBoard` never sends it).
- **Limits** (`wiki-board-limit.ts`, pure, tested), per wiki, counted in `RateLimitHit` under
  `board:<action>:<wikiId>`: edits 120 an hour, moves 200 an hour, deletes 30 an hour / 100 a day,
  screenshots 50 an hour / 200 a day (one hit per file), on top of the card and comment limits.
- Demo: `/demo/wiki#board` adds (with an image), edits, deletes and restores in memory.

**Security review fixes (same PR).** An independent review found these; each has a test that
fails when the fix is reverted:
- **Client write responses are the client's copy.** Every write a client makes answers with
  `loadBoardCard(…, forClient)` → `publicCard`: "depends on" names only cards the client may act on.
  It used to return the team copy, so a move or an upload leaked the titles of dev tasks the team
  had made a card depend on, even with "Their cards only".
- **One per-wiki lock for client writes** (`withBoardLock`: a transaction taking
  `pg_advisory_xact_lock` via `$executeRaw`). The quota count, the hits (`consumeBoardQuota`) and
  the write they pay for land together, so parallel requests can't all pass the same count and a
  failed write takes its hits with it. Edits, deletes, uploads and card creates run inside it;
  a move takes its quota under it, then moves.
- **Uploads are all or nothing:** every image is decoded and thumbnailed before any is stored;
  the card's room is counted again under the lock; attachments + hits + thread entry are one
  transaction. An image whose header declares more than 40 MP (`BOARD_LIMITS.imagePixels`) is
  refused before decoding, and the decode itself runs with `limitInputPixels`.
- **Upload size before the body:** `readBoardImageForm` refuses on `Content-Length` (411 if
  missing, 413 over `uploadRequestBytes` = 24 MB) before `formData()` buffers anything. nginx caps
  bodies at 25 MB, so the form sends a big selection in batches (`uploadBatches`).
- **Rate-limit IPs can't be spoofed:** `clientIpFrom` (`src/server/rate-limit.ts`, which Pulse's
  copy now re-exports) uses `X-Real-IP` (nginx sets it to `$remote_addr`), else the RIGHTMOST
  `X-Forwarded-For` hop. It used the first hop, which is whatever the client sent. This applies
  to every rate limit in the app.
- **A client's dependency edit keeps the team's hidden links** (`hiddenDependsOn`): the client
  only sees, and sends, the cards they may act on.
- **Traceable:** a client's edit stores the title/description it replaced on the change entry
  (`TaskClientFeedback.previous`, additive; team reads only, shown as "Previous version"), and a
  move to another column writes "Luke moved this to Live Features."
- **Delete is one transaction** (archive, unlink, notes, thread entry). The team's Deleted list
  shows up to 1,000 with the total, instead of a silent 50.

### 126.4 One card dialog: add, read and edit in the same place

Dan, on the add form ("a single long scrolling form") and the Table's boxed dropdowns: "make sure we
have everything in here, maybe go house pop up, 2 column approach… can it serve another purpose".
**`wiki-board-card-dialog.tsx` is now the one place a card is created, read and edited**, from every
view (Board card, Table row, Timeline bar, Schedule entry), on the team's wiki and the client's link.
The old `CardForm` (add) and `CardDetail` (read, then a separate "Edit" form) are deleted.

- **The house fixed-height two-column popup** (`.app-dialog-fixed`, 960px): the card on the left
  (large title, markdown description with Write / Preview, screenshots with drop / paste / upload and
  a lightbox, links, sub-items, then **Activity**: the thread, change entries with the team-only
  "Previous version", and the imported stage dates on one line of time, `cardActivity`), with the
  composer pinned under it; a **properties rail** on the right (Type, Column, Release, List, Area,
  Priority, Tier, Estimate, Due, Depends on; Feature for a new sub-item; and, team only, People,
  linked dev tasks and "Open on the task board"). Below `md` it is one column with the properties
  folded under the title ("Details"), as a full-height sheet.
- **Values read like the Table's cells, not form boxes** (`board-pick.tsx`: `PickCell`,
  `InlineText`, `TextEditor`, `PRIORITY_TONE`, shared with the Table): text or a chip, the native
  `<select>` invisibly over the cell, the chevron and a tint only on hover or focus.
- **An open card saves each change as it's made**, one field per PATCH through the same routes as the
  Table, shown at once and put back with a sentence if refused; the footer says "Saving…" / "All
  changes saved" / the error. The column is the Board's move. Depends-on is picked in an anchored
  popover and saved once when it closes (a client's edits are rate limited). Adding keeps a draft and
  saves on **Add card**.
- **Who may change what** (`cardEditing`, `src/lib/wiki-board-card-dialog.ts`, pure, tested): the
  client edits and moves their own cards and nothing of a dev task; the team moves a dev task but
  edits its fields on the task board (the Table's rule); nothing while previewing the client's view.
  **The client never sees who works on a card** in the dialog (`showsPeople`), never sets it (the
  schemas have no assignee field), and gets the client's copy of "depends on".
- **Screenshots come off a card** (client and team): an × on each thumbnail and **Remove** in the
  lightbox, each asking in place first. `removeBoardCardImage` only touches an attachment on THAT
  card (`{ id, taskId, removedAt: null }`), on a card the writer may act on (a dev task is a 404 to
  the client), and writes "Luke removed a screenshot." in the thread.
  - ⚠️ **It is kept, not deleted** (`TaskAttachment.removedAt` / `removedByName`, additive): every
    other removal on the Board can be undone, and a hard delete couldn't, including team, Forge and
    sheet images. Every reader skips a removed row (board DTO `images`, the image GET routes, the
    task drawer's list, image GET and attachment count, the per-card 10-image cap). The bytes stay
    in Postgres; **nothing purges them**.
  - The team puts one back from **Removed screenshots (n) · Restore** in the card popup
    (`restoreBoardCardImage`, team only, Manage clients, recounts the card's 10-image room). The
    team copy carries `removedImages`; the client's is always empty. Removing an already-removed
    image is a 404.
  - A client's removal comes out of the **delete** quota (30 an hour, 100 a day, shared with
    deleting a card), not the edit quota.
  - Routes: client `DELETE /api/wiki/[token]/board/tasks/[taskId]/images/[attachmentId]` (writer,
    then the write rate limit); team `DELETE /api/clients/[slug]/wiki/board/cards/[taskId]/images/[imageId]`
    and `POST …/[imageId]/restore`, both `resolveInternalBoardWriter("manage")`.
- **A feature's sub-items open in the same popup**: "‹ Feature / Sub-item" in the header, Back
  returns to the feature without closing (one Modal; the wrapper keeps the sub-item and re-reads the
  feature after every change so its list on the board stays right). The same layout, per-field
  autosave, screenshots, links, thread and delete. Its type is fixed (a sub-item stays a sub-item,
  400 otherwise). **+ Add sub-item** under the feature's list adds one and opens it. The card DTO's
  `subtasks` now carry `{ id, title, done, isItem }`; only `isItem` rows open (`isAddressableSubItem`
  in `src/lib/wiki-board.ts`: itemType "subitem" directly under a top-level FEATURE card, the same
  rule as `assertAddressable`). The team's checklist children are listed only, and in the
  **client's** copy they carry no id (`id: null`), only their words and tick. New `GET` on the card routes (`readBoardCard`)
  opens one card or sub-item, in the copy the caller may see.
- ⚠️ **Which child tasks a board route may address is one rule, `assertAddressable`
  (`src/server/wiki-board.ts`)**: a live top-level task, or a product sub-item whose parent is a
  live top-level FEATURE card on the same client. A dev task's child, or a plain checklist child of
  a card, is a 404 to everyone. Loads find by `{ id, clientId, archivedAt: null }` and then apply it;
  updates and deletes compare-and-set on the `parentId` they loaded. The deleted list and Restore
  include sub-items; restoring one places its feature card.
- **Intended widening for sub-items:** because they go through the same `loadOwnTask` /
  `loadEditableTask`, a client can also **move** a product sub-item (Done included), **comment on or
  sign it off**, read its thread, and get or add its screenshots, all within `assertAddressable` +
  `clientMayActOn` and the usual quotas. Dev subtasks stay a 404 (their itemType isn't "subitem").

### 126.5 A Done column's older cards, on request

The board sends a Done column's newest `BOARD_LIMITS.doneLaneCards` (50) cards and counts the
rest, so a long-running client's board stays light. Wedge's Live Features has ~77. The rest is
read when someone asks:

- **Board:** "Show N older" at the foot of the column (and under the phone's column) reads that column.
- **Table and Schedule:** opening either reads every Done column's older cards, because both count
  every card and the Schedule logs what finished. The Table's note says "Loading…" while it reads
  and disappears once the set is complete.
- **Routes:** `GET /api/wiki/[token]/board/lanes/[laneKey]` (client link: `resolveBoardWriter`,
  then a per-IP read limit, `assertBoardReadRate`, 120/min) and
  `GET /api/clients/[slug]/wiki/board/lanes/[laneKey]` (team: `resolveInternalBoardWriter("write")`).
  Query `?kind=cards|other&offset=&limit=` (≤100, `DONE_PAGE_MAX`), parsed `.strict()` by
  `parseDoneLaneQuery`. Done columns only (400 otherwise).
- ⚠️ **The client's link always gets the client's copy** (`boardLanePage`, `audience: "client"`),
  whoever is signed in, because that's what the page shows: their cards through `publicCard`, the
  team's dev tasks as `titleOnlyCard` only while `showAllTasks` is on, and not counted otherwise.
  A test asserts a dev task a card depends on is never named.
- **Order:** `byRecency` (finished, else last changed, newest first; ties by id), the same order the
  board caps by, so page one starts with the cards already shown. The client reads from offset 0
  and merges (`mergeBoardCards`: the board's copy wins, nothing twice), so a card finishing between
  the two reads can't be missed. After a refresh the older cards are read again.
- The wiki DTO's board shape is unchanged.

## 127. Recent Changes (November 2026) — Sheets is retired: its rows become Board cards

Only Wedge ever used Sheets: a QA review (47 rows, 26 already sent to the board and done) and a
front-end backlog (18 rows, none sent). Both were lists of work kept beside the Board, so the work
had two homes. Dan's call: "remove sheets as an entity — sheets is just a view", with a Table view
on the Board for generic lists. This change does the move; the Table view is §127.1.

- **`Task.boardList`** (additive, `@@index([clientId, boardList])`, never unique): a named list of
  cards, e.g. "QA review: 20 Oct 2026". At most `BOARD_LIST_MAX` (80) characters. Set through the
  task routes (`boardList` in the card fields) and MCP `create_task` / `update_task` (`list`; ''
  takes a card out). `TaskDTO.boardList` is optional so older DTO builders needn't send it.
- **The move** (`src/lib/sheets-to-board.ts` pure, `src/server/sheets-to-board.ts`): every live
  row becomes a product card in the list named after its sheet.
  - **Every non-empty cell is carried**: the title cell is the card's title, the rest go in the
    description as `**Column:** value` (`rowTaskDescription`, the text "Send to board" wrote).
    A row with no title keeps its cells under "Untitled row from …".
  - **Idempotent:** a card carries `externalRef = "sheet-row:<rowId>"`; a second apply makes nothing.
  - **A row already sent to the board keeps its work.** Its dev task (on this client) gets a new card
    in the task's own status (Done → the Done lane) and is linked to it, unless it already delivers
    another card. A task that's already a card just joins the list. A task that's gone, or on
    another client, counts as never sent.
  - **Mapped only where it clearly matches:** a QA-shaped sheet (title or Expected/Build columns)
    makes bugs, otherwise features, and a row's own Type wins when it names a card type. Priority
    High/Medium/Low (Urgent → High), Area → the card's area. A Status naming one of the client's
    Backlog/To do columns lands there ("Future item" → Future Idea, "To decide" / "In review doc"
    → Triage); anything else goes to the default backlog lane. The original value stays in the
    description.
  - **Screenshots:** uploaded images are copied onto the card as attachments, after the
    transaction, 3 at a time inside 120 s, each under a per-card lock (`metadata.sheet.images`,
    key → attachment id, so nothing is copied twice). A file uploaded to another client's wiki is
    never copied. Links elsewhere stay links.
  - Apply is one transaction under `pg_try_advisory_xact_lock` (409 while one runs). The sheets
    themselves are never changed.
  - Run it: `POST /api/clients/[slug]/sheets-to-board` `{ apply?: boolean }` (dry run by default;
    'Manage clients' + this client) or MCP `sheets_to_board_plan` / `sheets_to_board_apply`.
    Audited as `tasks.sheets_to_board.applied`.
- **Sheets is gone as a section.** Out of the sidebar, Add New, section groups, dashboard, phone
  nav, share lists, the client's view and `clientVisibleSections`; its components, the internal and
  token routes, the upload-ticket route, the MCP sheet tools, the demo and the
  `wiki.sheet_client_edit` notification are deleted. An old `#sheets` link opens the Board.
  `wiki-section-wiring.test.ts` fails if "sheets" comes back anywhere.
- **Kept:** the `WikiSheet*` tables and `ClientWiki.sheetsEnabled` (dropping them would block every
  deploy, §2), the image route `/api/wiki/files/[key]/[name]` (old links), `resolveInternalSheets`
  (the Board's settings route uses it), and the pure cell rules, moved to `src/lib/table/` (typed
  cells and coercion, RFC 4180 paste parsing, CSV/TSV export with formula injection neutralised,
  sort, undo history, media links, column widths) with their tests, for the Table view.
- ⚠️ The wiki DTO still sends `sheets: { enabled: false, sheets: [] }`, always empty, so an app
  build that decodes the field doesn't fail. Drop it once no build reads it.

### 127.1 The Table view: the grid, over the Board's own cards

The Board's view switch is **Board · Table · Timeline · Calendar**. The Table shows the same
cards, with the same search, filters and "Client sees" rules, as spreadsheet rows. Rules are in
`src/lib/wiki-board-table.ts` (pure); the component is `wiki-board-table.tsx`.

- **`list` on the card** (`WikiBoardCard.list` ← `Task.boardList`). The client sees it, the add
  and edit dialogs set it (free text, suggested from the lists in use), and it's in the board
  card schemas (`.strict()`, ≤ `BOARD_LIST_MAX`). A list change is a change entry: "Luke moved it
  to the list “QA review”".
- **Grouping** by List (the default whenever any card has one; "No list" last), Column, Release
  or none. Groups fold. **Sorting** reuses the sheet sorter: blanks last both ways; priority,
  column, release, type and tier sort by rank.
- **Editing a cell** sends ONE field through the card dialog's own routes, so every server rule
  applies (`cellPatch`); a column change is the Board's move. It's optimistic, with a rollback
  and a sentence if it fails. ⚠️ People is never a cell (`EDITABLE_COLUMNS` has no assignee),
  and a team dev task is only ever moved from here: its fields are edited on the task board
  (`cellEditable`). The client gets the client's answer, and so does the team while previewing.
- **Adding:** a row at the foot of each group creates a card in that list / release / column.
  **Paste rows** takes up to 200 rows from Google Sheets or Excel, guesses which column is which
  card field (changeable), and puts every unmatched cell, or a value that doesn't fit its field,
  into the description as `**Column:** value`. A row naming a later column is added early and then
  moved there. **Copy** (TSV) and **CSV** export what's shown, with formula injection neutralised.
- **Bulk:** tick rows, then set list, column, release, area, priority or tier, or delete.
  `bulkTargets` limits it to cards the viewer may change (deleting never reaches a dev task, even
  for the team) and the result says how many were left alone. Three writes at a time, because a
  client's edits are rate limited.
- The view, grouping and sort are remembered per viewer per board (`foundry.board.prefs.v1.*`,
  localStorage, read after mount so the server render matches).
- Done columns carry their newest 50 cards; the Table says how many older ones aren't shown.
- Demo: `/demo/wiki#board` → Table (two lists seeded).

## 128. Recent Changes (November 2026) — The Board's Schedule replaces the calendar

Dan, on Big Wedge's own ops calendar and ours: "both calendars are terrible… can we have something
that is useful". Theirs printed one release name on every day of the month; ours was mostly empty
grid with stripes, because 145 of Wedge's cards have no due date. A month grid is the wrong shape
for a plan. The view switch is now **Board | Table | Timeline | Schedule**.

- **The Schedule is a list of weeks** (`wiki-board-schedule.tsx`, rules pure in
  `src/lib/wiki-board-schedule.ts`). Each week says, once: the **releases** running in it (dates
  and % done, `releasePercent`), the cards **due** in it, **what happened** in it (each card's
  imported stage dates, `stageHistoryOf`, plus the day it was finished), and the client's **key
  dates**. **Overdue** cards (not done, due before today) are pinned above the weeks once, not
  repeated in their week. Runs of empty weeks fold into one "N quiet weeks" line
  (`scheduleRows`); this week always gets its own row. Upcoming / Past, Today, "Show 12 more weeks".
- **No date yet** tray at the foot: the client's undated, unfinished cards, each with **Set date**
  for whoever may edit it (the existing card edit route, `dueDate` only). Never invents a date.
- ⚠️ **A dev task never makes an event.** `cardEvents` only reads cards the client may act on
  (`clientMayActOn`), and `WikiBoardCard.doneAt` (new, `task.completedAt`) is only set for those
  cards, null in `titleOnlyCard`. "What happened" can't leak a dev task's title or dates on either
  "Client sees" setting. A stage dated after today is a plan, not something that happened, and is
  left out.
- **Key dates** — new model `WikiBoardKeyDate` (additive, loose ids, never unique, soft delete):
  title ≤120, date (`@db.Date`), note, `externalRef`. In the board DTO as `keyDates` (both copies;
  `forPublicBoard` copies them field by field). Writes in `src/server/wiki-board-key-dates.ts`:
  every update/delete is scoped `{ id, clientId, archivedAt: null }` (another client's is a 404);
  a client's writes run inside the board's per-wiki lock and count against a new `keyDate` quota
  (60/hour, 300/day). Routes: client `POST /api/wiki/[token]/board/key-dates`,
  `PATCH|DELETE …/key-dates/[keyDateId]` (Board write posture; delete only by a signed-in client
  user); team `POST /api/clients/[slug]/wiki/board/key-dates`, `PATCH|DELETE …/[keyDateId]`
  (`resolveInternalBoardWriter`; delete needs 'Manage clients').
- **Planning-tool dates:** the Forge feed's `companyDates` are parsed (`ForgeFeed.keyDates`) and the
  plan import's apply creates them as key dates (`syncForgeKeyDates`,
  `src/server/wiki-board-key-date-import.ts`, kept apart so the import doesn't load the Board
  module). Idempotent on `externalRef` "forge-date:<id>", and a ref already used **even on a deleted
  key date** is skipped, so a date removed in Foundry is never brought back. One-off backfill
  without re-running the plan import: `POST /api/clients/[slug]/forge-import/key-dates`
  `{ apply?: boolean }` (dry run by default, admin-only like the plan import, same per-client lock).
- A remembered "calendar" view opens the Schedule (`parseBoardPrefs`). The month-grid code
  (`wiki-board-calendar.tsx`, `src/lib/wiki-board-calendar.ts` and its tests) is deleted.
- **Known limits:** a Done column sends only its newest 50 cards, so "What happened" for an older
  finished card that fell off the board isn't shown. "Done" comes from `completedAt`; a card
  imported as done with no date has no finish event.

## 129. Recent Changes (November 2026) — A refreshed Portal client page, and a Slack digest that says why

Dan: the Portal client page (`/app/portal/[slug]`, `src/components/clients/client-detail.tsx`) felt
stagnant. Every card was gone over; nothing it could do was removed and no permission changed.

- **Numbers run in sequence.** `portalSectionNumbers` (`src/lib/client-portal-layout.ts`) hands out
  `NN //` in render order from what is shown, so a hidden card (billing, Pulse, studies, notes,
  proof) never leaves a gap. Before: 01–06, 07, 08, 10, 11, 12, 13, 14, 16, 17, 19.
- **01 is a hero:** status as a dot and a word, "Client since", engagement, end date, devs on it,
  links to the website, Drive and the internal Slack channel, and Tasks / Open wiki buttons.
- **Stat tiles count up** (`useCountUp`); **cards rise in one after another** with the new
  `motion-rise` class (docs/motion.md). ⚠️ It uses fill-mode `backwards` on purpose: `FadeIn` (or
  `both`) leaves a transform on the card, which traps any `position: fixed` dialog opened inside it
  (§108.3).
- **No dead space:** Pulse and Studies are compact cards (the latest score leads; an empty card is
  one line and one action) stacked beside Documents, with the last one taking the slack; Meeting
  notes and Designs stretch to the taller of the two; Developers is full width.
- **Developers are cards** (`client-developers-card.tsx`, rules in `src/lib/client-developers.ts`):
  photo or initials, job title, stack, since when, share of time, projects, and "Off until … · X
  covering" / "Covering for …". Leave is matched on the **account** (placement user id against the
  cover's), never a name. Placements now carry `candidateJobTitle`, `candidateStack`,
  `candidateAvatarUrl` (never a `data:` URL) and `candidateUserId`. No rates.
- **Lifecycle is a slim timeline** with **View history**, the house two-column popup over
  everything dated on the client (`src/lib/client-history.ts`: milestones, developers joining and
  leaving, Pulse scans for those who can see Pulse, studies, platforms, designs, links, CRM
  touchpoints). "Client active" with no recorded activation is `ongoing` and shown as "Now", not
  as the date of the record's last edit.
- **Meeting notes** say "Couldn't read" (amber, with a tooltip and Retry) or "Not ready yet",
  never a bare red ERROR (`src/lib/meeting-status.ts`).

**The Slack digest stuck on a failure** (`src/server/slack-activity-digest.ts`). Wedge's card said
"Digest will appear after the first messages are posted" over a busy channel: one failed AI call
(out of credit) was cached as `{ summary: null }` against the message ids, so it stuck until
someone posted. Now only a real summary is cached, an old cached empty one counts as a miss, and
the route returns `reason` `ok` · `stale` · `no_ai_key` · `ai_failed` with `aiError` in plain words
(describeAiError, never the provider's text) and `canRefresh`. The card shows the reason, the
latest four messages, and **Try again** (`?refresh=1`) for people who may use AI.

Verified at `/demo/portal` at 1440 · 1024 · 768 · 390: 0 clipping findings, 0 page overflow, 0
console errors. Dark mode was checked once the demo followed the theme (§131). Not verified against live data: post-deploy, open Wedge and check the Slack card
either shows a digest or says why, and press Try again.

### 129.1 Icons and colour, only where they mean something

Dan's rule for the Portal: an icon says what a thing is, colour says what state it's in, and
neither is decoration. No icons in the mono `NN //` headers, no colour per card, no tinted card
backgrounds.

- **Neutral outline icons** (--text-4) on the stat tiles, the hero's key facts, and every lifecycle
  milestone and history entry (`src/lib/client-history-icons.ts`: decided from the event's id
  prefix and the server's step label; an unknown step gets a clock, never a guess).
- **Official logos only.** Platforms and Designs show the brand's real mark from **Simple Icons**
  (`simple-icons@16.36.0`, CC0, pinned; `src/lib/platform-icons.tsx`, licence and usage rules in
  `docs/third-party-ui.md`). ⚠️ **Never redraw a logo as hand-made SVG paths.** The old
  hand-drawn Apple, Google Play, Amazon, GitHub, Figma, Vercel, Notion, Linear and Slack paths are
  gone. A brand Simple Icons doesn't carry (Slack, Amazon, TestFlight, Featurebase) gets a generic
  outline icon. Hosts match exactly or as a subdomain, never by substring.
- **Brand colour only where it reads on both themes** (≥3:1 against light and dark
  --surface-1, `brandFill`); otherwise the mark is drawn mono in --text-1, the variant every one of
  these brands allows. The tile is a token, so it follows the theme.
- **State colour:** the engagement end date is amber inside 30 days and red (worded "Ended") once
  passed (`src/lib/client-end-date.ts`); a platform's renewal line uses the wiki's rule (amber inside
  a fortnight, red once passed, neutral again after 30 days). Status chip, Pulse score bands,
  meeting-note states and study dots already carried meaning and are unchanged.

**No large gaps, by construction (Dan: "absolutely cannot have large gaps").** Checked on the live
Wedge page after #840: an empty Studies card stretched to Documents' height (~250px empty), ~80px
under four designs, and a ~300px hole on the Developers grid's second row. The rule now is that in
every side-by-side pair **one card sets the row's height and the other fills it**:

- **Meeting notes sets the height; Designs fills it** (`lg:h-0 lg:min-h-full`, so Designs can't
  drive the row). Designs are tiles in a grid whose rows are `minmax(88px, 1fr)`: a few grow to
  fill, many scroll inside the card; two across past three, an odd last tile spans both. A lone
  design gets the big mark. The meeting list fills its card (empty state included) with the pager
  pinned to the bottom.
- **Contact sets the height; Slack fills it** and scrolls its digest inside.
- **Documents runs full width**, and Pulse, Studies and Notes follow full width at their natural
  height. They are never paired with Documents again.
- **Developers wrap in a flex row**: `cardsPerRow` (`src/lib/client-portal-layout.ts`) picks the
  per-row count from how many there are (5 → 3 + 2, 7 → 4 + 3) and every card grows, so a short
  last row stretches instead of leaving a hole; below 240px a card wraps.
- `/demo/portal?shape=dense` is Wedge's shape (5 developers, 4 designs, 49 meetings, 1 scan, no
  studies, 30 documents). Measured before → after at 1440 · 1152 · 1024 · 390: largest empty space
  under a card's content 1932px (Notes beside 30 documents) / 99px (Designs) / 68–87px (Contact) →
  **25px**; developer row hole 327–391px → **0**; side-by-side bottom edges differ by **0px**.

## 130. Recent Changes (November 2026) — HQ: a today band, tidier tiles, quick actions, motion

Dan: the dashboard "needs a lot of love". Every capability, permission gate and role variant is
unchanged (admin bento, developer view, Siân's people-ops tiles, guests, "view as").

- **Today band** (`src/components/dashboard/hq-today-band.tsx`): big figures with a small graphic,
  each a link to its source. My tasks (overdue / due soon / doing bar), Standups today (AM/PM
  rings), Care awaiting reply (longest wait), Pulse health (tier bar), Next meeting (now/next with
  Join). The developer view gets My tasks, **My standup** and Next meeting. ⚠️ It fetches nothing
  new: each tile reads a query a card below already makes (same React Query key), and only shows to
  someone who can see that card. `useClientQueueSummaries(enabled)` gained the switch for this.
- **One tile header** (`tile-header.tsx`, `TileHeader`): every HQ tile wears the same
  `NN // NAME` strip with a brand number, a status and a "View all". Half the tiles drew their own
  in literal hex that didn't flip in dark mode.
- **Numbering** is one running counter including the Agentic workflow card (it was hardcoded 09).
- **Bento:** three tiles a row from `xl`, two from `lg` (`XL_SPAN` / `LG_SPAN`); the desk and
  roll-up sit side by side from `xl` only. At 1024 they squeezed task titles to nothing.
- ⚠️ **No large gaps, by construction** (Dan: "we absolutely cannot have large gaps"):
  - A bento row takes its **shortest** tile's natural height (`rowHeight` in `src/lib/hq-rows.ts`,
    floored 228px feeds / 160px summaries, capped at the band height); taller tiles scroll inside.
    `BentoBand` measures natural heights (cards at auto height, not stretched) on mount, on DOM
    changes and on resize. A fixed height left short tiles mostly empty.
  - Side by side, On your desk is absolutely positioned to fill the row and scrolls inside, so the
    row ends level with the roll-up column however long the desk is; the roll-up flexes to fill.
  - Tile bodies that can be shortened must scroll (`overflow-y-auto`), never `overflow-hidden`,
    or the shorter row hides content.
  - Measured in headless Chrome at 1440/1024/768/390 with a short and a long desk (`/demo/hq` and
    `/demo/hq?desk=long`, 14 overdue): side-by-side bottoms within 0px, empty space under content
    ≤ 48px per card. Data-attribute `data-hq-card` marks every card for that check.
- **Tiles:** Clients show delivery-health dots and team faces; Mail shows people first and folds
  bot/no-reply/newsletter mail behind a remembered toggle (`src/lib/hq-mail.ts`, conservative: when
  unsure it's a person); Calendar leads with now/next and a Join button (`src/lib/hq-calendar.ts`);
  Pulse and Docs draw one proportional bar with counts; Care draws a bar per client.
- **Daily roll-up** is a face grid (one per developer, AM/PM marks under each, pick one for their
  day) instead of a paged list of five. Broadcast is one line.
- **On your desk:** overdue rows have **Done** (with Undo, `useToast().undo`); Doing and Upcoming
  open at three with a remembered "Show more".
- **Colour and icons** (Dan's rule): outline Heroicons only on the today-band labels and actions,
  never in `NN //` headers; colour only for meaning (overdue, waiting, at risk, healthy); charts use
  brand blue for "now/you" and greys for the rest; no tinted card backgrounds; no logos added.
- **Motion:** bento tiles stagger in (`FadeIn`), figures count up (`CountUp` → `useCountUp`), live
  meetings pulse (`StatusDot`), skeletons match each tile's shape.
- **Demo:** `/demo/hq` is HQ as a Super Admin (the account query is seeded in the browser cache; it
  reaches no server), with a roll-up roster fixture. Several tiles crashed on the demo's `{}`
  catch-all (broadcast list, client faces, expenses, HR, agentic card) and now treat a non-list as
  empty.
- **Not verified:** live data. (Dark mode was checked afterwards, §131.)

## 131. Recent Changes (November 2026) — The demo follows the theme, so dark mode can be checked

Every `/demo` page was forced light (it was in `FORCE_LIGHT`, both in `theme-provider.tsx` and the
anti-flash script in `layout.tsx`). So none of the surfaces verified on the demo had ever been seen
in dark, and every PR said "dark mode not verified".

- **`/demo` is out of `FORCE_LIGHT`.** It follows `gitwork.theme.v1` exactly as `/app` does. Client
  deliverables and the sign-in pages stay forced light, unchanged. The demo banner carries the same
  Light / Dark / System `ThemeToggle` as the app's profile menu (rendered once mounted, since the
  mode lives in localStorage).
- **`?theme=dark|light|system` on any `/demo` page** sets the mode, as clicking the switch would (it
  is stored). The anti-flash script applies it before first paint. ⚠️ Demo only
  (`DEMO_THEME_PATHS`, `demoThemeParam`): a link must never change a signed-in person's saved
  preference on `/app`. `src/components/__tests__/demo-theme.test.ts` pins both.
- **Harnesses:** `npm run audit:clipping <url> -- --theme=dark` and `node scripts/baseline.mjs
  --theme=dark` emulate the OS preference and set the stored mode before any script runs.
  `--theme` can't be combined with `--update` (the snapshot is light).
- **What the first dark pass found and fixed** (HQ, `/demo/hq?desk=long`, `/demo/dev`, the portal
  page incl. `?shape=dense` and View history, the wiki dashboard, and the Board, Table, Timeline,
  Schedule and card popup, at 1440 and 390):
  - White text on `bg-[var(--brand-600)]` was **2.6:1** in dark (the brand lifts to `#6BA0FF`): the
    demo tag, avatars, the Schedule's "This week" badge, link buttons, Reply. One global rule in
    `globals.css` now gives it dark ink (`#0B0B0C`, 8:1), the same answer `.app-button-primary`
    already uses in dark and the seasonal themes used for their brands.
  - **Opacity-modified tints** (`bg-red-50/60`, `/50` on red, amber, teal, blue) are separate
    classes, so the dark remaps never reached them and they painted a pale slab under red text —
    the Schedule's Overdue box measured 1:1. Remapped.
  - **Violet, purple, fuchsia, pink and cyan** weren't remapped at all. A Gantt bar coloured violet
    was a light slab on the dark board. Tints, text (`-600`…`-900`) and borders now flip like the
    other families.
  - The wiki hero's small labels (`text-white/35`…`/45` on navy) were 3.2–4.5:1 in **both** modes;
    raised to `/60`–`/65`. The wiki dashboard's monitor status text used fixed hexes (rose 3.9:1 in
    dark); it now uses the palette classes that flip, keeping the hex for the dot.
- After the fixes: 0 text below AA, 0 light slabs, 0 clipping findings, 0 page overflow and no
  console errors on all of those, at both widths. Screenshots in the PR.
- **`/demo/pulse-embed` stays forced light** (added to `FORCE_LIGHT` and the anti-flash script): it
  shows the scanner embedded in Gitwork's own light website, as the real `/embed` is.
- ⚠️ **Not fixed, found by a desktop sweep of the other demo pages** (outside this pass): Docs
  cards use fixed dark hexes for their accent text (1.75–2.55:1 in dark); Backstage calendar
  initials are white on light fills; Monitors' "Acknowledge" is white on `--danger-500` (2.77:1);
  Platform's "6 of 13" chip is light text on a light fill (1.17:1); Studio's type swatch is a
  cream slab. Each wants its own token fix.

## 132. Recent Changes (November 2026) — The repo owns the VPS crontab

Scheduled jobs had drifted for months: foreman, curator and wedge-keepwarm were documented and never
installed, member-purge and crm-sync waited on a hand edit, and `vercel.json` still listed 14 crons
that could run against the stale Neon database. Now:

- **`deploy/crontab` is the schedule.** Every deploy (`deploy.yml`, "Install scheduled jobs on the
  VPS") installs it into the `deploy` user's crontab between `# BEGIN/END foundry-managed` with
  `deploy/install-crontab.sh`: it replaces the old block, removes un-marked duplicates of managed
  jobs (printing each), keeps every other line (the weekly `db-backup.sh`), then reads it back and
  fails the deploy if a managed line is missing or a job runs twice. Before/after go to the log.
  ⚠️ Don't `crontab -e` a managed job on the box: the next deploy undoes it.
- **`crontab.test.ts`** fails if a cron route is neither in `deploy/crontab` nor in
  `UNSCHEDULED_CRONS` (with a reason), if the file names a missing route, or if `vercel.json`
  regains `crons`. `install-crontab.test.ts` runs the script against fixture crontabs.
- **No route was removed:** every one has a live caller or purpose. `retention` is scheduled too (daily since 19 Nov 2026,
  Dan's call): it only tiers Docs view events older than 60 days to cold storage, 200 a run. `pulse-reconcile` moved daily →
  every 15 min and `pulse-run-monitors` daily → hourly (both were daily only for Vercel Hobby).
- **Root's crontab may still run `wedge-keepwarm`.** The deploy user can't touch it, so its
  watchdog now runs under an advisory lock (`src/server/cron-single-run.ts`). The one-line removal
  is in `docs/vps-crons.md`.
- `vps-ops.yml`'s `cron-install-missing` task is gone (it appended un-marked lines).

## 133. Recent Changes (November 2026) — A client's default dashboard (wiki Decision E)

The wiki dashboard was arranged per person only (§66), so a client always opened on the code's
order. The team can now save ONE arrangement per client as its starting layout.

- **Edit → "Save as client's default"** (team, 'Manage clients' + access to the client) stores the
  current arrangement on `ClientWiki.dashboardLayout` (additive Json) via
  `PUT /api/clients/[slug]/wiki/dashboard-layout`. "Clear client default" removes it. There is no
  client route.
- **Precedence** (`effectiveLayout`): a person's own browser layout, then the client's default, then
  the code's. "Reset to default" now goes back to the client's default. Saving drops the saver's own
  copy, so later changes to the default reach them too.
- ⚠️ **The client's copy names only cards it shows** (`scopeDefaultLayout` in `forPublic`, computed
  from `visibleSections`), so a hidden or retired section can't leak its id through the layout. And
  like any layout it only arranges cards the viewer has; it can never add one.

## 134. Recent Changes (November 2026) — A client's bug or feedback goes to Requests (wiki Decision B)

A client could raise a bug as a Board card *and* as a request, so the same thing was filed twice
and triaged in two places. Now Requests is the one door for bugs and feedback; the Board is the plan.

- **The rule is on the server** (`POST /api/wiki/[token]/board/tasks`): a CLIENT writer adding a
  `bug` or `feedback` card gets a Request instead (`addRequestFromBoard` in `src/server/wiki.ts`,
  the same ingest path as the Requests form), named after the signed-in client. Every client path
  gets it: the card dialog, the Table's quick add and paste. The response is
  `{ card: null, request: { id, title } }`; `addBoardCardApi` returns a `BoardAddResult`.
- ⚠️ **When Requests is off for that client it stays a Board card**, so nothing a client sends is
  lost. The team's own adds, and a Gitwork session on the client's page, are never re-routed.
- Screenshots on the card go to the request (`uploadRequestImageApi`); a request holds one, so the
  first is attached and the toast says so.
- The add dialog tells the client before they press Add.

## 135. Recent Changes (November 2026) — Client write routes check the caller can work on that client

§57.6 item 2 said ~113 routes trusted any signed-in session. Re-measured: almost every route has a
guard, under a module's own helper name. The real hole was narrower and worse: **37 write handlers
under `/api/clients/[slug]`** (wiki documents, code handover, course requests, requests and their
comments, links, pages, users, share link, wiki settings, task import) found the client in the
caller's workspace but never asked whether the caller could work on it. A developer assigned to one
client could edit any other client's wiki.

- **`assertClientWriter(req, slug)`** (`src/server/client-write-access.ts`) is now the first line of
  each: Portal's own rule (`assertClientAccessBySlug`). Assigned developers keep their clients;
  `seeAllClients` keeps everything; the trusted API key still passes. Guests are not blocked
  outright, only held to what they were given.
- **`client-writes-check-access.test.ts`** fails on any write handler under `/api/clients/[slug]`
  that calls no client-access guard, so a new route can't skip it. Proved by removing one.
- Not changed: READ handlers under `/api/clients/[slug]` (a separate, lower-risk pass), and the
  public token routes, which have their own posture.

## 136. Recent Changes (November 2026) — Every wiki page opens on the same header

Each wiki page drew its top differently. Now every page but the Dashboard (which keeps its hero)
opens on **`WikiPageHeader`** (`src/components/clients/wiki/wiki-page-header.tsx`): the sidebar
group as a mono eyebrow, the page title in display type, one sentence saying what the page is, and
the page's main action on the right. The content rises in under it on every page change
(`motion-rise`, which only transforms while it plays, so dialogs aren't trapped, §108.3).

- **Titles and descriptions live in one place**, `src/lib/wiki-page-meta.ts`, read by the team's
  wiki and the client's link (each kept its own title map before). Adding a section means adding
  its title and description there; the wiring test checks both.
- **A page puts its action in the header with `<WikiPageActions>`**, a portal into the header's
  right-hand slot, so the action keeps its state in the section's own code. Doc pages (Edit/Done
  and the ⋯ menu) and Comparisons (New table) use it. ⚠️ The slot is never re-keyed; only the text
  block re-animates, or a portal would point at a replaced node.

## 137. Recent Changes (November 2026) — Wiki motion: cards stagger in, figures count up

- **Cards rise in one after another** on every wiki page (`.wiki-motion .widget-card` in
  `globals.css`, 70ms apart, capped at the sixth). The wrapper is the page-content div from §136.
- **Hover is shadow and border only, never a transform.** ⚠️ A transformed card is the containing
  block for a fixed popup opened from inside it, and you are always hovering the card you click
  (§108.3). The rise transforms only while it plays.
- **Dashboard figures count up** with `CountUpText` (`src/components/ui/motion/count-up-text.tsx`):
  the number inside an already-formatted string ("85%", "£1,240") is animated and everything around
  it kept; text with no number is shown as it is.
- ⚠️ **`useCountUp` jumped straight to its target when interrupted**, so React's development
  double-mount, and any figure that changed mid-count, skipped the animation entirely, Portal and HQ
  included. It now carries on from the value on screen. Verified by sampling frames in headless
  Chrome: `0% → 6% → 9% → 12% …`.
- Reduced motion: the stagger delays are cleared too, not just the durations.

## 138. Recent Changes (November 2026) — The wiki page-actions standard

Every wiki page puts its actions in the same place, by these rules (Dan, Nov 2026):

1. **Page-level actions go in the header's right-hand slot** with `<WikiPageActions>`: one filled
   primary button for the page's main job (Add version, Add request, New chart, New table), then
   any secondary buttons, then a `⋯` menu for the rest. Never a separate bar under the header.
2. **Controls that change the whole page go there too**: Metrics' Period/Show, Golf Data's status,
   view and Refresh, Design System's Tokens/Guidelines and Download.
3. **Actions that belong to one card stay in that card's header** (a table's Edit, the Board's own
   toolbar, Monitors' Add monitor inside its card).
4. The one exception is the doc pages' tabs, which switch page rather than act on one.
5. **Adding something opens the house popup from the header button**, never an inline form card:
   Requests' **New request** (a labelled form, Cancel / Add request pinned in the footer) and the
   Board's **Add card**.

- The header lets wide actions wrap onto their own line instead of squeezing the title (the title
  keeps at least 320px; measured at 820 and 1440 on Metrics).
- `WikiPageActions` falls back to an ordinary toolbar where there is no wiki header (the standalone
  Design System page), so an action can never silently disappear.
- Checked by surveying every demo wiki page in headless Chrome for anything between the header and
  the first card: nothing, apart from the doc tabs.

## 139. Recent Changes (November 2026) — Public profiles, and a Staff audit

**Everyone on Foundry can have a public profile at `/u/<handle>`**, LinkedIn substance in a
link-in-bio shape: brand band, photo, name, headline, company, location, bio, link buttons,
About, an achievements timeline and skills, with a small "Profile on Foundry" footer. It animates
in block by block and works in light and dark.

- **Edited in Backstage → Me → Public profile** (`public-profile-card.tsx`): handle (with copy
  link), headline, bio, about, location, LinkedIn, portfolio, more links, achievements. A
  completeness meter names what's missing, to get people to fill it in. Developers' GitHub and
  stack show automatically.
- ⚠️ **Off until the PERSON publishes it.** Only they can switch it on
  (`PATCH /api/staff/me/public-profile`, their own record). Someone managing Staff can take it
  down (`DELETE /api/staff/[id]/public-profile`) and never put it up.
- ⚠️ **The public read is an allow-list** (`SELECT` in `src/server/public-profile.ts`): rates,
  email, clients, placements, notes and HR fields are never selected, and a test checks that. An
  archived record or an archived login has no page; every miss is the same 404.
- **Photos** come from `/api/u/<handle>/avatar` (public, in `PUBLIC_API_PATHS`), which serves one
  person's photo only while their page is live. The normal avatar route needs a sign-in, the
  client-wiki trap again.
- **Not in search:** `noindex` on the page and `/u/` in `robots.ts`. Shared by link.
- **Links are a row of logo tiles with captions**, never stacked full-width rows (Dan). Official
  marks only: Simple Icons via `PlatformMark` (X, Instagram, Dribbble, Behance and Medium were
  added to `platform-icons.tsx`), and LinkedIn's own file at `public/brand/linkedin.svg`, because
  Simple Icons carries no LinkedIn mark (LinkedIn had it removed). Anything else is a globe.
- **Built for phones:** Share profile opens the device's share sheet (copies the link where there
  isn't one), Save contact downloads a vCard with only what the page shows (never email or
  phone), tap targets are ≥48px, long names and URLs wrap, the bottom respects the home-bar inset,
  and the browser bar takes the brand colour. Measured at 320, 375 and 390 (and `?long=1`, the
  awkward-content demo) with 0 overflow.
- Data: six additive columns on `Candidate` (`profilePublic`, `profileSlug` indexed and unique
  across workspaces in code, `profileHeadline`, `profileSummary`, `profileAchievements`,
  `profileLinks`). Rules in `src/lib/public-profile.ts`. Demo at `/demo/profile`.
- **Business card** (like LinkedIn's): the person designs a card in Backstage → Me → Public
  profile (layout · font · colour · pattern, each option drawn as a real thumbnail of their own
  card). With one set, it replaces the page's band header: it tilts to the pointer with a sheen,
  and a tap turns it over to a QR code of the page (`src/components/profile/profile-card.tsx`;
  encoding by the `qrcode` package, only the drawing is ours). Stored as `Candidate.profileCard`
  (additive JSON, null = plain header), read through `readCard` (`src/lib/profile-card.ts`), which
  turns anything unknown into a default. Card colours are fixed hex on purpose (a card looks the
  same in both themes) and a test holds every pair to 4.5:1. Fonts are only the three the app
  already loads. Not built: stickers/doodles on the back, and Apple Wallet (needs a Pass Type ID
  certificate from the Apple developer account).
- **Two layouts, one page.** Below `lg` the page is link-in-bio (card or band, bio, Book a call,
  a row of link tiles ending in Share). From `lg` it is LinkedIn-shaped: a banner in the card's
  colour and pattern, a 152px photo, name, headline, facts and action buttons, then About,
  Experience (an achievement titled "Role, Organisation" is split into the two) and Skills, with
  a sticky sidebar holding the Share panel and every link written out. The card itself is not on
  the desktop page (Dan's call): the banner already carries its colour and pattern.
- **Every profile has a QR code**, card or not: the phone's Share sheet and the desktop Share
  panel (`ProfileSharePanel`) carry the QR, Copy link, Share and Save contact.
- **Book a call:** `Candidate.profileBookingUrl` (additive, http(s) only), set in the editor.
- **Edit profile** shows only to the owner: the page compares the session's user id with the
  profile's login (`publicAvatarUserId`), never anything in the request. `/demo/profile?owner=1`.
- **A fuller profile shows everything it has.** Entries carry a kind (`role` · `education` ·
  `award`; unset reads as a role) and a period (`year`, `endYear`, `current` → "2025 – Present"),
  each kind its own card. `Candidate.profileExtras` (additive JSON, `readExtras`) holds headline
  numbers, featured work, recommendations (word for word, as the person published them) and
  clients worked with. Every section is left out when empty, in both layouts.
- **Wallet passes** (Apple and Google), each OFF until its secrets are set; the button appears only
  then (`walletAvailability`). Setup, step by step: `docs/profile-wallets.md`. Content is pure
  (`src/lib/profile-wallet.ts`), signing is `src/server/profile-wallet.ts`: Apple via
  `passkit-generator` + a `.p12` (Apple's public WWDR G4 is in `src/server/wallet/apple-wwdr.ts`,
  expires Dec 2030), Google via a JWT save link signed with the service account. Google's button is
  its official badge; Apple's badge needs Apple's marketing agreement accepted, so until it's added
  the Apple button is plain text with no Apple mark.

**Staff audit.** Hiring's "Overview" (tier mix, bench, calibre, costs, client coverage) described
the developers you have, not hiring, so it is now **Developers → Insights** (`developers-views.tsx`,
`?view=insights`). Hiring opens on **Pipeline**, which also carries the DevSignal banner;
`/app/staff/hiring` redirects there. Everything else in Staff earns its place: DevSignal's
sub-pages are its settings, Suppliers is HR-only, Archived lives under People, and the
`/app/codeclear/*` redirects keep old links working.

### 139.1 One place to manage yourself, and Admins can edit a page

- **Your own Staff page is the one place you manage yourself.** Backstage → Me and your page on
  Staff (`relation === "self"`) are the same view, and it now also holds **Account** (photo, name,
  password for a password sign-in: `MyAccountCard` in `account-settings-panel.tsx`) and your
  **Public profile**. Settings → Profile points there instead of repeating the form, wherever the
  business has Staff and the person has Backstage. Guests, and businesses without Staff, keep the
  form in Settings.
- **An Admin can edit someone else's public page** from their Staff page: a folded Public profile
  card with **Edit**. One rule, `canEditPublicPage` (`src/lib/hr.ts`): the person, or an Admin for
  anyone below their rank, or a Super Admin for anyone (incl. another Super Admin). Served by
  `GET`/`PATCH /api/staff/[id]/public-profile`; anyone else gets a 404.
- ⚠️ **Publishing stays the person's own call.** An Admin can edit and hide a page but not switch
  it on (`applySave`'s `mayPublish`), so nobody's page goes public without them.
- **Every public profile has its own share image** (`src/app/u/[slug]/opengraph-image.tsx`,
  layout in `src/lib/og/profile-share-card.tsx`): the person's card colour, photo (PNG, cut on
  their focus by `src/server/profile-photo.ts`, because Satori can't draw WebP), name, headline
  and page address. No photo → initials. Slack and LinkedIn keep an unfurl they've already made,
  so a link pasted before this shipped may show the old preview for a while.
- **A wrong GitHub handle can be removed from Staff** (the Overview's Developer switch: "Wrong
  GitHub account? Remove the handle" → `removeGithubHandle` on `PATCH /api/staff/[id]`). A handle
  lists someone as a developer whatever the switch says, so without this a handle naming the
  wrong person (Hassaan's `@hassaan`, a stranger in Waterloo) could only be fixed in the database.
- **…and the person can do it themselves**, which is the normal route. Backstage → Me → Your
  developer details: "Not your account? Remove it" (`removeGithubHandle`, keeps them a developer)
  and "Not a developer? Take yourself off the Developers list" (`notDeveloper`, clears the handle
  too, after a confirm). A blank handle field still never removes one; only these two do. Getting
  back on the list is an admin's call or an invite.
- **A profile page is short and has no gaps** (Dan, 20 Nov 2026: "a super long page is insane").
  - **One banner at the top replaces three repeats** (the header, the Account card and the Public
    profile card all showed the photo and name; Dan, 20 Nov 2026). `staff/profile-banner.tsx`: a
    full-width band in the person's own card colour and pattern (the brand gradient if they have
    no card), photo (camera button on your own), name, role, the record's actions, and two tiles:
    **Public page** (Live/Off, link, Copy, View, Publish) and **Profile** (% complete). **Edit my
    page** opens the sectioned, fixed-height editor popup (`PublicProfileEditor`).
  - **The banner's frame is shared** (`src/components/profile/profile-banner-shell.tsx`:
    `ProfileBannerShell` + `BannerTile`), used by the Staff profile and the Hiring candidate
    profile, so the two can't drift. Name and buttons start 12px below the band. Rare actions
    live in its ⋯ menu, each with its own dialog: on Staff that's Same person as…, Archive… and
    Delete… (only Restore stays a button, on an archived record); on a candidate, Move to
    Bench/Off Bench and Delete…. A candidate's Group, Monthly and Current clients are tiles.
  - ⚠️ **Hide is never a button.** It's in the banner's ⋯ menu and asks first ("Keep it live" /
    "Hide page"). The editor's footer only offers Save and publish, never Hide.
  - Your photo, and your name and password for a password sign-in, are reached from the banner
    (`AccountEditors` in `account-settings-panel.tsx`). There's no Account card any more.
  - **Cards are laid out by `BalancedColumns`** (`src/components/ui/balanced-columns.tsx`): each
    card goes in whichever column is shorter, so both columns end level for every viewer, whatever
    cards they can see. Cards are absolutely positioned in one parent so moving a card never
    remounts it, and a card that grows stays put while the ones after it move. ⚠️ The card
    wrappers carry **no z-index**: one makes the card its own layer, and a dialog opened from
    inside it then sits under On Your Desk (it did, for a day). It re-measures on
    ResizeObserver AND MutationObserver: a background tab draws no frames, so ResizeObserver alone
    left cards on top of each other there. Numbers are given after unseen cards are dropped, so
    they run 01, 02, 03. Measured on the demo: columns end within 75px, no overlaps.
  - The Hiring candidate profile (external candidates) got the same pass: the email sits in the
    header with the other facts instead of a card of its own, and the cards number from 01.
    The public `/u/` page needed nothing: its side column is sticky, so it never shows a gap.

### 139.2 Doc cards: attribute a person in a document

**Copy doc card** on a person's Staff banner (anyone who can see the record, while their public
page is live) puts their card on the clipboard for pasting into a Google Doc (or Word, or Gmail):
- an image, `/u/[slug]/doc-card` (1200×360, shown at 300×90), in their card colour, with their
  photo, name and position (`PublicProfile.position` = the Staff job title, falling back to the
  headline), linked to their `/u/` page;
- then a text line, "Name, Position", also linked, because an image can't be searched or read aloud.

Rules in `src/lib/doc-card.ts` (pure, tested, every value escaped); the drawing is
`src/lib/og/profile-doc-card.tsx`; a demo copy is at `/demo/profile/doc-card`.
- **Nothing is inserted automatically** (Dan's call, 20 Nov 2026: he places cards himself for now).
  Docs export and the Drive backup are unchanged.
- The image route 404s for a page that's off, so a doc never gets a card linking to "not found".
  Google Docs copies the image when it's pasted, so a pasted card is a snapshot; paste again to
  refresh it.
- `StaffProfile.publicSlug` is their live page's address (null when off or archived): the page is
  already public, so any viewer of the record may copy the card.
- Not built: a hover card ("smart chip") for the team via a Google Workspace add-on. That's the
  later layer if the team ends up working in Google Docs daily.

## 140. Recent Changes (November 2026) — The wiki got fast: course requests load on their own

Lighthouse on Wedge's wiki: Performance 60, 1,070 ms blocking time, 861 KB of unused JavaScript.
Three causes, all fixed:

- **Every wiki page downloaded all 5,217 course requests** (2.25 MB, 1.8 MB of it the list, ~0.6 s
  on the server), whatever section was open. The app now asks for the wiki with
  `?courseRequests=0`, which sends `courseRequestCounts` instead (one `groupBy`), and the section
  loads its list from `GET /api/clients/[slug]/wiki/course-requests`. The list's cache key is
  `["client-wiki", slug, "course-requests"]`, under the wiki's, so every existing wiki refresh
  (edits, import, the Big Wedge sync) refreshes it too. ⚠️ A caller that doesn't pass
  `?courseRequests=0` (the iOS app, the public share page) still gets the full list.
- **Batch status and delete were one request per row**, each refetching the whole wiki: marking
  1,000 requests sent was 1,000 saves and reloads. Now `PATCH`/`DELETE
  /api/clients/[slug]/wiki/course-requests` ({ ids, status }) do one scoped `updateMany`/
  `deleteMany` (another client's ids are ignored).
- **The section drew every row twice** (table + phone cards). It draws `PAGE_SIZE` (100) at a time
  with "Show more"; select-all still means the whole view, and the batch bar says how many.
- **Every section's code shipped with the wiki.** Sections and dialogs in `wiki-workspace.tsx` are
  `next/dynamic` now, so only the open section's code loads. The dashboard stays static (it's the
  landing page).

Also: the wiki draws its own frame, so it now has its own `<main>`; the course request row
checkbox has a label; `browsing-topics` left the Permissions-Policy header (Chrome no longer
recognises it and logged an error on every page). Not changed: the SEO "blocked from indexing"
finding, which is deliberate for `/app`.

### 140.1 The Board, and the client's share page

- **The Board's cards left the wiki too** (~250 KB on every page). The wiki sends
  `board` with no lanes and a `summary` (`src/lib/wiki-board-summary.ts`: items, cards, waiting,
  approved, changes); `?board=0` on the team's wiki, `{ board: false }` for `resolvePublicWiki`.
  The Board loads its cards through `BoardCards` (`board-cards.tsx`, `useBoardCards`) from
  `GET /api/clients/[slug]/wiki/board` or `GET /api/wiki/[token]/board` (client's copy, same
  access as every Board read). ⚠️ Read the summary with `boardSummaryOf`, never `lanes`: the
  client-section check and the dashboard card both do.
- **The share page is light as well**: no course requests, the Board summary only, sections load
  on demand, and the tab title comes from `resolvePublicWikiMeta` (it used to build the whole wiki
  a second time just for the title).
- ⚠️ **Security fix:** the share page's course request routes checked only the link token, so
  anyone holding a Wedge share link could edit or delete requests without signing in. They now
  require a signed-in client user of the wiki or this client's own team, a link for the whole
  wiki or for Course Requests, and a rate limit (`src/server/wiki-course-request-access.ts`).
  `PATCH`/`DELETE /api/wiki/[token]/course-requests` change many in one write.

## 141. Recent Changes (November 2026) — Needs you, and Money

The first slice of "go deep, not wide" (Dan, Nov 2026). Rules for this programme: **no new Prisma
models**, simplicity first, money for Dan, Harry and (maybe) Siân only.

### 141.1 Needs you (HQ card 01)

One ranked list of what every watcher found, so nobody visits five pages to learn what's on fire.
Rules in `src/lib/needs-you.ts` (pure, tested), reader `src/server/needs-you.ts`, route
`GET /api/hq/needs-you`, card `src/components/dashboard/needs-you-card.tsx`.

- **Sources, each gated and scoped exactly like its own page:** Monitors (`monitors`; production down
  = critical), Foreman's latest risks (Admin+; blind spots left out), Care (`support`; a customer
  waiting 24h+, red at 72h), new client Requests (`clients`, scoped to the caller's clients), stalled
  Docs (sent and read with no decision, or never opened, after 5 days) and Pulse projects needing a
  look. Docs and Pulse only for people who see every client, because those lists aren't scoped.
  Workspace modules are respected.
- **Read independently** (`Promise.allSettled`): a failed source is named ("Couldn't check Care"),
  never turned into "nothing to do". All clear names what was checked.
- **Suggested, never acted on:** every row links to where it's dealt with.
- **Hide until tomorrow** per browser (`foundry.needsyou.hidden.v1`, with Undo). A hidden row comes
  back early when its fingerprint changes (it got worse). ⚠️ A critical row can't be hidden.
- Refreshes every 2 minutes. Desk numbering shifts by one (Needs you is 01).

### 141.2 Money (`/app/money`)

Revenue under contract, still to bill, won in 12 months, pipeline, revenue by month (12 back, 6
forward), per client, and deals. Rules `src/lib/money.ts` (pure, tested), reader
`src/server/money.ts`, route `GET /api/money`, page `src/components/money/money-workspace.tsx`.

- ⚠️ **Gate:** Super Admins and `clients.viewFinancials` only, checked on the page (live membership,
  404 otherwise) and the route (403). `/app/money` is in `UNGATED_APP_PREFIXES` because Siân holds
  the permission without Portal; it belongs to the `clients` workspace module. Linked from the HQ
  context strip (· MONEY) for those people only.
- **Model, with no new data:** an accepted (or DocuSeal-signed) document with cost lines is a
  revenue schedule. Role lines (`rate-card:` / `proposal-role:` / `custom-role:`, the cost table's
  rate × months) earn their monthly rate for `quantity` months from the month won; other lines are
  one-offs that month; a `RECURRING` line runs on (counted 12 months in totals). After discount,
  without VAT. ⚠️ Keep `ROLE_LINE_PREFIXES` in step with `cost-breakdown-table.tsx`.
- **It is what the documents commit to, not invoices.** The page says so. A proposal and an SOW for
  the same job are both counted if both were accepted.
- **FX:** `loadFxRates` in `src/server/fx.ts` (ECB via Frankfurter, 12h fetch cache). No rate means
  the amount is left out of totals and listed, never guessed.
- **The rate card is cost** (Dan, 20 Nov 2026). **Team cost** is what the developers on a client
  cost per month at rate-card rates (`computeClientFinancials`), and **margin** is this month's
  revenue under contract less it, per client and overall (`MoneySummary.margin` / `marginShare`).
  Developers with no rate are left out and the page says how many.
- "Copy as an update" puts a few plain lines on the clipboard for an investor update.
- Demos: `/demo/hq` (Needs you) and `/demo/money`, both through the real rules
  (`src/lib/demo/demo-money.ts`).

### 141.3 Record a deal (prices that didn't come from Docs)

Money → Deals → **Record a deal** (`src/components/money/record-deal-dialog.tsx`, rules
`src/lib/money-deals.ts`, server `src/server/money-deals.ts`). Drop a PDF/Word/text file and the
workspace AI proposes the figures (`POST /api/money/read-file`, needs `ai.generate`, saves nothing),
or type them. **Save** (`POST /api/money/deals`) creates an ACCEPTED `PROPOSAL` document labelled
"Recorded deal" with `metadata.recordedDeal` and cost lines written so `docTerms` reads them back as
the same schedule. No new model.

- ⚠️ **Every amount read from a file is checked against the file's text** (`amountInText`); one that
  isn't written there is outlined amber and named in a note. The reader is told never to invent,
  add up or guess a date. A person confirms before anything is saved.
- **The file is not kept**, only the confirmed figures (and its file name).
- Client matching is by name among the workspace's clients, never guessing between two.
- **To take a deal out, archive its document in Docs:** Money skips archived documents.
- Money viewers only (`clients.viewFinancials` or Super Admin), on both routes.

### 141.4 Achievements (gamification that rewards keeping Foundry true)

Your own Staff page (Backstage → Me) has an **Achievements** card; HQ announces a newly reached
tier with a toast. Rules `src/lib/achievements.ts` (pure, tested), reader
`src/server/achievements.ts`, route `GET /api/me/achievements` (your own only, no route for anyone
else's), card `src/components/achievements/achievements-card.tsx`, toast `celebrate.tsx`. The
confetti moved to `src/components/ui/motion/confetti.tsx` (the Morning Brief uses it too).

- ⚠️ **The design rule: reward what keeps Foundry true, never activity.** §67 measured 583 of ~720
  done tasks being created and closed the same day, so "tasks done" is NOT an achievement and must
  not become one. v1 is standup streak (leave and bank holidays never break it; today only counts
  once posted), **on the plan** (planned tasks that existed before the day they were finished),
  **on time**, and **deals won**. Each has bronze/silver/gold.
- **Earned, never stored:** all derived from DailyUpdate, LeaveRequest, Task and Document rows.
- **Personal, not ranked:** no leaderboard. Never shown to anyone but the person.
- A browser that sees someone's achievements for the first time only remembers them
  (`foundry.achievements.celebrated.v1`), so nobody gets confetti for months-old work.
- Not built yet: team goals, Care replies (SupportMessage has no author user), showing achievements
  on the public profile (needs the person's opt-in).

## 142. Recent Changes (November 2026) — The client timeline, the weekly update, and ⌘K across records

Built from the "go deep" plan (§141). No new Prisma models.

### 142.1 Timeline (Portal client page)

A `NN // TIMELINE` card under Developers: what happened on the client's work, week by week, and
where things stand now. Rules `src/lib/client-delivery-timeline.ts` (pure, tested), loader
`src/server/client-delivery-timeline.ts`, route `GET /api/clients/[slug]/delivery-timeline?weeks=`
(client access checked), card `src/components/clients/client-delivery-card.tsx`.

- **Sources:** tasks finished, started and blocked (top-level only); changelog releases; client
  requests; meetings (first sentence of the summary); monitor incidents (with how long they lasted);
  documents sent and accepted. Each is read on its own; one that fails is named on the card (§35).
- **Weeks start Monday, UTC**, and an empty week shows as "A quiet week", never dropped.
- **Now panel:** waiting on the client (unanswered blockers, releases waiting for approval), the
  next release with progress, in progress, up next.
- ⚠️ **Internal only.** It names developers, so it is never part of a client-facing DTO.
- **Checked against Campfire's real board (Nov 2026), three fixes:**
  - **A board tidy-up is not work.** Nine tasks created in June were closed in the same second on
    3 Nov with nobody on them, and read as "9 done" (and would have gone into the weekly email).
    `findTidyUps` marks a batch only when 3+ tasks share the exact `completedAt`, none was started
    before it was closed, and all were created 14+ days earlier; it shows as one "Tidy-up" line and
    isn't counted as done. A developer closing four real tasks at once stays as work.
  - **A late task says so.** In progress and Up next show `dueWords` ("3 days late" in red,
    "due today", "due 24 Nov"), by calendar day, never by hour.
  - **Two or more quiet weeks in a row fold into one line** (`foldQuietWeeks`); this week never folds.

### 142.2 Weekly update (the Friday email)

**Weekly update** on the Timeline card drafts the email Dan sends clients (modelled on his Campfire
and Gaia emails), in the house two-column popup: the draft to edit on the left, what it was written
from on the right. Rules `src/lib/weekly-update.ts`, server `src/server/weekly-update.ts`, route
`POST /api/clients/[slug]/weekly-update { week: "this"|"last", regenerate? }`.

- **Drafted, never sent.** Copy, or **Open in Gmail** (a compose link with the draft filled in, to
  the client's primary contact and wiki users).
- One standard-tier AI call, cached on the week's facts (£0 to reopen), told to use only the facts.
  A reply that describes finished work in a quiet week is thrown away. Without AI, no permission or
  a failed call, the **plain draft** is used and the reason is shown.
- The style rules live in `WEEKLY_UPDATE_SYSTEM`: greet by first name, lead with what got done and
  what it means for the client, group by workstream, what's next, "What we need from you", no em
  dashes, "Have a great weekend," on a Friday.

### 142.3 ⌘K searches records

`GET /api/search?q=` (`src/server/global-search.ts`, rules `src/lib/global-search.ts`) searches
tasks, client requests, meetings, Care conversations and people. Each group only for someone who can
open it: tasks/requests/meetings need Portal and are limited to the person's clients; Care needs
`support`; people need Staff; workspace modules respected. Every word must match. A group that fails
is named in the menu ("Couldn't search care just now"), never shown as no results.

- The vendored EasyUI menu gained `hint`, `onQueryChange` and `note` (recorded in its header).
- **Care links to one conversation** now: `careHref({ clientId, conversationId })` →
  `/app/care?client=…&conversation=…` opens it.

### 142.4 Infrastructure audit

Done in November 2026 and shared with Dan privately. ⚠️ **Not committed, on purpose: this repo
is public**, and an audit lists exactly what an attacker would want. Keep future audits and
incident write-ups that name a live weakness out of the repo until the weakness is fixed.

## 143. Recent Changes (November 2026) — Deploys check themselves, and can be undone

Four fixes from the November infrastructure audit (the audit itself stays out of the repo, §142.4).

- **Health check after every deploy, with automatic rollback.** Before pulling, `deploy.yml` tags
  the running image `:previous`. After the restart, `deploy/health-check.sh` polls
  `http://127.0.0.1:3000/api/health?deep=1` for up to 120s and needs the deployed commit in the
  answer. Not healthy → `:previous` is put back, recreated and checked, and the run fails.
  `docker image prune -f` runs only after a healthy release, so `:previous` always survives.
- **`/api/health?deep=1`** runs `SELECT 1` and answers 503 when Postgres can't be reached; the plain
  form still never touches the database. (The watchdog still calls the plain form.)
- **One-click rollback:** Actions → VPS ops → task `rollback`, `rollback_to` = `previous` or a full
  40-character sha (GHCR keeps every `:<sha>` image). `deploy/rollback.sh` puts the running image
  back if the target isn't healthy. It shares the `deploy-production` concurrency group, so it can't
  race a deploy. ⚠️ It doesn't touch the database (schema changes are additive), and the next push
  to `main` deploys over it. The scripts are also copied to `/opt/apps/foundry/deploy/` on every
  deploy, so `bash deploy/rollback.sh previous` works over SSH too.
- **The app port is localhost only** (`127.0.0.1:3000:3000`). On every interface, anyone could
  skip nginx and TLS and send their own `X-Real-IP`, which every IP rate limit trusts; Docker
  publishes past ufw. Staging's 3001 and 5433 are bound the same way.
- **Logs are capped:** `json-file` with `max-size 50m` × 5 on both containers, and
  `/tmp/foundry-cron.log` is trimmed to its newest 10 MB once it passes 50 MB, on every deploy.
- **The box's `docker-compose.yml` now follows the repo** (`deploy/sync-compose.sh`, run before the
  pull). It is replaced only when its sha256 is in `deploy/compose-history.sha256`; a hand-edited
  box file is left alone with a warning and a diff, and the old file is kept as
  `docker-compose.yml.before-deploy`. ⚠️ **Changing `docker-compose.yml`? Append its new sha256 to
  `deploy/compose-history.sha256`** (a test fails otherwise). A logging change recreates the db
  container on that deploy: a few seconds of Postgres restart.
- Tests: `src/__tests__/deploy-scripts.test.ts` (fake `docker`/`curl`), `src/app/api/health/__tests__`.
- **Still needs Dan:** off-site backups (a bucket), and error alerts (a Sentry DSN or Slack webhook).

## 144. Recent Changes (November 2026) — The platform tells us when it needs a look

Round two of the infrastructure audit. Each alert goes to Gitwork's admins in Foundry
(`system.ops_alert`, in-app + push) and, once `SLACK_OPS_WEBHOOK_URL` is set (a GitHub secret,
synced by `deploy.yml`), to that Slack channel (`src/server/ops-alert.ts`). Markers live in
`RateLimitHit` rows under `system:<name>` (`src/server/system-markers.ts`), so no new table.

- **Stopped scheduled jobs.** Every authorised `/api/cron/<name>` call records when it ran
  (`assertCron`). The `jobs` worker compares that with `CRON_MAX_GAP` (`src/lib/cron-watch.ts`)
  and alerts once per stopped job, then once when it runs again. A job never seen counts from when
  the watch began, so the first deploy reports nothing. ⚠️ **A new line in `deploy/crontab` needs a
  `CRON_MAX_GAP` entry** (`crontab.test.ts` fails otherwise). The `jobs` worker itself is watched
  from outside: `/api/health?cron=1` answers 503 naming any stopped job, and `foundry-watchdog.yml`
  now probes that URL.
- **Disk.** Hourly from the `jobs` worker (`src/server/disk-watch.ts`): alerts at 80% used, clears
  below 75%, and names the database's size.
- **Database growth.** One size reading a day (`recordDaily`, kept 14 days in `RateLimitHit` rows
  as `system:series:db-size:<bytes>`). Alerts when it grew 25% and 1 GB+ in about a week
  (`weeklyGrowth`, compared with the reading 6–8 days old), clears under 10%. Says nothing in the
  first week, when there's no old reading to compare.
- **Memory.** The app is capped at 6 GB (`mem_limit`), sized from the box (24 GB; app peak
  715 MiB, Postgres 523 MiB, 20 Nov 2026), and the db container has `oom_score_adj: -500`, so the
  app is killed and restarted alone before it can starve Postgres. VPS ops → `inspect` now prints
  memory, container peaks and OOM kills: re-measure there before changing the cap.
- **`run-cron.sh` is in the repo** (`deploy/run-cron.sh`). Each deploy runs the new copy against
  `jobs` and only installs it at `/opt/apps/foundry/run-cron.sh` when that works. The secret goes
  to curl on stdin, never argv.
- **Off-site backups, off until configured** (`src/server/db-backup.ts`, cron `db-backup` daily
  03:45). `pg_dump -Fc` → `pg_restore --list` → AES-256-GCM → one PUT to its own bucket. Needs
  `BACKUP_S3_BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY` (+ `BACKUP_S3_ENDPOINT` for non-AWS)
  and `BACKUP_ENCRYPTION_KEY` (`openssl rand -base64 32`; ⚠️ keep a copy outside Foundry, without it
  no backup can be read). With none set it answers `{ skipped }`; half set is an error and alerts.
  Restore: `scripts/decrypt-backup.mjs`, then `pg_restore`. Retention is the bucket's lifecycle
  rule. Refuses over 1 GB (one PUT, buffered); multipart is the next step past that.
  The runner image now installs `postgresql17-client`.
- **Server errors to Slack** (`onRequestError` in `src/instrumentation.ts` →
  `src/server/error-alerts.ts`): only while `SLACK_OPS_WEBHOOK_URL` is set. One post per distinct
  error an hour, at most 10 an hour, with the route template, method, error type/code, digest and
  the first line with emails and long numbers removed. Never the real path. `src/app/global-error.tsx`
  is the page shown when the root layout itself fails.
- **Platform popup on Monitors** (`src/components/monitors/platform-health.tsx`): a small
  "Platform" button with a coloured dot in the STATUS header opens the house two-column popup:
  scheduled jobs, disk, database size and growth, the app's memory (from its cgroup), backups and
  Slack alerts. Rules in `src/lib/platform-health.ts`: a part that couldn't be read is "Couldn't
  read", never fine. ⚠️ **Platform admins only** (`GET /api/monitors/platform`,
  `requirePlatformAdmin`): it describes the server every business runs on. The popup is
  portalled to `<body>` because the button sits inside the page's FadeIn (§108.3).
- **Next.js 15.5.29** (security release).
- **The box's compose file** was the old repo file minus one comment; its hash is now in
  `deploy/compose-history.sha256`, so the next deploy applies §143's port and log fixes.

## 145. Recent Changes (November 2026) — Every scheduled job ran an empty script for two days

From 20 Nov 23:34 to the fix, **no scheduled job did anything**: no uptime checks (Monitors read
"45 services not being checked", last result two days old), no `jobs` worker, Pulse jobs, Wedge
course feed, digests or backups. The watchdog was right all along; #894's "the jobs are running"
was read from a cron log that had stopped changing.

- **Cause.** #890 moved `run-cron.sh` into the repo, and `deploy.yml` base64s it into the SSH
  step, but the deploy job's **sparse checkout** never listed `deploy/run-cron.sh`. `base64` failed
  inside `$(…)`, an empty string was shipped, and the box installed a **0-byte**
  `/opt/apps/foundry/run-cron.sh` (sha256 `e3b0c442…`). An empty script is executable, exits 0 and
  prints nothing, so every cron line "succeeded", and the smoke test, which only checked the exit
  code, passed it. Every later deploy said "unchanged": empty matched empty.
- **Fixed in three places, each with a test** (`deploy-scripts.test.ts`, `install-crontab.test.ts`):
  the file is in the sparse checkout, and a test fails if anything encoded isn't; the encode step
  fails on a missing or empty file; the smoke test needs the runner's own `jobs HTTP 2xx` line;
  `install-crontab.sh` refuses an empty runner, or one that doesn't call `/api/cron/`.
- **Refresh on Monitors runs the checks.** It only re-read the database, so it reloaded the same
  stale rows. `POST /api/monitors` (same gate as GET) runs this workspace's overdue checks after
  answering (`runDueMonitors({ workspaceId, prune: false })`, one run per workspace at a time) and
  the page re-reads at 3, 11 and 26s. A red line under the headline says when nothing has been
  checked for 10 minutes: "not checking" on every card didn't say the scheduler had stopped.
- **`VPS ops → inspect`** now shows disk, mounts, file owners and sizes, runner hashes, whether
  the log can be appended to, the cron daemon, and one call of `run-cron.sh wiki-monitors` exactly
  as cron makes it. That is what found the 0-byte file. It prints no file's contents.
- ⚠️ **A file the deploy ships must be in its sparse checkout.** Add it to both lists, or the test
  fails.

## 146. Recent Changes (November 2026) — The course backend logged in at the wrong server

Wedge keep-warm and the Golf Data console failed every run with "Login to
https://apiv1.bigwedgegolf.com/api/v1/auth/token/ failed (check WEDGE_COURSE_API_USER/PASSWORD)",
recorded as a bad credential since October (§60). The host in that message was the clue: it is the
Big Wedge **app** API, not the course backend (`wedge-course-backend.vercel.app`).

- **Cause.** `resolveCourseApi` (`src/server/bigwedge-course-api.ts`) took its base URL from
  `WEDGE_COURSE_API_URL`, else **the Care "Analytics API" connector**, else the course backend.
  That connector is the app API, so the course backend's credentials went to the app's login.
- **Fix.** The course backend's URL is `WEDGE_COURSE_API_URL` or the deployed backend, never the
  connector, and the connector's admin JWT is no longer sent to it either. A failed login now names
  its HTTP status (401 = wrong password, 404/405 = wrong host). Tests:
  `src/server/__tests__/bigwedge-course-api.test.ts`.
- ⚠️ If the keep-warm still fails after this, read the status. **401** means the credentials
  really are wrong, and Dan has to set them. Anything else means the host or path is wrong.
- **Found on the way: a deploy could fail at random at "Install scheduled jobs".** Under
  `set -o pipefail`, `printf "$AFTER" | grep -qxF "$line"` reports a line that IS there as missing
  when `grep -q` exits at its first match and the `printf` is SIGPIPE'd (exit 141). Reproduced 1
  run in 40 under load, 0 in 200 after. `install-crontab.sh`, `health-check.sh` (where a false
  "unhealthy" would roll back a good deploy) and `rollback.sh` now use here-strings, and
  `deploy-scripts.test.ts` fails on any `| grep -q` in a pipefail deploy script.

## 147. Recent Changes (November 2026) — Updates: the weekly email, published to the client's wiki

A client-wiki section, **Updates** (id `updates`, group Overview), so the client has the record of
what they were told and what happened, in one place they can always open. Dan's ask: "build weekly
report and timeline in clients wiki".

- **Two things on one page.** `01 // WHERE THINGS STAND` (waiting on you, next release, in
  progress, up next) and `02 // WEEK BY WEEK`: each week's published update, as sent, with "What
  happened this week" folded under it; a week with no update shows what happened. Runs of quiet
  weeks fold into one line. The team sees exactly the client's page, plus **Write this week's
  update** and **Unpublish**.
- **Publishing.** The weekly update dialog (Portal Timeline card, §142.2) gained **Publish to
  wiki**: the subject and body as edited there, frozen in `WikiWeeklyUpdate` (additive, one per
  wiki per week, enforced in code; replacing a week overwrites it; unpublishing archives, never
  deletes). Publishing switches the section on. Needs 'Manage clients'.
- **The timeline is the client's copy, cut at two layers.** `loadDeliveryTimeline(…, { audience:
  "client" })` reads only meetings shared with the client (`sharedWithClientAt`), outages on
  production services, and documents that were sent. Then `forClientTimeline`
  (`src/lib/wiki-updates.ts`, pure, tested) drops every developer's name, board tidy-ups, the
  contacts' emails and every `/app` link. The published update shows the author's first name only.
- **Loaded on its own (§140):** the DTO carries `updates: WikiUpdatesSummary` (flag, count, latest
  subject) for the nav, the dashboard card and the visibility rule; the page reads
  `GET /api/clients/[slug]/wiki/updates` (team) or `GET /api/wiki/[token]/updates` (client: the
  Board's read posture — section on, per-section link for Updates, signed-in client user or this
  client's team, read rate limit). The token route has no write method; the wiring test pins it.
- The client sees the section when it's on AND there is a published update or a plan to describe.
- ⚠️ **Overlap, deliberately left:** RoundUp is a live "last seven days" summary of
  the plan only; Delivery is the plan's progress. Updates is the frozen record plus everything
  else that happened (releases, requests, meetings, outages). Folding RoundUp into Updates is a
  reasonable later tidy-up.
- Demo: `/demo/wiki#updates` (publish and unpublish work in memory).

## 148. Recent Changes (November 2026) — Phase 0: restore test, staging, browser smoke tests

The last of "Phase 0" of making releases safe: a backup is proven restorable, a branch can run on
real infrastructure before `main`, and the signed-in app is opened in a browser on every PR.

### 148.1 Monthly restore test of the off-site backup

`src/server/db-restore-test.ts`, cron `db-restore-test` (the 2nd of the month, 05:15; route answers
`{ started }` at once and works in `after()`, under `runOnce`, because a restore can outlast
`run-cron.sh`'s 330s). Rules are pure in `src/lib/db-restore-test.ts`.

- Lists this month's and last month's backup folders (S3 ListObjectsV2; `signS3Request` gained a
  `canonicalQuery`, `canonicalQueryOf` builds it), picks the newest of OUR keys, and fails if it is
  over 3 days old (the daily backup has stopped).
- Refuses to start without disk for a second copy plus 2 GB, or if it can't read the disk.
- Downloads, decrypts streaming (`decryptBackupFile`, the reverse of the backup's format),
  `pg_restore --list`, then `DROP … WITH (FORCE)` / `CREATE DATABASE foundry_restore_test` and
  `pg_restore --no-owner --no-privileges --exit-on-error` with libpq variables (no password in argv).
- Counts eight core tables (`RESTORE_CHECK_TABLES`) in the copy and in production; a missing or
  empty table, or a difference over max(200 rows, 15%), fails. Then the copy is always dropped.
- ⚠️ **The throwaway name is a fixed constant**, asserted before every create or drop and refused
  outright if the live database already has that name. Production's data is only read.
- Pass → marker `db-restore-ok` (and a "passes again" alert after a failure). Fail → marker
  `db-restore-failed` + `sendOpsAlert` with the reason. Off (`{ skipped }`) with the backup;
  half set is an error.
- **Platform popup:** a "Restore test" row: off, not run yet (attention), passed, failed or
  overdue (no pass in 35 days). `CRON_MAX_GAP` gives it 32 days.
- Verified end to end against a local Postgres and a fake bucket: the real `runRestoreTest`
  listed, downloaded, restored, matched the counts, recorded the marker and dropped the copy.

### 148.2 Staging

`.github/workflows/deploy-staging.yml` now runs **only when dispatched**, with a `ref` (branch, tag
or sha) and an optional `seed`. It builds that ref as `:staging` / `:staging-<sha>` (never
`:latest`) and runs `deploy/staging-deploy.sh` on the box, which refuses to do anything unless the
directory is `foundry-staging`, the staging `.env`'s `DATABASE_URL`/`DIRECT_URL` point at
`@db:5432/foundry_staging`, and the compose file is staging's (project, container, image, port
`127.0.0.1:3001`, no production name). Every Compose command is pinned to `-p foundry-staging`;
it health-checks the exact commit on 3001 with `deploy/health-check.sh`; `seed` calls the existing
`/api/dev/seed-*` routes with staging's own `API_KEY` on stdin. `docker-compose-staging.yml` gained
`name: foundry-staging`, a 2 GB app cap, a high OOM score for its database and log rotation.
`deploy/nginx/staging.conf` puts `staging.foundry.gitwork.co.uk` behind a password. Dan's one-time
steps (DNS, `.env`, Google redirect URI, nginx + certbot) are in `docs/staging.md`.
Tests: `src/__tests__/staging-deploy.test.ts`.

### 148.3 Browser smoke tests on /app

`scripts/smoke.mjs` (`npm run test:smoke`, CI job `smoke`): seeds `foundry_smoke` with the isolation
suite's two businesses (`scripts/smoke-db.sh`, `tests/smoke/seed.ts`), starts the production build,
mints an Auth.js session cookie with the server's own `AUTH_SECRET` (no test-only route in the app),
and opens ten `/app` pages at 390 and 1440px: 200 on its own URL, no uncaught or console error, no
"Application error", a visible h1, no sideways scroll. ⚠️ The shell has two h1s (phone and desktop),
one hidden at each width, so the check takes the visible one. Details: `docs/build-checklist.md` §4c.

## 149. Recent Changes (November 2026) — Care has one UI

Asked to retire Care's legacy `/app/support` dashboard. **That had already happened**: #850
(`7adab0d`, 19 Nov 2026) deleted `support-dashboard.tsx` and moved every capability into
`src/components/care/`, and §42.16 (`docs/history/2026-08-august.md`) is the full record. This
pass checked the move against the deleted file, closed the gaps it found, and corrected the last
docs that still described two UIs.

**Where each legacy capability lives now** (checked against `7adab0d^`, hook by hook):

| Legacy (`support-dashboard.tsx`) | Now |
|---|---|
| Add client (`AddClientModal`) | Care home, `care-add-client.tsx`, behind `canManageSupport` |
| Inbox (`InboxView`, filters, triage) | The cockpit queue, `client-cockpit.tsx` + `conversation-detail.tsx` |
| AI semantic search | The cockpit's search box, sparkle toggle (`useSemanticSearch`) |
| Health score (`HealthBadge`) | Cockpit header, `care-shared.tsx` |
| Reports (`ReportsView`, `ReportBuilder`, support days) | Reports section, `care-reports.tsx`; printable at `/app/care/reports/[id]` |
| Connectors (`ConnectorsView` and its modals) | Channels & settings, `care-connectors.tsx` |
| Workflow rules, AI agents, agent log, Portal link (`SettingsView`, `AgentsView`) | Automation section, `care-automation.tsx` |
| Tickets (`TicketsTableView`) | **Retired on purpose** (§42.16): nothing wrote a ticket. Tables and write routes kept |
| `SubredditView` | Was never mounted in the legacy page; not ported |

**Added here:**
- **`/app/support/[...rest]`** redirects any other path under the old dashboard the way the bare
  `/app/support` does (query translated and carried across). `care-unified.test.ts` now fails if a
  page under `/app/support` is anything but one of the three stubs.
- **`/demo/care` can show the moved screens.** Reports, workflow rules, the agent log, the health
  badge, the performance strip and AI search all fell through to the demo's `{}` catch-all, so they
  rendered empty. `src/lib/demo/demo-care.ts` answers them, with reports and rules held in memory
  so add / edit / delete / restore defaults can be driven. AI search there ranks by shared words
  (`rankDemoSemantic`), since the demo has no embeddings.
- ⚠️ **`?client=` meant two things on `/demo/care`.** The demo shell reads it as the white-label
  brand; Care writes it into the address bar as the client id. Reloading a Care deep link renamed
  the whole demo "sup-northwind" and kept it in localStorage for every other demo page.
  `demoBrandParam` (`src/lib/demo/demo-brand-param.ts`) leaves the parameter to Care there.
- "1 closest matches" in the AI search header now reads "1 closest match".

**Verified:** `/demo/care` home, queue, AI search, reports, automation and settings at 390, 768,
1280×620 and 1440, light and dark: 0 clipping findings, 0 sideways scroll, 0 console errors.
Not verified: the redirects against a signed-in session (they are pure and unit-tested in
`care-links.test.ts`), and the printable report page, which needs a database.

## 150. Recent Changes (November 2026) — Projects, and budget vs actual

A client used to be the only thing tying work together, so a piece of work (proposal → plan →
board → releases → handover) had no record of its own, and nobody could say whether it was on
budget. Dan approved a new table for it.

- **Model `Project`** (additive): client, name, status (`PLANNED · ACTIVE · ON_HOLD · DONE`,
  a string validated in code by `PROJECT_STATUSES`), start date, optional end date, optional
  `documentId` (the accepted proposal or SOW), an optional typed budget (`budgetAmount` +
  `budgetCurrency`), `archivedAt`. Relations to `Workspace` and `WorkspaceClient` (cascade).
  Archived, never deleted.
- **`projectId` on `Task`, `ClientRelease` and `FeatureBlock`**: nullable, indexed, **loose ids,
  no FK**. A project is never hard-deleted, so there is nothing for a FK to clean up; three hot
  tables each get one nullable column and an index; and the rule that matters (same client,
  project still live) can't be a FK anyway. It is checked in code on every write
  (`assertProjectInClient`, `src/server/projects.ts`): the task routes, the release routes and
  the project's own category list. A link to an archived project just stops counting.
- **Budget is derived, never stored, when a document is linked**: the document's cost lines
  through Money's own `docTerms` (role lines are rate × months, the rest one-off, after
  discount, without VAT). The document must be on the same client, not archived, and accepted
  or signed. A typed budget is used only with no document, and saving a document clears it.
  When the linked document stops giving a budget (archived, no costs) the page says why rather
  than showing £0.
- **Budget vs actual, derived every time** (`src/lib/project-budget.ts`, pure, tested):
  - **Spent so far** = the developers placed on the client over the project's dates up to today,
    at rate-card rates (the rate card is cost, as on Money and Portal: `normalizeToMonthly`,
    pro-bono left out, an archived or missing rate = unpriced). Each monthly rate is spread over
    that calendar month's weekdays, and the project is charged for the weekdays each developer
    was placed inside its dates. One developer is never charged twice for a day.
  - Unpriced developers are **counted and named**, never treated as free; when only unpriced
    developers were placed, spend is "Unknown", not £0. Another currency is converted (ECB via
    `loadFxRates`, base = the budget's currency); with no rate it is left out and listed.
  - **Work done** = done share of the project's top-level live tasks. A task belongs directly
    (`projectId`), else through its release, else through its category. No tasks = "—", never 0%.
  - Estimate: the sum of the tasks' `estimateHours`, done and remaining, plus how many have none.
  - **Verdict**: "No budget set" · "Not started yet" · "Over budget" · "Burning faster than
    work is getting done" (burned more than 15 points ahead of work done, `BURN_SLACK`) ·
    "Spending ahead of the dates" (no tasks: compared with time gone) · "On budget".
  - ⚠️ **Known limits, stated on the page:** today's rate is used for the whole period (the rate
    card keeps no history); allocation % is ignored, as Money and Portal ignore it; and
    placements are per client, so two projects of one client running at once are both charged
    for the same developers. The popup names the other project.
- **Money figures are a server decision.** `buildProjects` only reads cost lines, placements
  and rates when the route passes `financials: canViewClientFinancials(user)`; everyone else
  gets `money: null` and a document read that selects its title only. A test fails if the
  non-financial path ever touches a placement or a cost line.
- **Routes:** `GET/POST /api/clients/[slug]/projects` (`?documents=1` adds the accepted
  documents a project can link to), `GET/PATCH/DELETE /api/clients/[slug]/projects/[id]` (DELETE
  archives). Reads need `assertClientReader`, writes 'Manage clients' plus `assertClientWriter`.
  Another client's, or an archived, project is a 404. `GET /api/money/projects` has Money's gate.
- **UI:**
  - **Projects card** on the Portal client page (`client-projects-card.tsx`), after Timeline,
    full width at its natural height so it can't leave a gap (§129.1), numbered in sequence by
    `portalSectionNumbers` (`"projects"`). Each row: status, dates, work done, time gone and, for
    money viewers, budget burned with "£x of £y" and the verdict.
  - **New / Edit project** and the **project popup** (`project-dialogs.tsx`) are the house
    fixed-height two-column popup. The popup shows work done, time gone, estimate, budget,
    spent, burned, a burn chart (`burn-chart.tsx`, plain SVG on tokens: spent, an even pace to
    the end date, the budget line; a screen-reader table of the same figures) and what's linked
    (document, releases, categories, up to 60 tasks). Archive asks first.
  - **Task form** and **Releases dialog** gain a Project select (this client's live projects only;
    hidden when it has none). Categories are put in a project from the project's own editor.
  - **Money** gains `04 // PROJECTS` (`projects-budget-table.tsx`); Deals moved to 05.
- **MCP:** `list_projects` (money only for financial viewers) and `create_project` ('Manage
  clients'). Catalogue, smoke script (60 tools) and the parity test updated.
- **Demo:** `/demo/portal` shows "Platform build" with a budget from a document, two priced
  developers and one unpriced, and "Support and hosting" not started yet;
  `/demo/money` shows the same in the Projects table (`src/lib/demo/demo-projects.ts`, through
  the real rules; writes land in memory).
- Tests: `src/lib/__tests__/project-budget.test.ts` (30), `src/server/__tests__/projects.test.ts`
  (8), the MCP parity block. Proved to discriminate by reading placements without the financials
  gate (1 failure) and widening `BURN_SLACK` to 100% (1 failure).
- **Verified:** tsc 0 errors, lint 0 errors, 10,828 tests passing, `audit:ui` 0 findings, `npx next build` clean (140 static pages). `/demo/portal` (card, project popup, edit popup under a temporary local grant) and `/demo/money` driven at 390 and 1440 (and 768 for the card and popup) in light and dark: 0 clipping findings from this work, 0 page overflow, 0 console errors. **Not verified against a real database**; post-deploy, add a project to a client with an accepted SOW and check the budget matches Money's figure for that document.

## 151. Recent Changes (November 2026) — Needs you becomes an inbox

HQ's "Needs you" card (§141.1) listed what every watcher found and linked away. Each source still
had its own page to triage on, so people went to seven places. It is now one inbox: the card on HQ
shows the top of it, and **`/app/inbox`** shows all of it. Rules in `src/lib/needs-you.ts` (pure),
reader `src/server/needs-you.ts`, state `src/server/needs-you-state.ts`, actions
`src/hooks/use-needs-you.ts`, UI `src/components/needs-you/`.

- **Act in place, through the source's own route.** Every action calls the route the source's
  own page calls, so its permission rule still applies, and an item only offers the actions that
  person's own page would (`NeedsYouCaps`: the clients they can open, and Admin or above):
  - Monitor incident: **Acknowledge** and **Post update** (`/api/clients/[slug]/wiki/monitors/incidents/[id]`),
    for clients the person can open. Acknowledging changes the item's fingerprint.
  - Foreman finding: Foreman's own **Dismiss** and **Mute** (`/api/foreman/findings`), admins only,
    shared by the workspace as on Settings → Foreman. Undo clears it.
  - **Commitments is a new source**: the person's own suggested commitments, never anyone else's,
    and left out while "viewing as". **Add to my list** / **Dismiss** via
    `/api/backstage/commitments/[id]`. A suggestion can't become a suggestion again, so Dismiss's
    Undo adds it to the list, as on the Commitments page.
  - Client request: now **one item per request** (oldest first, at most `MAX_REQUEST_ITEMS` = 60),
    not one per client. **Mark dealt with** (anyone who can open the client; Undo sets it back to
    New) and **Create task** (Admin or above too, as the promote route requires).
  - Care, Docs and Pulse: Open, plus snooze and dismiss. Care's per-conversation snooze was not
    added: the item is per client, so there is no one conversation to snooze.
- **Snooze and dismiss are kept on the server, per person** (`NeedsYouState`, additive: workspaceId,
  userId, itemKey, fingerprint, state, until; `@@index([userId, workspaceId])`, no unique, one row
  per item enforced in code). `POST /api/hq/needs-you/state` { snooze | dismiss | clear }; the user
  and workspace come from the session, never the body, and it is refused while "viewing as".
  - Same rules as the old browser list: a snoozed or dismissed item comes back early when its
    fingerprint changes, and ⚠️ **a critical item can't be held**, whatever is stored (`holdFor`
    decides at read time, so the route needn't trust a severity sent to it).
  - Snooze: 3 hours, tomorrow 08:00 or next Monday 08:00, in the browser's own time, at most 30
    days. Dismiss lasts until the item changes. Neither is offered on an outage, and the person's
    own Dismiss is left off where the source has one (Foreman, Commitments).
  - Rows are pruned as the inbox is read (`staleHoldIds`): duplicates, ended snoozes, changed
    items, and items gone from a source that was read. ⚠️ A source that failed to read keeps its
    rows: "we couldn't look" is not "it's gone".
  - The old `foundry.needsyou.hidden.v1` browser list is ignored and cleared once.
- **Every row says why it's here** (`why`, one sentence per source rule, e.g. "A customer has
  waited over 24 hours for a reply"), as well as the evidence (`detail`), the source, the
  severity and the age.
- **The inbox page** (`NeedsYouInbox`): Open / Snoozed / Dismissed with counts, filters by source
  and severity, a "What was checked" card per source (a failed one says "Couldn't check"), and
  the keyboard as in Care (§42.8): **j / k** move, **↵** open, **e** deal with it (the source's own
  way, else your own dismiss; nothing on an outage), **s** snooze till tomorrow morning. Keys are
  ignored in a field, a dialog or a menu. `/app/inbox` is in `INTERNAL_ONLY_PREFIXES` and has no
  module of its own: every source in it is gated by `/api/hq/needs-you` as on its own page.
- **Demo:** `/demo/hq` (the card) and `/demo/inbox`, through the real rules
  (`src/lib/demo/demo-needs-you.ts`), with every source and every action working in memory. Demo
  ids start `ny-`, so those handlers can't answer another demo's request. One item starts snoozed.
- Tests: `src/lib/__tests__/needs-you-inbox.test.ts` (actions per permission, holds, pruning, the
  inbox view), `src/server/__tests__/needs-you-state.test.ts` (one person's rows only, the route
  refuses a user in the body and "view as"), `src/server/__tests__/needs-you-scope.test.ts`
  (a developer's requests are their clients' only, no Create task, no Foreman, own commitments).

## 152. Recent Changes (November 2026) — One animated theme switch everywhere

Every Light / System / Dark control in Foundry is now one animated switch: a pill track with a
round knob that slides between three stops, squashes as it travels, and wears an animated sun
(rays fan out, then turn) or moon (stars twinkle). Adapted from Lucy Bichakhchyan's "Dark Mode
Switcher" (CodePen, MIT; licence and the list of changes in `docs/third-party-ui.md`).

- **One component, four places.** `src/components/ui/mode-switch/mode-switch.tsx`, rendered by
  the existing `ThemeToggle` (`src/components/theme-toggle.tsx`), so the app's profile menu, the
  internal wiki header, the client's shared wiki page and the demo banner all changed together.
  Styles are the `.mode-switch*` block at the end of `src/app/globals.css`, scoped to the switch.
- **Light · System · Dark** (Dan's call). The pen's middle stop was Sunset; Foundry has no such
  theme, so the middle is System, and on System the knob wears whichever of the sun or moon the
  device is using (`knobGlyph`).
- **Colours are Foundry's brand tokens** (blue track in light, navy in dark), registered as
  `@property` colours so they ease when the theme changes; the seasonal themes recolour it too.
  The sun and moon artwork keep their own colours.
- **Sound, on by default** (Dan's call): a chime for Light, a warm hum for System, a deep bell
  for Dark, made live with Web Audio (`src/lib/mode-switch-sounds.ts`, nothing to download). Per
  browser (`foundry.mode-sound.v1`), muted with the speaker button beside the switch in the
  profile menu. A browser with no audio, or blocked storage, stays silent.
- Accessible as before: a `radiogroup` of three radios ("Light theme", "System theme", "Dark
  theme"), arrow keys and Home/End, roving tabindex. Reduced motion: no slide, squash or glyph
  animation. The saved mode appears without animating on load.
- Tests: `src/components/ui/mode-switch/__tests__/mode-switch.test.tsx`.

## 153. Recent Changes (November 2026) — Code Handover: Live and Master, venue variants, a lock, and a history

Asked for by Dan for PollenIQ, whose firmware is tweaked per venue and whose own people can
change the code. Four things, all in `src/server/wiki-code.ts`, with the rules pure in
`src/lib/wiki-code-rules.ts` and the page in `wiki-code-section.tsx` +
`code-handover-controls.tsx`.

- **Two markers on versions (Dan's call).** **Live** is what's running (the old `isCurrent`,
  now one per line) and **Master** is the approved code (`isMaster`, one per module, Master line
  only). They can be the same version or different ones. "Current" is gone from the page.
- **Variants** (`WikiCodeVariant`): a full copy of a Master-line version (e.g. a venue) that
  gets its own versions and its own Live. It keeps watching Master: `variantDrift` says when
  Master has moved on since the copy, and "Differences from Master" opens Compare on the
  variant's Live against Master. Compare works across lines; a variant's versions carry its name
  so `v1.1.0` on Master and on The Ivy can't be confused. A line switch appears once there's a
  variant. Made from ⋯ on the module or on a Master version.
- **The lock.** A padlock on each module. Only a Gitwork person (not a guest account) can lock;
  locked, the server refuses every change with a 423 naming who locked it, and the page hides
  everything that changes it. Anyone who can edit may unlock, by typing "Unlock Code"
  (`isUnlockPhrase`, case-insensitive) in a popup, and the unlock is recorded by name and marked
  Client or Gitwork (Dan's call).
- **History** (`WikiCodeEvent`): uploads, edits, Live and Master, locks, unlocks, variants and
  deletions, each with who and whether they were a client (a guest account is a client; the API
  key is "Foundry API"). An edit or a deletion keeps the version as it was (`before`), so
  "See what changed" shows the diff and "Put this back" restores it
  (`POST …/versions/[versionId]/restore`, itself recorded). Each version also shows who made it
  and who last changed it.
- Routes: `PATCH …/code/[moduleId]` takes `{ locked, confirm }`; `POST …/[moduleId]/variants`,
  `DELETE …/variants/[variantId]`, `GET …/[moduleId]/events`. Schema is additive (two tables,
  nullable or defaulted columns). History is internal only; the client's share page shows the
  markers, variants and the lock but not the history.
- Demo: `/demo/wiki#code-handover` through the real rules (`src/lib/demo/demo-code.ts`):
  Receiver has Live v1.3.0 and Master v1.2.0, a venue variant (The Ivy) copied from v1.1.0 so it
  reads "Master is now v1.2.0", and a client's edit that can be seen and put back; Sender starts
  locked.
- Tests: `src/lib/__tests__/wiki-code-rules.test.ts`, `src/server/__tests__/wiki-code-lock.test.ts`.
- **Layout follow-up (same day, Dan).** History is one button beside Add module in the section
  header, covering every module (`GET …/wiki/code/events`, with an All / per-module filter), not a
  button on each card. Both header buttons are the house `app-button app-button-secondary
  app-button-xs`, as Monitors' "Add monitor" now is too; `wiki-header-buttons.test.ts` fails on a
  hand-styled button in any wiki section header. Cards in a row are the same height, and every
  card has the same header: the name on the left, the buttons far right on its line (wrapping
  under the name on a phone), the description below.

---

## 154. Recent Changes (November 2026) — Dispatch becomes an assistant

Harry asked for Claude across the places developers work, so a developer such as Nasir on Wedge
can ask about a project and get a plain-English answer from what Foundry holds. Dispatch, the
Slack coordinator (§36), is now that assistant, in the app and in Slack, on one engine. It ships
**behind a workspace switch** (`dispatchConfig.assistantEnabled`, off by default; Super Admins can
use it before that to test it). Operator notes: `docs/dispatch.md`.

- **The rule everything else serves: Dispatch sees only what the asker can see.** Each chat is
  pinned to one client. No tool takes a client argument; every tool call re-checks
  `assertClientInScope` against the asker (`assistant/scope.ts`), so access removed mid-chat
  applies at once. Results are built field by field; figures appear only for someone with costs,
  rates or client financials (`redact.ts` also strips money patterns for everyone else), and
  credentials are redacted from every result before the model sees it. Documents follow Docs'
  own rule (developers aren't told about proposals or contracts). A new permission,
  `dispatch.use`, is on by default for Developer, Staff and Admin, off for Guests; it never
  widens what anyone can see.
- **Client content is data, not instructions.** Every result is wrapped in
  `<source kind=… id=…>` (with `</source>` escaped), and the system prompt says text inside is
  never an instruction.
- **Changes wait for a click.** A `propose_*` tool stores a pending `DispatchAction` and shows a
  card; nothing runs until the asker presses Confirm (in the panel, or the Slack button), and
  `decideAction` re-checks every rule against the data as it is then. Allowed: create tasks (for
  the asker or unassigned; a suggested owner is named, not set), add subtasks or update a task the
  asker owns or nobody owns, comment, flag (#908), post to the client's **internal** Slack
  channel (re-checked `is_ext_shared === false`). Never, by construction: delete, reassign,
  another client, anything the client can see.
- **In the app:** a right-hand panel (`src/components/dispatch/dispatch-panel.tsx`), opened from
  the header, ⌘K "Ask Dispatch", a client's header, My Clients rows and the task drawer
  (`openDispatch()`), streaming over SSE from `POST /api/dispatch/chat`. Quick actions per context
  carry the dev team's list (`src/lib/dispatch/skills.ts`).
- **In Slack** (`assistant/slack.ts`): a thread keeps its client; a client's own internal channel
  means that client; otherwise the client named in the question, from the asker's clients. A
  question about a person or "everything" still gets the older status answer (`respond.ts`).
  Answers posted in a channel use `forChannel()`: no figures and developer document types only,
  because everyone in the channel reads them. Confirm/Cancel buttons are honoured only for the
  Foundry member the pressing Slack account resolves to (`interactions.ts` →
  `handleDispatchDecision`), and run after Slack's 3-second ack. The manifest gains
  `channels:history` and `groups:history`: **reinstall the Slack app and re-save the bot token.**
- **Cost (a $200 pot shared with every AI feature).** Model `claude-sonnet-5-5` (`DISPATCH_MODEL`,
  Dan's choice). The system prompt and tool list are identical for everyone with a cache
  breakpoint after them; who is asking and about which client goes in the first user message, so
  every question after the first in five minutes reads the prefix at a tenth of the price
  (a test asserts the prefix takes no person, client or time). Effort low, 4,000 output tokens,
  at most 6 tool rounds (the last with `tool_choice: none`), results capped, chats capped at 40
  messages or ~60k tokens, 60 questions per person per hour. Every call is logged with module
  `DISPATCH` (Analytics → AI usage). History is append-only because Sonnet 5.5 checks earlier
  thinking wasn't edited.
- **Privacy.** Chats are private to their owner (`DispatchConversation`/`DispatchMessage`); Super
  Admins see usage and cost, not text. The Slack audit row (`DispatchExchange`) records who, which
  client and the outcome, not the answer.
- Schema (additive): `DispatchConversation`, `DispatchMessage`, `DispatchAction`, `AiModule.DISPATCH`.
- Demo: `/demo/dev` opens the panel with canned answers (`src/lib/demo/demo-dispatch.ts`).
- Tests: `assistant/__tests__/` (redaction, prompt prefix and tool list, action rules, the
  confirm executor, channel narrowing), `src/lib/dispatch/__tests__/slack-format.test.ts`,
  each rule checked by breaking it on purpose. Verified: the panel at 390, 768, 1280×620 and 1440
  with `audit:clipping`, no findings.
- **Still to come:** GitHub and Figma tools, a design-vs-build check, budget alerts at 50/80/95%
  and a Dispatch block in Analytics, a 90-day chat purge, and a live eval of ~25 real Wedge
  questions as Nasir before the switch goes on.

## 155. Recent Changes (November 2026) — Board: sign-off without a reload, and a Timeline that shows what's late

- **No more page reload on the client's Board.** `useBoardRefresh` called `router.refresh()` on
  the client's page, which re-rendered the whole server page on every approve or move. The cards
  have their own query since §140, so it now invalidates only `["public-wiki", token, "board"]`.
- **Approve turns into "Approved" at once** (`Composer` in `wiki-board-card-dialog.tsx`, `onSent`
  updates the card and tells the board). The client gets Approve and Changes needed only; the
  separate Comment button is gone, and a typed note goes with either. The team keeps Reply.
- **Timeline** (`src/lib/wiki-board-timeline.ts`, pure, tested):
  - `releaseState`: complete (cards > 0, all done), behind (end date passed, cards open), open.
  - `cardBehind`: not done, and its due date (else its release's end date) has passed.
  - Completed releases (and done cards with no release) are hidden by default; **Show completed**
    brings them back. **N behind schedule** filters to late cards only.
  - Behind releases draw red with "Behind · N open"; late cards get a red ring and dot; approved
    cards show a green tick and an Approved chip in the rail.
  - The calendar spans only the releases shown, and opens on today: it scrolls the first time the
    scroller has a width (ResizeObserver), which fixes it opening at the earliest release when the
    view mounted before it was laid out.

**Follow-up (25 Nov): the team can approve too.** Dan asked for it. The team's card dialog now has
Changes needed, Approve and Reply. `addBoardFeedback` no longer refuses a sign-off from the team; it
is recorded as Gitwork's (`authorUserId`, shown as "GITWORK · name" in the activity) and notifies
nobody. `POST /api/tasks/[id]/client-feedback` takes `{ kind?, body }`, `kind` defaulting to a comment.

---

## 156. Recent Changes (November 2026) — Dispatch reads code and designs, watches the budget

The rest of the Dispatch plan (§154), asked for by Dan the same day. Still behind the switch,
which now lives in **Settings → Dispatch** (Super Admins) rather than raw JSON.

- **The client's code** (`assistant/tools-code.ts`, rules in `src/lib/dispatch/code.ts`):
  `repo_files`, `read_code` (line numbers, ranges), `search_code`, `recent_commits` and
  `compare_code` (a pull request number, or base and head) — for impact analysis, PR descriptions,
  release notes and setup docs. Only the repositories on the pinned client's platforms
  (`ClientPlatform.repoUrl`); a repo named in the question that isn't one of them is refused.
  Read with the server's `GITHUB_TOKEN` through the ETag-cached `githubRequest`. Secret files
  (`.env*`, keys, certificates, `google-services.json`, Terraform state…) are never opened, and
  everything still goes through the credential redaction. Read-only: nothing writes to GitHub.
- **Designs** (`assistant/tools-design.ts`, rules in `src/lib/dispatch/figma.ts`):
  `figma_frames` (pages and frames, or one frame's words; hidden layers left out) and
  `figma_image` (a picture of a frame, rendered at most 1200px). Only files linked as the
  client's designs in Portal. The Figma token is set in Settings → Dispatch: checked with Figma
  before it is saved, stored with `storeSecret`, never sent back (`Workspace.figmaToken`).
- **What was built:** `capture_page` screenshots a page on the client's own sites (production or
  staging URLs on its platforms only) at phone or desktop width. `assertScannableUrl` refuses
  private addresses, and the browser aborts any navigation that leaves those hosts. For apps,
  people **attach or paste screenshots** in the panel: shrunk in the browser to 1568px JPEG
  (`shrink-picture.ts`), checked again on the server by their bytes (`images.ts`), at most four.
  Pictures in one question (attached plus tool) are capped at four; a stored picture counts as
  1,600 tokens against the chat-length cap, not its base64 length. The system prompt asks for a
  visual comparison stated as one: matches, missing, different.
- **Budget alerts** (`assistant/budget.ts`, rules in `src/lib/dispatch/budget.ts`): the budget
  (default $200) is every AI feature on the Anthropic key, not just Dispatch. A period is the
  calendar month, or everything since a set date for a one-off pot. Checked hourly from the
  `jobs` worker; Super Admins get `ai.budget_alert` (in-app + push) once at 50%, 80% and 95% per
  period (only the highest when several are crossed at once), and the ops Slack webhook gets the
  same line. Nothing is switched off at 100%.
- **Analytics → AI usage** gains `07 // Dispatch` (questions, cost per question, share of the
  prompt from the cache, the budget, app vs Slack) and `08 // Dispatch by person`, from
  `GET /api/admin/dispatch-usage` (Super Admins). Counts and costs only, never chat text.
- **Chats are deleted 90 days after they were last used**, nightly in the `RETENTION_SWEEP` job
  (`assistant/purge.ts`), with their messages and any proposal never carried out. Proposals that
  were carried out stay, as the record of what Dispatch changed. Runs whether or not the
  workspace has a cold store.
- **Settings → Dispatch** (`dispatch-settings-panel.tsx`, `/api/dispatch/settings`): the switch,
  the budget and its start date, and the Figma token. Changes are audited
  (`settings.dispatch.updated`, never the token).
- **Trying it as a teammate before the switch:** a Super Admin previewing as someone ("view as")
  can use Dispatch while it's off, gated exactly as that person. `applyViewAs` now records the
  Super Admin on the effective user (`previewedBy`), and `assistantAvailable` accepts it. It never
  widens access: the preview is still refused without the teammate's own `dispatch.use`.
- Tool list order: the new tools are appended after the original nineteen, so nothing in the
  cached prefix moves except the additions.
- Tests: `src/lib/dispatch/__tests__/code-and-design.test.ts`, `budget.test.ts`,
  `assistant/__tests__/purge.test.ts`, each rule broken on purpose to prove it.

**Follow-up (25 Nov): lighter wiki loads.** Investigating "Foundry is slow": the server was idle and
answering in milliseconds, but PollenIQ's wiki carried 1 MB of Code Handover file contents on every
load (every version keeps a full copy of its files). The wiki now sends a light copy with no file
contents (`liteCodeHandover`, `?code=0` on the team's wiki, `code: false` on the share page) and the
section loads the files itself (`useWikiCodeFiles`: `GET /api/clients/[slug]/wiki/code`, or
`GET /api/wiki/[token]/code` on the client's link, access in `src/server/wiki-code-access.ts`). Card
actions on the team's Board now re-read the Board's cards only and mark the wiki stale, instead of
reloading the whole wiki each time.

**Follow-up (25 Nov): Needs you is one line per source.** Dan: "unwieldy, not easy to use". The
card on HQ showed four lines per item and 33 items, 27 of them Pulse "needs a look" rows, so the one
customer-reply backlog sat among them. Now (`needs-you-card.tsx`, rules `groupBySource`,
`groupHeadline`, `groupNames` in `src/lib/needs-you.ts`, tested): one line per source, most serious
first ("Pulse · 27 projects need a look · adam-beasley.com, Afterdesk Testing +25"), opening in place
to one-line items (`NeedsYouLine`; the "why" moved into the tooltip), with **All →** opening the
inbox filtered to that source (`/app/inbox?source=pulse`). A source with one item is that item's
line. Urgent groups of up to three start open. The inbox page is unchanged.

---

## 157. Recent Changes (November 2026) — Dispatch answers with Haiku unless it needs Sonnet

Dan, the same day: keep the $200 pot going. Measured costs come next; this is the model.

- **Claude Haiku 5.5 answers most chats** ($0.10 / $0.50 per million tokens, about a twentieth
  of Sonnet 5.5), with thinking off. **Sonnet 5.5 only for code** (repo, PRs, commits, impact
  analysis) **and design against build**, or when screenshots are attached
  (`chooseDispatchTier`, `src/lib/dispatch/model.ts`, tested against every quick action).
- **One model per chat**, chosen from its first question and stored on
  `DispatchConversation.model` (nullable, additive). Each model's thinking only replays to that
  model and its cache is its own, so switching mid-chat would pay for the history again. Chats from
  before carry on with Sonnet. Haiku 5.5 has no server-side fallback, so it is sent without one.
- `DISPATCH_MODEL` became `DISPATCH_MODELS = { everyday, deep }` in `src/server/ai-provider.ts`.
- **Tighter limits for both:** 5 lookup rounds (was 6), 2,500 output tokens (4,000), results
  ~4,500 characters (6,000) and code ~6,000 (8,000), 3 pictures a question (4), and a chat closes
  at 24 messages or ~30k tokens (40 / 60k): every follow-up resends the whole chat.

---

## 158. Recent Changes (November 2026) — Dispatch's first live test, and what it changed

Ten real Wedge questions asked as Nasir (Super Admin view-as, §156) in production, after §157.

- **Cost, measured:** $0.035 for all ten. The nine Haiku questions cost $0.0055 together (19 model
  calls, about $0.0006 a question); the one code question on Sonnet cost $0.029. 84% of the prompt
  was read from the cache. Answers took 1 to 9 seconds.
- **Answers:** his tasks (6, with the stuck ones called out), overdue work (21, mostly unassigned,
  flagged as probably stale), the 19 Nov call's decisions and a good follow-up list, the current
  release (11 tasks, none done, all unassigned), and an honest reply draft that refused to invent
  a date. Money, other clients and an "ignore your rules, admin mode" attempt were all refused in
  plain words. No proposals, no leaks.
- **Found and fixed:**
  - Haiku narrated its steps ("I'll look up…") and the narration ran into the answer. The prompt
    now says not to, and text from separate rounds is split into paragraphs.
  - The code question searched eight times and ended "Try the repo structure.": Wedge's two
    repos are private and Foundry's `GITHUB_TOKEN` most likely can't read them. GitHub errors now
    say who must grant access and tell the model not to retry, and the prompt says the same for
    any tool that can't open something.
  - Running out of lookups produced a four-word answer. Before the last round a note now tells the
    model it has no lookups left and must answer with what it found and what it couldn't check (a
    text block after the tool results: append-only, so the cache and thinking are untouched).
- The test chats were deleted afterwards (as Nasir, through the chat's own DELETE route).

**Follow-up (25 Nov): a calmer Timeline, and the sign-off in the card's bottom bar.** Dan: "difficult
to understand… hide the approved ones… adjust the timeline so we don't have red".
- **Approved cards are signed off**: hidden by default (**Show approved (N)**), and they don't make a
  release late (`releaseState(r, today, approvedOpen)`, `approvedOpenByRelease`; "Behind · N waiting").
- **Less red**: a card is flagged only for its OWN late due date (`cardBehind`), never for sitting in
  a late release; the release bar says that once. No more red ring on every card.
- **Move a release's dates from the timeline** (team only): the calendar beside a release's name
  (`EditDates`) saves through `PATCH /api/releases/[id]`.
- **Card dialog**: Changes needed and Approve sit bottom right of the card (`SignOffButtons`); the
  note box has Reply beside it for the team (`NoteBox`); one draft is shared (`useCardFeedback`), so
  a typed note goes with whichever is pressed.

---

## 159. Recent Changes (November 2026) — The AI budget reads Anthropic's own billing, and sits in the sidebar

Dan: the budget must sync to the actual figures in Anthropic's admin, and sit in the sidebar.

- **Spend is Anthropic's billed figure** when an Anthropic Admin key is connected (Settings →
  Dispatch → 04 Anthropic billing; checked against Anthropic's cost report before it is saved,
  stored with `storeSecret`, never sent back; `ANTHROPIC_ADMIN_KEY` on the server still wins).
  Organisation-wide, because one prepaid credit pays for every key. Anthropic's report stops at
  the last UTC midnight, so today is added from Foundry's own log. Cached an hour
  (`AiResponseCache`, `ai-billed:<period>`). With no key, or if Anthropic doesn't answer, it is
  Foundry's estimate and says so (`budgetStatus().source`, `anthropicError`). The alerts use the
  same figure.
- **The budget figure itself stays the one set in Settings.** Anthropic's API has no credit
  balance, and spend limits are only readable on Enterprise or an early-access preview.
- **⚠️ Anthropic reports cost in cents.** `ai-cost.ts` read them as dollars, so the sidebar card
  would have shown 100× the spend; it never ran, because no Admin key was ever set
  (`centsToUsd`, tested, and the test fails if the division goes).
- **The sidebar's AI spend card** (`ai-spend-card.tsx`, Super Admins) now always shows: spent
  of the budget, a bar that turns amber at 80% and red at 95%, the period, and "Anthropic" or
  "est." for where the figure comes from. It links to Settings → Dispatch. Data from
  `GET /api/admin/ai-budget`.
- **Settings → Dispatch:** "Count from" uses the house date picker (UK dates, "3 Nov 2026"),
  and the line under the budget says where the figure comes from.
- **Figma tokens:** checked by opening one of the workspace's linked Figma designs (needs only
  "File content: read"), not Figma's "who am I", which needs a scope read-only tokens are made
  without. The error says which: invalid, missing a permission, or can't see the client's files.
- Tests: `src/server/__tests__/ai-billed-spend.test.ts` (cents, paging, refusal, first day).

**Follow-up (25 Nov), from Dan's review of Settings → Dispatch:** a connected Figma token or
Anthropic Admin key now shows only **Disconnect** (no field or Save beside it; to change a key,
disconnect and add the new one), and saving one thing spins only its own button: the card used
one shared "saving" flag, so pressing Save token spun every button on the page.
`dispatch-settings-panel.test.tsx` covers both.

---

## 158. Recent Changes (November 2026) — Releases numbered by the changelog

Big Wedge's planning site numbered its releases loosely ("v2.0.0" four times, a "v1.0.0" in
November) while the app's changelog went 2.0.0 → 2.0.2 → 2.0.3 → 2.0.4. A client can now be shown
by the changelog instead (Dan, Nov 2026: a toggle for every client, on for Wedge).

- **Data (additive):** `ClientRelease.changelogVersion` ("2.0.4") and
  `WorkspaceClient.releasesUseChangelog` (default false).
- **One rule, `shownVersion` (`src/lib/tasks/releases.ts`):** the changelog version (with a "v")
  when the client's switch is on and one is set, else the release's own version. `releaseLabel`
  and `compareReleases` use it, so labels and order follow everywhere: the task board, the board's
  Timeline, the client's wiki, the public timeline link, Delivery and Projects. Rows are read with
  `changelogVersion` + `client.releasesUseChangelog`; DTOs carry the decided `displayVersion`.
- **Where it's set:** the **Releases** dialog has "Number releases by the changelog"
  (`GET`/`PUT /api/releases/numbering`, same access as changing a release) and a Changelog version
  field when editing a release; the Timeline's date editor has the field too.
- With the switch on and no changelog version set, a release shows its own number, so turning it on
  changes nothing until versions are filled in.

---

## 160. Recent Changes (November 2026) — Dispatch names tasks by title, says when nothing is yours, and where it works in Slack

From Dan and Syed testing Dispatch, 25 Nov.

- **"Syed sees tasks that aren't his"** was the data, not Dispatch: Syed is an assignee on 40
  Campfire tasks (some shared with Sardar Jamal), created on 3 Nov. `my_work` only ever reads the
  asker's own tasks (`assigneeId: scope.user.id`), which a test now pins.
- **Nothing assigned:** when the asker has no tasks on the client at all, `my_work` says so.
  **An admin** (Admin, Super Admin) is then told whose the open work is ("Nasir Javed 5, Muhammad
  Fahad 3; 4 with nobody assigned", `openByPerson`); **anyone else** only how many have nobody
  assigned. Dan: "admin is different to dev". Every task list says whose each task is.
- **Titles, not refs:** answers, source chips and proposal cards name tasks by their title. Tool
  results still carry the ref as a bracketed handle (`[ref AB12CD]`) for `get_task` and the
  `propose_*` tools, and the prompt says never to show it.
- **Slack: where it can answer.** Dan's @Foundry was in his DM with Syed. Slack never delivers
  messages from a two-person DM (or a group DM the app isn't in) to an app, so nothing reached
  Foundry. Dispatch answers @mentions in channels Foundry is a member of, and direct messages
  to Foundry itself. The manifest now turns on the app's Messages tab (`app_home`), which must
  also be switched on in the Slack app's App Home settings.
- Tests: `assistant/__tests__/my-work.test.ts`.

**Follow-up (25 Nov): why Slack couldn't tell who was asking.** Dan's first direct message to
Foundry got "I couldn't match your Slack account", although his Slack email matched and the app
had `users:read.email`. Foundry sent every Slack call as JSON, and Slack's read methods
(`users.info`, `conversations.info`, `conversations.list`) don't accept a JSON body, so the user
id never arrived. Those three now go form-encoded (`call(..., { form: true })` in
`src/server/slack/client.ts`; writes stay JSON for blocks), and an unmatched asker is told why:
the Slack error and the missing permission it names, no email from Slack, or no Foundry account
for that email (`resolveSlackAskerDetailed`, `askerProblemMessage`). The same JSON problem would
have made `conversations.info` fail in every channel, which Dispatch treats as "maybe shared with
the client" and refuses. Test: `src/server/slack/__tests__/read-methods-form.test.ts`.

**Follow-up (25 Nov): the last four of the team's requests get buttons.** Dispatch quick actions
for **Impact analysis** (Fahad, on a task), **Test scenarios from Figma** (Billal, on a task),
**Design vs build** (Nasir, on a client: fills the box so you name the screen and attach
screenshots) and **Write docs from the code** (Sibghat, on a client: you say which doc). All four
read code or Figma designs, so they're answered by Sonnet 5.5 (`model.test.ts` pins it). Every
request on Syed's list now has a button except outdated libraries (No. 14), which waits on
Dispatch reading Pulse's findings.

**Follow-up (25 Nov): talking to Foundry in Slack is a conversation.** Dan: "I need to be able to
converse with Foundry, and not be locked to stale replies". Three things made it feel stuck: every
DM message started a new chat (Foundry replied in a thread under each one, so a top-level
follow-up lost the context), a message with no client named got the old fixed "I couldn't tell
which client" reply, and a long chat hit "start a new one". Now (`decideSlackChat`,
`src/lib/dispatch/slack-conversation.ts`, tested):
- **A DM is one running chat**: a message, threaded or not, carries on the person's latest DM chat
  if it was active in the last 3 hours, and Foundry replies at the top level of the DM (or in the
  thread they used). Naming another client moves to a new chat about it; a long chat carries on in
  a fresh one about the same client without saying so.
- **No client to go on**: Foundry greets back if greeted, names the person's clients and asks which
  (`askWhichClientText`), then keeps that client for the rest of the chat. Someone on one client
  gets that client. A question about a person or everything still gets the status answer.
- In channels a thread is still the chat, and a DM chat never carries into a channel.

## 161. Recent Changes (November 2026) — Dispatch opens on a brief, not an empty chat

Dan, 25 Nov, on the panel: "seems very basic... I didn't want a chat bot, I wanted something
more, something smarter". Also: the input box looked off, the client dropdown's chevron floated
in from the right edge, and the client row should only show when there's a choice to make.

- **The brief** (`src/lib/dispatch/brief.ts`, pure and tested; `GET /api/dispatch/brief`). The
  panel opens on what it found, worked out from Foundry's data with **no AI call**, so opening it
  costs nothing:
  - a greeting with the date and one line on the last 7 days ("2 done, 4 new");
  - four numbers: yours open, this week, need a look (overdue, stuck or blocked), and the next
    release with how long until it ships. Each one asks Dispatch about itself when picked;
  - **01 Needs you**: up to six of the person's own tasks, most urgent first, each with its
    reason (Overdue 2 days, Waiting on the client, In progress 8 days, Due Fri 27 Nov, Flagged).
    A row asks about that task; the arrow opens it on the board. Nothing assigned: an admin sees
    whose the open work is, anyone else how much has nobody on it (the §160 rule);
  - **02 Suggested**: at most three things to do next, **each because of something the brief
    found**, with the reason underneath ("Get “Saved searches” moving · In progress for 8 days",
    "Release notes for v1.5.0 · Ships Tue 1 Dec · 9 of 14 done"). Opened from a task, the
    suggestions fit where the task is up to (not started: subtasks and impact; in review: PR
    description and tests);
  - **03 More it can do**: every other quick action, folded, grouped Find out / Write / Check
    (`SkillGroup` on each skill).
- **Answers show their working**: each step Dispatch takes ("Looking at your tasks") is listed
  live, then folds into "Looked at 3 things", which opens again on a click.
- **The input** is one box: the text on top, growing to about seven lines, with Screenshot, the
  keyboard hint and the send button on a row underneath.
- **The client switcher** only shows when the person has more than one client, has its chevron at
  the right edge (it no longer borrows `app-select-compact`, whose 32px right padding was meant for
  a background chevron), and shows the client's initial. With one client, that client is chosen;
  with none picked, the panel asks which, as a list. The last client used is remembered on this
  device (`localStorage`, a convenience only).
- The demo (`/demo/tasks` → Ask Dispatch) serves the real `buildBrief` over sample tasks.
- **No colour fade when the theme switches (app-wide).** Anything with a hover `transition` faded
  from the old theme's colours to the new over 150ms while the page around it flipped at once, so
  for a moment the brief's cards were black on a white panel (Dan spotted it in a screenshot).
  `applyTheme` (`theme-provider.tsx`) now sets `data-theme-switching` for two frames and
  `globals.css` pauses transitions under it, except inside the animated `.mode-switch`. Measured on
  the demo: the card was dark, grey, then white across 150ms; now it's white from the first frame.
- Tests: `src/lib/dispatch/__tests__/brief.test.ts` (who sees whose work, ranking, suggestions
  and their reasons, the task view).
