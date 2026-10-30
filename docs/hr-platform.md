# People & HR

The spec lives in a shared doc: **[Foundry People & HR — spec](https://claude.ai/artifact/NUA9BzogM3jbdsvJTekyad)**.
This file records what has been built and the rules the code keeps.

## Who it covers

| Engagement | Who | Notes |
| --- | --- | --- |
| Director | Harry (to confirm) | `employmentType: DIRECTOR` |
| Employee | Dan (Head of Product), Siân (HR) | `EMPLOYEE` |
| Contractor, supplied | The developers, all through one partner company | `CONTRACTOR` + `supplierId` |

Staff is the record of every person. Backstage is where people do things, and reads Staff.
Payroll, pensions and benefits stay with the accountant.

## Phase 1a (this change)

- **Permissions** `hr.manage` (feature) and `hr.viewSensitive` (field), in `src/types/auth.ts`.
  Both are high-risk and **never in a role's defaults, ADMIN included** (`HR_PERMISSION_IDS`):
  personal and health data is granted to a named person in Settings → Team. Super Admins always
  have them.
- **Person record, three tiers** (`src/lib/hr.ts`, `profileAccess`):

  | Tier | Fields | Read | Edit |
  | --- | --- | --- | --- |
  | Directory | name, preferred name, pronouns, title, department, type, start, manager, clients | Staff module, or the person | `code.manage` |
  | Employment | supplier, contract end, probation end, notice (weeks), days per week | the person, their manager, `hr.manage` | `hr.manage` |
  | Sensitive | date of birth, address, personal phone and email, NI number, ID number, right to work expiry, emergency contacts | the person, `hr.viewSensitive` | the person, or `hr.manage` **and** `hr.viewSensitive` |

- **Sensitive tier storage:** one AES-GCM envelope per person in `StaffSensitive`
  (`src/lib/encryption.ts`). Never in plain text, never in a log.
- **Access log** (`HrAccessLog`): every look at someone else's personal details, and every
  change to employment or personal details. It records which fields changed, never the values.
  Read by `hr.manage` on the profile.
- **Personal details load only on request.** The profile page doesn't fetch them until the viewer
  presses Show, so opening a profile never reads or logs them by accident. The query is never
  cached or refetched in the background, and editing the directory doesn't invalidate it, because
  a refetch would be a second logged look.
- **Suppliers** (`Supplier`, `src/server/hr/suppliers.ts`): archived, never deleted.
- **Pages:** `/app/staff/[id]` (profile) and `/app/staff/suppliers` (HR only). Names on Staff →
  People link to profiles. Demos: `/demo/staff/r2`, `/demo/staff/suppliers` (the demo viewer has
  both HR permissions).
- **API:** `GET /api/staff/[id]`, `PATCH /api/staff/[id]/employment`,
  `GET|PUT /api/staff/[id]/personal`, `GET /api/staff/[id]/access-log`,
  `GET|POST /api/staff/suppliers`, `PATCH /api/staff/suppliers/[id]`.
- A record from another workspace, or a profile the viewer may not see, answers **404**, so its
  existence isn't revealed.

## Edit, archive, restore, delete

All from the person's profile (`PersonActions` in `staff-profile.tsx`). Rules in
`lifecycleFor` (`src/server/hr/profile.ts`) and `deleteBlockReason` (`src/lib/hr.ts`):

- **Someone who signs in** is archived and restored through Settings → Team's own routes
  (`/api/team/members/[memberId]/archive|restore`): Admins and above, never yourself, never someone
  at or above your rank, restorable for 30 days. One path, so access and the roster can't disagree.
- **Someone without a login** is archived on their record (`Candidate.archivedAt`,
  `POST /api/staff/[id]/archive`) by anyone with Staff manage or `hr.manage`. Restorable any time.
- **Delete** (`DELETE /api/staff/[id]`) only for a record with no login, no placements and no
  developer reviews. Anyone with history is archived instead, and the API says why. Deleting removes
  their personal details too; access-log entries stay. Audited as `staff.record.*`.
- **Staff → People → Archived** lists everyone who has left: archived members, archived records,
  and developer records whose person has left. The old Staff → Archived tab redirects there.

## People as cards, and the profile's live side

- **People** is a card grid under headings: **Admins**, **Staff**, **Developers**, **Guests**,
  **No login** (`groupStaff` in `src/lib/staff.ts`). Each card opens the profile. On hover a
  person's clients rise from behind the card (EasyUI's macOS Folder Cards motion); the same clients
  are written on the card, so nothing is hover-only, and reduced motion keeps them still.
