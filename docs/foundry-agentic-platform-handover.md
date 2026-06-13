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

The current implementation respects this by deriving state from existing tables and by keeping all workflow transitions manual. The only write action is an explicit operator-triggered `Seed tasks + Gantt` button.

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

The returned pipeline stages are:

- `INTAKE_NEEDED`
- `DRAFT_PROPOSAL`
- `REVIEW_PROPOSAL`
- `WAITING_SIGNATURE`
- `SEND_ONBOARDING`
- `READY_TO_ACTIVATE`
- `READY_TO_SEED_PLAN`
- `DELIVERY_ACTIVE`

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

### HQ UI

Component:

- `src/components/dashboard/agentic-workflow-card.tsx`

Hook:

- `src/hooks/use-foundry-automation.ts`

API helpers:

- `getFoundryAutomation()`
- `previewProjectPlan()`
- `seedProjectPlan()`

Mounted in:

- `src/components/app-overview.tsx`

It appears on Foundry HQ for users who can see both clients and docs. Each row shows client stage, gate states, confidence, source context, and one next action.

The `Seed tasks + Gantt` action now opens a plan review modal first. Operators can inspect the generated timeline, adjust the start date, refresh the preview, see which records already exist, then explicitly create the plan.

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

## Deliberate Manual Gates

Do not remove these without Dan explicitly asking:

- Proposal drafting can be agent-assisted, but human review/send remains required.
- Signature/contract completion is observed, not bypassed.
- Onboarding link sending remains manual.
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

Existing “Move to workflow” currently only flips `PENDING_REVIEW` to `ACTIVE`; this slice does not alter that gate.

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
  `npx -y -p node@22 -c "node node_modules/eslint/bin/eslint.js src/server/foundry-automation.ts src/server/clients.ts src/types/foundry-automation.ts src/lib/api.ts src/hooks/use-foundry-automation.ts src/components/dashboard/agentic-workflow-card.tsx src/components/clients/client-detail.tsx src/app/api/foundry/automation/route.ts src/app/api/foundry/automation/seed-project-plan/route.ts src/app/api/foundry/automation/preview-project-plan/route.ts"`
- Dev server boots under Node 22:
  `npx -y -p node@22 -c "npm run dev"`
- HTTP smoke checks:
  - `HEAD /app` returns `307` to `/login?callbackUrl=%2Fapp`, expected for unauthenticated app access.
  - `HEAD /api/health` returns `200 OK`.

Duplicate local files named like `* 2.ts`, `* 2.tsx`, and `* 2.mts` are now ignored by TypeScript and ESLint, and duplicate `* 2.json` / `* 2.tsbuildinfo` files are ignored by Git. This prevents local copy-conflict files from being treated as source.

During this slice, `eslint-plugin-jsx-a11y` was missing an internal util file in `node_modules`; rebuilding with Node 22 restored the package tree and targeted lint passed. `npm ci` reports existing audit findings (9 moderate, 9 high) that were not changed in this slice.

Note: a full `npm run lint` no longer crashes after the dependency rebuild, but it was manually stopped after about two minutes of silent runtime. Use the targeted command above for this slice, and revisit full-workspace lint performance separately.

## Recommended Next Steps

1. Add an agent-assisted proposal draft action that starts from the latest Scribe meeting summary and opens a Docs draft.
2. Add a “send onboarding” action that can mint/copy an onboarding link from the automation row.
3. Add audit logging for preview/seed-plan actions and pending-to-active moves.
4. Add notification hooks for stale signatures, incomplete onboarding, and active clients without delivery plans.
5. Once the internal loop is stable, design the customer portal around the already-seeded timeline, docs, comments, and onboarding status.
