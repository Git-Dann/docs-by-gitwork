# Foundry Agentic Platform Handover

## Current Direction

Build Foundry as the internal operating system for Gitwork's client lifecycle:

1. Scribe ingests Google Meet / Gemini notes against a client.
2. Agents use those notes to prepare a proposal draft in Docs.
3. Humans review, adjust, and send the proposal/signature pack.
4. Foundry watches for acceptance/signature completion.
5. Humans send onboarding and contract links.
6. Once onboarding and commercial sign-off are complete, the client moves from pending to active.
7. Foundry seeds the delivery plan: feature blocks, tasks, milestones, and the Gantt.

Customer portal work is intentionally deferred. This slice is the internal operator loop first.

## Independence Contract

Every product area must continue to work on its own:

- Scribe/meetings can be used without creating a proposal.
- Docs can create, edit, share, and sign documents without Scribe or onboarding.
- Onboarding links can be minted and completed without a signed proposal.
- Portal clients can be manually created, reviewed, activated, or archived.
- Tasks, feature blocks, milestones, and Gantt planning remain editable by hand.
- The automation console is a coordinator and readiness layer, not a replacement system of record.

The current implementation respects this by deriving state from existing tables and by keeping all workflow transitions manual. Write actions are explicit operator-triggered buttons: `Draft from notes`, `Send onboarding`, `Seed tasks + Gantt`, and the existing pending-to-active move.

## What Was Built In This Slice

### Automation Read Model

Server module:

- `src/server/foundry-automation.ts`

API route:

- `GET /api/foundry/automation`

The read model derives workflow state from existing tables only. No new Prisma model was added.

It currently reads:

- `WorkspaceClient.status`
- latest client `Meeting` / Scribe summary
- client `Document` records for proposals and legal docs
- `SignatureRequest` status
- `ClientOnboarding` status
- task, feature block, and milestone counts
- workspace `AuditLog` rows for Foundry automation actions

The returned pipeline stages are:

- `INTAKE_NEEDED`
- `DRAFT_PROPOSAL`
- `REVIEW_PROPOSAL`
- `WAITING_SIGNATURE`
- `SEND_ONBOARDING`
- `READY_TO_ACTIVATE`
- `READY_TO_SEED_PLAN`
- `DELIVERY_ACTIVE`

`DELIVERY_ACTIVE` is still derived so the lifecycle can recognise completed clients, but the default `items` queue now filters those rows out. The dashboard should behave as an action queue: draft, review, signature, onboarding, activation, and plan gaps. Fully active clients belong in Clients/Portal or a future completed/recently-completed view.

`DELIVERY_ACTIVE` also has a non-action fallback now; it must not surface an "Open delivery plan" task shortcut in the automation card. Developers continue to use their task-focused dashboard and task links only when there is task work to do.

Each returned row now includes compact operator context:

- `activity`: newest three lifecycle/activity entries, combining Foundry audit rows with derived signature/onboarding facts.
- `nudges`: advisory attention items only. They never block manual operation or trigger automatic sending, activation, or plan seeding.
- `completedItems`: a separate recent-completed list for active clients with seeded delivery plans.
- `runHistory`: latest audit-backed agent/operator runs with input, output, approval/update status, actor, and timestamp.

Current quiet nudge thresholds:

- `signature_stale`: waiting signature for at least 5 business days after sign-off was sent.
- `onboarding_stale`: onboarding incomplete for at least 3 business days after link creation, or 3 business days after sign-off if no link exists.
- `active_plan_gap`: active client with accepted/signed proposal context but no feature blocks, tasks, or milestones.

The automation GET endpoint is an operator surface and requires client-management permission for signed-in users. The individual write actions still enforce their own existing permissions.

### Automation Audit Trail

Existing workspace `AuditLog` is reused; no new table was added.

Recorded actions:

- `foundry.proposal_draft.previewed`
- `foundry.proposal_draft.prepared`
- `foundry.onboarding_link.prepared`
- `foundry.client.activated`
- `foundry.delivery_plan.seeded`
- `foundry.nudge.updated`