- **A person's clients** are the ACTIVE clients they're placed on in Code, plus those whose
  **product team** they're on (`WorkspaceClient.productTeamUserIds`, the leads in the wiki header).
  The product team is how product and account leads are on a project, so without it they read
  "No clients". `ClientAssignment` is not read, because it grants a developer access, which isn't the
  same as being on the project. See `src/server/staff-clients.ts`, used by the roster and the profile.
- **Org chart** (Cards / Org chart switch, `org-chart.tsx`). Gitwork keeps no list of who manages
  whom: the admins are the managers. So the chart places people by role (`orgTiers`):
  1. Leadership (Super Admins)
  2. Admins
  3. Everyone else, under the cards' headings: Staff, Developers, Guests and No login.

  The tiers are joined down the middle. A manager set on someone's profile wins: that person
  hangs under their manager as a branch with lines, built by `buildOrgTree`. More than four leaf
  reports stack in a column. A chart wider than its card scrolls in its own frame and opens
  centred. The first version drew only from the manager field, and with none set it read as a
  plain list.
- **CSV** export of the list shown: name, email, role, title, department, type, start, manager,
  clients. Never rates or personal details. Formula-looking text is neutralised.
- **For HR** (`hr.manage`): what's coming up in the next 60 days (contract ends, probation ends,
  supplier renewals, and right-to-work expiries with `hr.viewSensitive`) and records missing details.
  `GET /api/staff/hr-overview`. ⚠️ Right-to-work dates come from the encrypted tier in a bulk read for
  reminders; it isn't written to each person's access log and only the date leaves the server.
