# ClickUp → Foundry migration + Tasks v3 — Plan

> Status: **planning — do not build until Dan gives the go-ahead.** One-time migration
> (ClickUp is retired after). Built on the existing Tasks v1/v2 (board · list · gantt ·
> feature blocks · public timeline · daily Slack standups · dev scoping).

## Decisions (locked with Dan)

| Topic | Decision |
|---|---|
| Clients | Import ~all 12 ClickUp client folders; match by name to `WorkspaceClient` (+ existing `clickupUrl`); report any that don't match for manual confirmation |
| Tasks | **Active only** (exclude complete/closed/done) |
| Direction | **One-time migration**, retire ClickUp. No ongoing sync. |
| Milestones | **New feature** — single-date **markers** on the timeline (NOT feature blocks) |
| Feature blocks | Get start/end **manually** (Dan dates them); undated blocks are board-only |
| Backlog/QA lists | Board-only (no Gantt) |
| Statuses | Collapse to our 5 (unified map below) |
| Priority | Fold ClickUp **urgent → High** (we keep Low/Medium/High) |
| Assignees | **Multi-assignee.** Map ClickUp names → known Code devs; unknown → unassigned (Dan fixes). Include Dan. |
| Dev accounts | **Create a Foundry User per known Code dev** (developer preset, no password until invited). Dan supplies emails. |
| Support/Feedback lists | **Skip** (Care module handles support now) |
| Custom fields | Preserve as **task metadata** (`Task.metadata` JSON) |
| Subtasks | **Import, one level deep** (flatten deeper nesting up to that level) |
| Deps / time / tags | Drop for v1 |
| Legacy/noise lists | Skip (`{{Legacy}} Task Tracker`, `Luke Call`, `Course Requests`) |
| Retainer | **Import** Retainer Log lists; add an optional **`retainerDays`** field to every client, shown only when filled |
| Public timeline | Keyed on **feature blocks** (bars); milestones also render as markers |
| New fields | Every task & subtask gets **description** + **optional acceptance criteria** |

## ClickUp reality (for reference)
- `Clients` space → Folder per client → Lists (workstreams) → Tasks. 12 folders.
- Timeline lives in a per-folder **`Milestones`** list (dated items); working tasks mostly have no due date.
- Only 3 paid seats; devs appear as **native (guest) assignees** AND a **custom "Assignee" label** field (28 names). Multi-assignee common.
- Per-space custom statuses (e.g. `not started · in progress · send to qa · complete`).
- Custom fields: Dept, Release Status, Test Type, Overall Result, Tester, Test Date, Build Number, Category, + ClickUp baseline date fields.
- Volume is large and mostly historical (one Build list = 91 tasks, mostly complete) → active-only is essential.

---

## Part A — Schema (additive; indexed `clickupId`, never `@unique` — db-push data-loss lesson)

1. **Multi-assignee** — drop `Task.assigneeId`; add `Task.assignees User[]` (implicit m-n) + `User.assignedTasks`.
2. **Subtasks** — `Task.parentId String?` self-relation (`parent` / `subtasks`). One level used.
3. **Acceptance criteria** — `Task.acceptanceCriteria String? @db.Text`.
4. **Optional block dates** — `FeatureBlock.startDate/endDate` → **nullable**. Undated = board grouping; dated = Gantt bar.
5. **`Milestone`** — `{ id, workspaceId, clientId, name, date, description? @db.Text, color?, clickupId?, createdAt, updatedAt }` (+ relations, `@@index([clientId, date])`).
6. **Task metadata** — `Task.metadata Json?` (imported custom fields).
7. **Import keys** — `clickupId String?` (indexed) on `Task`, `FeatureBlock`, `Milestone` for idempotent re-runs.
8. **Retainer** — `WorkspaceClient.retainerDays Int?` (monthly allocation; UI shows only when set).

## Part B — App changes (a real release on their own, independent of ClickUp)

- **Multi-assignee everywhere**: DTO `assignees[]`; board card → avatar **stack**; task form → multi-select; drawer → assignee list; **standup "My Day", dev scoping, DevOps roll-up** switch to `assignees: { some: { id } }` (a 3-assignee task appears for all 3, confirmed).
- **Subtasks UI**: detail drawer shows a subtask list (each: status, assignees, description, AC; opens like a task); card shows "✓ 2/5"; create-subtask action.
- **Acceptance criteria**: optional field in task form + drawer.
- **Undated blocks**: block form allows blank dates; board groups by block (incl. undated); Gantt renders only dated blocks; "Add timeline dates" promotes a block to a bar.
- **Milestones**: CRUD (server/api/hooks/form) + render as diamond markers on the Gantt at their date (internal + public) with label; "New milestone" on the tasks page.
- **Task metadata**: optional "Details" section in the drawer (Dept / Build / Category…).
- **Retainer days**: editable on the client (client edit form); shown on the client detail page + per-client tasks header **only when set**.