Targets use `client:<clientId>` so client-specific activity can be grouped without coupling the audit table to a new relation. Audit writes are append-only and should remain lightweight; failures do not block the underlying manual action.

### Scribe-To-Proposal Drafting

Server function:

- `previewProposalDraftFromMeeting()`
- `draftProposalFromMeeting()`

API route:

- `POST /api/foundry/automation/preview-proposal`
- `POST /api/foundry/automation/draft-proposal`

Input:

```json
{
  "clientId": "cuid",
  "meetingId": "optional meeting cuid"
}
```

Behaviour:

- Requires Docs manage permission and client scope.
- Uses the selected meeting or latest summarised Scribe meeting for the client.
- Refuses to create an empty draft if the meeting has no summary, decisions, or action items.
- Preview now happens before Docs creation. The operator reviews editable title, summary, objectives, scope touchpoints, assumptions, out-of-scope, and next steps.
- The create endpoint accepts the reviewed outline and uses those edits when building the Docs proposal sections.
- Creates a normal Docs `DRAFT` proposal with the standard proposal graph: sections, costing rows, timeline phases, links, CTAs, and assets.
- Prefills cover, intro, overview, objectives, scope touchpoints, assumptions, out-of-scope, next steps, and internal drafting notes from the Scribe summary/decisions/action items.
- Stores provenance in `Document.metadata.foundryAutomation.sourceMeetingId`.
- If the same meeting already has an open draft proposal, returns that existing draft instead of creating a duplicate.
- Records a Foundry audit entry when a preview is generated and when a draft is created or reopened.

### Nudge Controls

Server function:

- `updateAutomationNudge()`

API route:

- `POST /api/foundry/automation/nudge`

Behaviour:

- Requires Clients manage permission and client scope.
- Stores assign/snooze state as append-only `AuditLog` rows, not a new workflow table.
- The dashboard can assign a nudge to the current operator or snooze it for three days.
- Nudge controls remain advisory and do not change the underlying client lifecycle.

### Manual Plan Seeding

Server function:

- `previewProjectPlanFromProposal()`
- `seedProjectPlanFromProposal()`

API route:

- `POST /api/foundry/automation/preview-project-plan`
- `POST /api/foundry/automation/seed-project-plan`

Input:

```json
{
  "clientId": "cuid",
  "documentId": "optional proposal cuid",
  "startDate": "optional ISO date"
}
```

Behaviour:

- Requires an active client.
- Requires an accepted or signed proposal unless an explicit proposal id is supplied.
- Preview returns the exact feature blocks, tasks, milestones, dates, and skip markers before any write occurs.
- Converts each proposal `TimelinePhase` into a `FeatureBlock`.
- Converts each phase deliverable into a `Task`.
- Adds a phase-end `Milestone`.
- Uses `clickupId` provenance keys like `foundry-plan:<documentId>:<phaseId>` so repeat runs skip previously generated records.
- The seed write path now reuses the preview payload shape so the reviewed records and created records do not drift.
- Successful seed runs record how many blocks, tasks, and milestones were created or skipped.

### Manual Onboarding Link Action

Server functions:

- `createAutomationOnboardingLink()`
- `createOnboardingLinkForClient()`

API route:

- `POST /api/foundry/automation/onboarding-link`

Input:

```json
{
  "clientId": "cuid"
}
```

Behaviour:

- Requires Clients manage permission and client scope.
- Requires an accepted proposal or completed signature request before minting.
- Reuses any open client-linked onboarding row before creating a new one.
- Creates a normal public `/onboarding/[token]` URL using the default onboarding form snapshot.
- Prefills the onboarding row from the existing client record where possible.
- The automation modal gives the operator copy, preview, and `mailto:` handoff controls; it does not auto-send email.
- Public submit for a client-linked onboarding row now updates that existing `WorkspaceClient` and marks the onboarding `SUBMITTED`, instead of creating a duplicate pending client.
- Preparing or reusing a link records a Foundry audit entry.

### HQ UI

Component:

- `src/components/dashboard/agentic-workflow-card.tsx`

Hook:

- `src/hooks/use-foundry-automation.ts`

API helpers:

- `createAutomationOnboardingLink()`
- `draftProposalFromMeeting()`
- `getFoundryAutomation()`
- `previewProjectPlan()`
- `seedProjectPlan()`

Mounted in:

- `src/components/app-overview.tsx`

It appears on Foundry HQ for users who can see Portal and Docs and can manage clients. Each row shows client stage, gate states, confidence, source context, one next action, at most one attention nudge, and a muted latest-activity line.

The row list intentionally excludes fully active delivery clients by default. Summary counts are based on actionable rows, so active clients with seeded delivery plans do not crowd out work that needs an operator or agent action.

The `Draft from notes` action appears when a client has Scribe notes but no proposal draft. It creates or reopens the meeting-derived draft and routes the operator into Docs for review.

Current behaviour is review-before-create: `Draft from notes` opens a proposal outline review modal first. Only `Create Docs draft` writes the proposal record.

The `Send onboarding` action appears after commercial sign-off but before onboarding is submitted. It creates/reuses a client-linked onboarding URL, then shows copy/preview/email controls in a modal.

The `Seed tasks + Gantt` action now opens a plan review modal first. Operators can inspect the generated timeline, adjust the start date, refresh the preview, see which records already exist, then explicitly create the plan.

Additional HQ controls:

- Completed toggle: shows recent `DELIVERY_ACTIVE` clients outside the default action queue.
- Runs toggle: shows audit-backed agent/operator run history.
- Per-row assign/snooze: updates advisory nudge state.
- Actions drawer: independent manual shortcuts for proposal review, onboarding link, plan review/seed, and client record.

### Client Lifecycle Timeline

Component:

- `src/components/clients/client-detail.tsx`

Server context:

- `src/server/clients.ts`

Client detail now returns a derived `lifecycle` array. It combines client creation/status, proposal draft/signature state, onboarding state, activation audit, and delivery-plan seed audit. This gives each client record a compact lifecycle timeline without requiring operators to use the automation dashboard.

### Pending Activation Checklist

Component:

- `src/components/clients/client-detail.tsx`

Server context:

- `src/server/clients.ts`

The pending-review banner now shows a manual activation checklist before a client is moved to active:

- onboarding submitted
- commercial sign-off
- contract pack
- primary contact
- delivery setup
- bank details

Required checks are visually called out, but the button still remains a human override. This preserves the manual gate while making missing setup visible. Client detail document lookup now includes linked `SOW`, `MSA`, `NDA`, and `DSA` records as well as proposals so the checklist can identify accepted legal docs where they exist.

The status route now requires client-management permission for signed-in users. Moving `PENDING_REVIEW` to `ACTIVE` records `foundry.client.activated` in the workspace audit log.

## Deliberate Manual Gates

Do not remove these without Dan explicitly asking:

- Proposal drafting can be agent-assisted from Scribe notes, but human review/send remains required.
- Signature/contract completion is observed, not bypassed.
- Onboarding link creation/sending remains manual.
- Pending-to-active remains manual.
- Plan seeding is manual and previewed, even though the generated records are automated.

This keeps the product agentic without turning it into an unchecked workflow robot.

## Important Existing Context

Relevant existing modules:

- Scribe/Gemini notes: `src/server/meetings.ts`
- Docs/proposals/signatures: `src/server/proposals.ts`, `src/server/signatures.ts`
- Onboarding links and pending clients: `src/server/onboarding.ts`, `src/server/clients.ts`
- Tasks/Gantt: `src/server/tasks.ts`, `src/server/feature-blocks.ts`, `src/server/milestones.ts`
- Portal client detail: `src/components/clients/client-detail.tsx`

Existing “Move to workflow” still only flips `PENDING_REVIEW` to `ACTIVE`; this slice keeps that manual gate but now audits the move.

## Portal Wiki Documentation Slice

The client Portal wiki now supports optional documentation pages beyond IA and Developer Guide:

- API Docs
- Architecture
- Runbook
- Data Model

These are first-class `WikiPageType` enum values in `prisma/schema.prisma` and are stored in `ClientWikiPage` like the existing markdown guide pages. The change is additive; existing wiki rows are untouched.