- **Profile**: Overview edits in place (the same form as "Create profile", `DetailsDialog inline`)
  and shows GitHub and stack for developers. New **Activity** (tasks completed per day over 26 weeks,
  EasyUI's Activity Heatmap, plus every placement) and **Time off** (leave in the next 90 days; this
  year's allowance for the person, HR and approvers). `GET /api/staff/[id]/activity`.
- ⚠️ **Leave types are health-adjacent:** anyone but the person and HR sees "Off", never "Sick".

## Documents (Phase 1b)

On the person's profile (and Backstage → Me). Rules in `src/lib/hr-documents.ts`, server in
`src/server/hr/documents.ts`, API under `/api/staff/[id]/documents`, `/api/staff/documents/[docId]`
and `/api/staff/document-settings`.

- **Who sees a document** (`canSeeDocument`): HR sees all; the person sees all but HR-only ones;
  their manager sees only those marked for the manager; nobody else, whatever Staff access they
  have. A document is personal.
- **Required list** per engagement (`REQUIRED_DOCUMENTS`): employees contract, NDA, right to work,
  starter checklist; directors contract, NDA, right to work; contractors NDA and photo ID (the
  partner's agreement and insurance belong on the supplier); freelancers NDA. A required type is
  on file, expiring (30 days), expired, to check, requested, sent back or missing; the best
  document wins. Shown to the person and HR only.
- **Who adds what** (`canUploadType`): HR adds any type, on file at once. The person adds a type HR
  allows (Document settings, off by default) or has asked for ("Ask for it" on a missing type),
  and it waits as **to check** until HR accepts or sends it back with a note.
- **Files** are checked by their contents, not their name (the Launchpad rules, 10 MB), stored like
  every other upload (`placeUpload`), served as attachments with nosniff and a sandboxing CSP. A
  file already in Drive can be attached by link instead (HR only; https Drive/Docs links only).
- **Logged:** every open by someone other than the person, and every add, check and delete.
  Names the document type, never its contents.
- **Google Drive copy** (Document settings, off by default): each file is copied after the
  response into a "Foundry HR" folder with one folder per person, in the workspace owner's Drive
  (`resolveWorkspaceGoogleAccount`, now shared with the Docs backup). Best-effort: a failure is
  shown on the document with Retry; deleting a document bins its Drive copy. ⚠️ Opening a file
  straight from Drive isn't in Foundry's access log; share that folder with HR only.
- **HR reminders** now include documents expiring in 60 days, and missing required documents
  appear under Missing details.
- **Uploads** use EasyUI's Animated File Upload (vendored). The same component now handles task
  screenshots and the new-document wizard.

## Backstage → Me (Phase 1c)

A person's own HR record, at Backstage → **Me** (card 01, or `?area=me`). It is their Staff
profile opened as themselves (`StaffProfileView mode="me"`), so the cards and the rules are the
ones HR sees and the two can't drift: overview, employment, personal details (theirs to edit, no
reveal step), documents (what HR asked for, plus the types HR lets people add), activity and time
off. Me mode drops the way back to People and the archive/delete controls; nothing else changes.

- **Finding the record:** `GET /api/staff/me` runs the email linking first, so a record HR made
  with the person's address is found rather than duplicated.
- **No record yet:** "Set up my record" (`POST /api/staff/me`) makes one holding only their
  name and email, for an active member only. `memberId` is unique, so a double click can't make
  two; the losing request gets the winner's record.
- **The card** counts what HR is waiting on from them: documents asked for or sent back. A
  required document they can't add isn't counted; that's HR's to chase.
- **Only where the business has Staff** (`hasModule("codeclear")`), because Me is a Staff record.
- **Grid:** Me makes the Super Admin row six units. Six columns wait for 1400px (146px cards at
  1280 otherwise); below that the row is two columns with Team full width.

## The Staff tour, and the Monday HR digest

- **Tour** (`src/components/staff/staff-hr-tour.tsx`, rule in `src/lib/staff-tour.ts`): EasyUI's
  Product Tour over the real page. It opens on its own once, for someone with `hr.manage`, on the
  active list, once the team has loaded. It walks the people cards, the filters, the For HR card
  and Document settings, and ends on how personal details are logged. "Seen" is remembered per
  browser (unreadable storage counts as seen); **Show the tour again** sits at the foot of For HR.
- **Digest** (`src/server/hr/digest.ts`, wording and timing in `src/lib/hr-digest.ts`): on
  Mondays from 08:00 UK time, each person with `hr.manage` gets what's coming up in the next 30
  days, how many documents are waiting to be checked and whose record is incomplete, in the bell
  (`hr.weekly_digest`, in-app only) and by email. A quiet week sends nothing.
  - **Who:** active members whose permissions include `hr.manage`. A Super Admin only with an
    explicit grant: `resolveEffectivePermissions` hands them everything, and a digest to people who
    could look but never asked is noise.
  - **Once a week:** `Workspace.hrDigestWeek` is claimed with a conditional update before sending.
    A Monday the worker misses is skipped, not sent late.
  - **No personal details by email:** right-to-work dates come from the encrypted tier, so they're
    counted ("1 right-to-work date: see Staff"), not listed.
  - Runs from the every-minute `jobs` worker, not a cron line of its own, because several
    documented cron lines were never installed and a digest that never runs looks like a quiet week.

## One page per developer

A developer's Staff page is now their only page. Staff and Code share an id (a Staff record is
the developer's `Candidate` row), so nothing moved in the data.

- **Developer card** (`src/components/staff/developer-card.tsx`), on Staff only, not in Me: GitHub,
  stack, location, links, availability, Bench or Off Bench (admins move them), the monthly rate
  (`code.viewRates`), the current-client picker, CV and Edit (`code.manage`). **Notes** sits
  below Time off. Overview stops repeating GitHub and stack when the card is there.
- **Shared parts** (`src/components/codeclear/candidate-parts.tsx`): the hero readouts, the
  edit-dev dialog (`candidateToForm` / `formToCandidatePatch`) and the notes, used by both pages.
- **Placements** on the Activity card now show each placement's project and notes, which the old
  Engagements card did.
- **`/app/codeclear/candidates/[id]`** now serves Hiring's external candidates only, and sends
  anyone on the team to `/app/staff/[id]` (client-side, after the record loads; a skeleton shows
  meanwhile). Old links and bookmarks keep working. Client detail's team links go straight to Staff.
- **Delete changes for team members:** it follows Staff's rules now (no login, no placements, no
  analysis; otherwise archive), where the old page deleted any developer outright.

## Next

1. E-signature for contracts and NDAs, and policies to sign from Me.
2. Phases 2 to 4: see the spec doc.
