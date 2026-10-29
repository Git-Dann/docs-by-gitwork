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

## Next

1. **Documents (1b):** per-person vault with a required list per engagement type, expiry reminders,
   view/download logging, e-signature for contracts and NDAs. HR uploads by default; HR can turn on
   developer self-upload per document type, or request one document from one person. Developer
   uploads wait as "to check" until HR accepts them.
2. **Backstage → Me (1c):** a person's own details, documents and policies to sign.
3. Phases 2 to 4: see the spec doc.
