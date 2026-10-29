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
- **Org chart** (Cards / Org chart switch), drawn from the manager field (`buildOrgTree`). A manager
  not on the list makes their reports roots; a circle is broken rather than looping.
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

## Next

1. **Documents (1b):** per-person vault with a required list per engagement type, expiry reminders,
   view/download logging, e-signature for contracts and NDAs. HR uploads by default; HR can turn on
   developer self-upload per document type, or request one document from one person. Developer
   uploads wait as "to check" until HR accepts them.
2. **Backstage → Me (1c):** a person's own details, documents and policies to sign.
3. Phases 2 to 4: see the spec doc.