Because the new pages are enum values, any environment needs the Prisma schema synced before writes to these page types will succeed. Locally this was fixed with `npx -y -p node@22 -c "node node_modules/prisma/build/index.js db push"`.

The private wiki sidebar now has a compact `Add New` menu. Core pages remain visible, while optional docs pages appear in the sidebar once created. Adding a page creates it with a markdown starter template, selects it, and uses the existing editor autosave/preview/share workflow.

Touched areas:

- Schema: `prisma/schema.prisma`
- Server/share allow-list: `src/server/wiki.ts`
- Private wiki UI: `src/components/clients/wiki/wiki-workspace.tsx`, `src/components/clients/wiki/wiki-sidebar.tsx`, `src/components/clients/wiki/wiki-page-editor.tsx`
- Public wiki UI and labels: `src/components/clients/wiki/wiki-public-view.tsx`, `src/app/wiki/[token]/page.tsx`, `src/lib/og/load-entity.ts`
- API validation: `src/app/api/clients/[slug]/wiki/pages/route.ts`, `src/app/api/clients/[slug]/wiki/share/route.ts`

## Verification Notes

The previous local failures were caused by running/installing dependencies under Node 24 while the project declares Node 22. The fix was:

- Rebuilt `node_modules` from `package-lock.json` using Node 22:
  `npx -y -p node@22 -c "node -v && npm ci"`
- Regenerated Prisma with Node 22:
  `npx -y -p node@22 -c "node node_modules/prisma/build/index.js generate"`
- Added runtime guardrails:
  - `.nvmrc`
  - `.node-version`
  - `.npmrc` with `engine-strict=true`

Current verification results:

- `npx -y -p node@22 -c "node node_modules/prisma/build/index.js generate"` passes.
- `npx -y -p node@22 -c "node node_modules/typescript/bin/tsc --noEmit --pretty false"` passes.
- Targeted lint for the touched files passes:
  `npx -y -p node@22 -c "node node_modules/eslint/bin/eslint.js src/server/foundry-automation.ts src/server/audit-log.ts src/server/clients.ts src/types/foundry-automation.ts src/components/dashboard/agentic-workflow-card.tsx src/components/app-overview.tsx src/app/api/clients/[slug]/status/route.ts src/app/api/foundry/automation/route.ts src/app/api/foundry/automation/draft-proposal/route.ts src/app/api/foundry/automation/onboarding-link/route.ts src/app/api/foundry/automation/seed-project-plan/route.ts src/app/api/foundry/automation/preview-project-plan/route.ts"`
- Dev server boots under Node 22:
  `npx -y -p node@22 -c "npm run dev"`
- HTTP smoke checks:
  - `HEAD /app` returns `307` to `/login?callbackUrl=%2Fapp`, expected for unauthenticated app access.
  - `HEAD /api/health` returns `200 OK`.

Duplicate local files named like `* 2.ts`, `* 2.tsx`, and `* 2.mts` are now ignored by TypeScript and ESLint, and duplicate `* 2.json` / `* 2.tsbuildinfo` files are ignored by Git. This prevents local copy-conflict files from being treated as source.

Markdown duplicates like `* 2.md` are also ignored after an extra local duplicate handover file appeared.

During this slice, `eslint-plugin-jsx-a11y` was missing an internal util file in `node_modules`; rebuilding with Node 22 restored the package tree and targeted lint passed. `npm ci` reports existing audit findings (9 moderate, 9 high) that were not changed in this slice.

Note: a full `npm run lint` no longer crashes after the dependency rebuild, but it was manually stopped after about two minutes of silent runtime. Use the targeted command above for this slice, and revisit full-workspace lint performance separately.

## Recommended Next Steps

1. Add real email sending for onboarding links once an email provider is configured; keep copy/mailto as fallback.
2. Turn advisory nudges into optional notifications once Dan wants proactive alerts outside HQ.
3. Replace assign-to-me with a real teammate picker if nudge ownership needs team routing.
4. Expand agent run history into a full audit explorer if operators need filtering/export.
5. Once the internal loop is stable, design the customer portal around the already-seeded timeline, docs, comments, and onboarding status.