## Part C — Migration (one-time, idempotent)

- **Mechanism**: `scripts/import-clickup.ts`, run with **`CLICKUP_TOKEN` (Dan provides) + prod `DIRECT_URL`**. `--dry-run` prints a per-client / per-list / per-status count report for review before the live run. Re-runnable (upsert by `clickupId`); one DB transaction per client.
- **Dev accounts first**: from Dan's `name → email` list, create `User` + `WorkspaceMember` (developer preset, `seeAllClients` off, no password) for each known dev (+ Dan). This is the assignee target.
- **Client match**: folder name → `WorkspaceClient` (case-insensitive + `clickupUrl`); unmatched → reported, not auto-created.
- **Lists → FeatureBlocks** (undated, `clickupId`). Skip: `Milestones` (→ markers), Support/Feedback/Care-type, `{{Legacy}}`, `Luke Call`, `Course Requests`. **Include** `Retainer Log`.
- **Milestones list → `Milestone`** records (date = due date).
- **Tasks (active only)**: title, full description, status→5, priority (urgent→High), **multi-assignee** (native + label), block = its list, due date, `metadata` (custom fields), blank acceptance criteria, `clickupId`. **Subtasks** → child Tasks (`parentId`), one level (deeper nesting re-parented up).
- **Status map**: `not started/open → To Do` · `in progress → Doing` · `send to qa/review → In Review` · `blocked → Doing` · unknown → Backlog (done/closed excluded by active-only).
- **Assignee resolution**: normalise ClickUp name → the dev Users (Code roster + CodeClear candidates + the created accounts + Dan); handles variants ("Liaquat"/"Liaquat Ali", "Abdul"/"Abdur Rehman"); unmatched → unassigned.
- **Derive `ClientAssignment`**: if a dev has ≥1 imported task for a client, link dev↔client so the "dev sees only their clients" scoping works immediately.
- **Retainer**: import `Retainer Log` lists as a block + tasks; `retainerDays` itself is set by Dan (optionally pre-read from the "Retainer Clients" list if it carries the number).

## Part D — Sequencing

1. **Phase 1** — schema + app changes (multi-assignee, subtasks, AC, optional block dates, milestones, metadata, retainer field). Ships independently of ClickUp. Includes the carousel overflow fix.
2. **Phase 2** — build importer; **dry-run**; review counts with Dan; live import.
3. **Phase 3** — Dan adds block start/end dates (creates Gantt bars), fixes any unassigned tasks, sets `retainerDays`.

### Needed from Dan
- Dev **name → email** list (to create the accounts).
- **ClickUp API token** (for the script) — Dan handling.

## Verification
- `prisma validate` · `tsc` · `eslint` · `next build` after Phase 1.
- Importer: dry-run report reviewed before live; idempotent re-run leaves no dupes; active-only + skip-lists honoured; spot-check one client (Ace Grading) end-to-end (blocks, tasks, subtasks, assignees, milestones).

## Risks / notes
- Multi-assignee is a broad refactor of v1 (scoping, standup, roll-up, UI).
- Active-only volume still unknown until the dry-run — that's the gate.
- Keep `clickupId` **indexed, not unique** (a unique-add would make `prisma db push` skip the whole migration).
- Assignee name variants need a normalisation/alias table.

---

## Phase 2 — IMPLEMENTED (June 2026)

Importer shipped as `src/server/clickup-import.ts` + `POST /api/dev/import-clickup`
(admin-only, `dynamic`, `maxDuration=300`). Token-based (no MCP) — see CLAUDE.md §13.8
for the full rationale and field mapping.

**Run order:**
1. Add `CLICKUP_TOKEN` (a `pk_…` ClickUp personal token) to Vercel env.
2. `POST /api/dev/seed-team` (once) — seeds the dev roster as Foundry Users so
   assignees resolve. Without it, knowns land in `knownButMissingUsers`.
3. `POST /api/dev/import-clickup` with no body (or `{"dryRun":true}`) — **dry-run**.
   Returns per-client counts + `unmatchedFolders` / `unmatchedAssignees` /
   `knownButMissingUsers`. **Nothing is written.** This is the review gate.
4. (Optional) pilot one client: `{"dryRun":false,"clientSlug":"ace-grading"}`.
5. Go live: `{"dryRun":false}`. Idempotent — re-running reconciles (keyed on `clickupId`).
6. Remove `CLICKUP_TOKEN` from the env once done.

**If the dry-run shows unmatched folders/assignees:** add the folder→slug entry to
`FOLDER_ALIASES`, or a name alias to `TEAM_ROSTER` in `team-roster.ts`, and re-run the
dry-run. Retainer lists are imported (not skipped) — eyeball their counts in the dry-run
and tell me to skip if noisy.
