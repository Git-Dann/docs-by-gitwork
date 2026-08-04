import { Prisma } from "@prisma/client";
import { applyClientNameToSections } from "@/lib/apply-client-name";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { resolveDocumentOwnerName } from "@/lib/document-owner";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { allocateDocumentNumber } from "@/server/documents";
import { createOnboardingLinkForClient } from "@/server/onboarding";
import { recordAuditEntry } from "@/server/audit-log";
import {
  assertCan,
  canManageClients,
  canManageDocs,
  canSeeAllClients,
  type EffectiveUser,
  ForbiddenError,
} from "@/server/auth/effective-user";
import { assertClientInScope, assignedClientIds } from "@/server/tasks";
import type {
  AutomationAction,
  AutomationActivityRef,
  AutomationDocumentRef,
  AutomationGate,
  AutomationGateState,
  AutomationMeetingRef,
  AutomationNudge,
  AutomationNudgeKind,
  AutomationNudgeUpdateRequest,
  AutomationNudgeUpdateResult,
  AutomationOnboardingRef,
  AutomationOnboardingLinkRequest,
  AutomationOnboardingLinkResult,
  AutomationProjectPlanRef,
  AutomationRunHistoryItem,
  AutomationStageKey,
  DraftProposalRequest,
  DraftProposalResult,
  FoundryAutomationItem,
  FoundryAutomationResponse,
  ProposalDraftEdits,
  ProposalDraftPreview,
  ProposalDraftPreviewRequest,
  ProjectPlanPreview,
  ProjectPlanPreviewBlock,
  ProjectPlanPreviewMilestone,
  ProjectPlanRequest,
  SeedProjectPlanResult,
} from "@/types/foundry-automation";
import type { WorkspaceClientStatus } from "@/types/client";
import {
  getDefaultAssetPayload,
  getDefaultCostsPayload,
  getDefaultCtaPayload,
  getDefaultLinkPayload,
  getDefaultSectionPayload,
  getDefaultTimelinePayload,
} from "@/server/proposals";

const LEGAL_DOCUMENT_TYPES = new Set(["SOW", "MSA", "NDA", "DSA"]);
const PLAN_COLORS = ["blue", "violet", "emerald", "amber", "rose", "slate"];
const FOUNDRY_AUDIT_ACTIONS = [
  "foundry.proposal_draft.previewed",
  "foundry.proposal_draft.prepared",
  "foundry.onboarding_link.prepared",
  "foundry.client.activated",
  "foundry.delivery_plan.seeded",
  "foundry.nudge.updated",
] as const;
const SIGNATURE_STALE_BUSINESS_DAYS = 5;
const ONBOARDING_STALE_BUSINESS_DAYS = 3;

type AutomationDocumentRow = {
  id: string;
  title: string;
  status: string;
  documentType: string;
  updatedAt: Date;
  acceptedAt: Date | null;
  signatureRequests: Array<{
    status: string;
    sentAt: Date | null;
    completedAt: Date | null;
  }>;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function docRef(row: AutomationDocumentRow | null | undefined): AutomationDocumentRef | null {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    documentType: row.documentType,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hasCompletedSignature(row: AutomationDocumentRow | null | undefined): boolean {
  if (!row) return false;
  return row.signatureRequests.some((request) => request.status === "COMPLETED");
}

function hasSentSignature(row: AutomationDocumentRow | null | undefined): boolean {
  if (!row) return false;
  return row.signatureRequests.some((request) => request.status === "SENT");
}

function isSignedOrAccepted(row: AutomationDocumentRow | null | undefined): boolean {
  return Boolean(row && (row.status === "ACCEPTED" || hasCompletedSignature(row)));
}

function gate(
  key: AutomationGate["key"],
  label: string,
  state: AutomationGateState,
  detail: string,
): AutomationGate {
  return { key, label, state, detail };
}

function stageLabel(stage: AutomationStageKey): string {
  switch (stage) {
    case "INTAKE_NEEDED":
      return "Needs intake";
    case "DRAFT_PROPOSAL":
      return "Ready to draft";
    case "REVIEW_PROPOSAL":
      return "Proposal review";
    case "WAITING_SIGNATURE":
      return "Waiting signature";
    case "SEND_ONBOARDING":
      return "Send onboarding";
    case "READY_TO_ACTIVATE":
      return "Ready to activate";
    case "READY_TO_SEED_PLAN":
      return "Seed delivery plan";
    case "DELIVERY_ACTIVE":
      return "Delivery active";
  }
}

function stageRank(stage: AutomationStageKey): number {
  return {
    READY_TO_ACTIVATE: 0,
    READY_TO_SEED_PLAN: 1,
    REVIEW_PROPOSAL: 2,
    SEND_ONBOARDING: 3,
    WAITING_SIGNATURE: 4,
    DRAFT_PROPOSAL: 5,
    INTAKE_NEEDED: 6,
    DELIVERY_ACTIVE: 7,
  }[stage];
}

function confidenceFromGates(gates: AutomationGate[]): number {
  const score = gates.reduce((total, entry) => {
    if (entry.state === "done") return total + 1;
    if (entry.state === "ready") return total + 0.65;
    return total;
  }, 0);
  return Math.round((score / gates.length) * 100);
}

function meetingRef(
  row:
    | {
        id: string;
        title: string;
        status: string;
        startedAt: Date | null;
        summary: string | null;
        actionItems: Array<{ id: string }>;
      }
    | null
    | undefined,
): AutomationMeetingRef | null {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startedAt: iso(row.startedAt),
    summary: row.summary,
    actionItemCount: row.actionItems.length,
  };
}

function onboardingRef(
  row:
    | {
        id: string;
        status: string;
        createdAt: Date;
        submittedAt: Date | null;
        linkedAt: Date | null;
      }
    | null
    | undefined,
): AutomationOnboardingRef | null {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    submittedAt: iso(row.submittedAt),
    linkedAt: iso(row.linkedAt),
  };
}

function nextActionFor(input: {
  stage: AutomationStageKey;
  clientSlug: string;
  proposal: AutomationDocumentRow | null;
}): AutomationAction {
  const docHref = input.proposal ? `/app/docs/${input.proposal.id}` : "/app/docs";
  switch (input.stage) {
    case "DRAFT_PROPOSAL":
      return { kind: "draft_proposal", label: "Draft from notes" };
    case "REVIEW_PROPOSAL":
      return { kind: "link", label: "Review and send", href: docHref };
    case "WAITING_SIGNATURE":
      return { kind: "link", label: "Check signature request", href: docHref };
    case "SEND_ONBOARDING":
      return { kind: "send_onboarding", label: "Send onboarding" };
    case "READY_TO_ACTIVATE":
      return { kind: "link", label: "Review and activate", href: `/app/portal/${input.clientSlug}` };
    case "READY_TO_SEED_PLAN":
      return { kind: "seed_project_plan", label: "Seed tasks + Gantt" };
    case "DELIVERY_ACTIVE":
      return { kind: "none", label: "Delivery active" };
    case "INTAKE_NEEDED":
      return { kind: "link", label: "Open client record", href: `/app/portal/${input.clientSlug}` };
  }
}

type AutomationAuditRow = {
  id: string;
  action: string;
  target: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  actor: { name: string | null; email: string } | null;
};

type NudgeState = NonNullable<AutomationNudge["state"]>;

type DraftMeetingRow = {
  id: string;
  title: string;
  startedAt: Date | null;
  status: string;
  summary: string | null;
  decisions: Prisma.JsonValue | null;
  actionItems: Array<{ title: string | null; text: string; owner: string | null }>;
};

function clientTarget(clientId: string): string {
  return `client:${clientId}`;
}

function groupAuditRowsByClient(rows: AutomationAuditRow[]): Map<string, AutomationAuditRow[]> {
  const grouped = new Map<string, AutomationAuditRow[]>();
  for (const row of rows) {
    const clientId = row.target?.startsWith("client:") ? row.target.slice("client:".length) : null;
    if (!clientId) continue;
    const entries = grouped.get(clientId) ?? [];
    entries.push(row);
    grouped.set(clientId, entries);
  }
  return grouped;
}

function metadataRecord(value: Prisma.JsonValue): Prisma.JsonObject {
  return isPlainObject(value) ? value : {};
}

function metadataString(metadata: Prisma.JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataNumber(metadata: Prisma.JsonObject, key: string): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataBoolean(metadata: Prisma.JsonObject, key: string): boolean | null {
  const value = metadata[key];
  return typeof value === "boolean" ? value : null;
}

function actorName(actor: AutomationAuditRow["actor"]): string | null {
  return actor?.name || actor?.email || null;
}

function auditActivity(row: AutomationAuditRow): AutomationActivityRef | null {
  const metadata = metadataRecord(row.metadata);
  const nudgeKind = metadataString(metadata, "nudgeKind");
  const proposalTitle = metadataString(metadata, "proposalTitle") ?? "Proposal draft";
  const meetingTitle = metadataString(metadata, "meetingTitle") ?? "Scribe notes";
  const created = metadataBoolean(metadata, "created");
  const createdBlocks = metadataNumber(metadata, "createdFeatureBlocks") ?? 0;
  const createdTasks = metadataNumber(metadata, "createdTasks") ?? 0;
  const createdMilestones = metadataNumber(metadata, "createdMilestones") ?? 0;

  switch (row.action) {
    case "foundry.proposal_draft.previewed":
      return {
        id: `audit:${row.id}`,
        kind: "proposal_preview",
        label: "Proposal preview reviewed",
        detail: `${proposalTitle} generated from ${meetingTitle}.`,
        at: row.createdAt.toISOString(),
        actorName: actorName(row.actor),
      };
    case "foundry.proposal_draft.prepared":
      return {
        id: `audit:${row.id}`,
        kind: "proposal_draft",
        label: "Proposal draft prepared",
        detail: `${proposalTitle} ${created === false ? "reopened" : "created"} from ${meetingTitle}.`,
        at: row.createdAt.toISOString(),
        actorName: actorName(row.actor),
      };
    case "foundry.onboarding_link.prepared":
      return {
        id: `audit:${row.id}`,
        kind: "onboarding_link",
        label: "Onboarding link ready",
        detail: created === false ? "Existing onboarding link reused." : "New onboarding link prepared.",
        at: row.createdAt.toISOString(),
        actorName: actorName(row.actor),
      };
    case "foundry.client.activated":
      return {
        id: `audit:${row.id}`,
        kind: "client_activated",
        label: "Client activated",
        detail: "Moved from pending review to active.",
        at: row.createdAt.toISOString(),
        actorName: actorName(row.actor),
      };
    case "foundry.delivery_plan.seeded":
      return {
        id: `audit:${row.id}`,
        kind: "delivery_plan_seeded",
        label: "Delivery plan seeded",
        detail: `${createdBlocks} blocks, ${createdTasks} tasks, and ${createdMilestones} milestones created.`,
        at: row.createdAt.toISOString(),
        actorName: actorName(row.actor),
      };
    case "foundry.nudge.updated":
      return {
        id: `audit:${row.id}`,
        kind: "nudge_updated",
        label: "Nudge updated",
        detail: nudgeKind ? `${nudgeKind.replace(/_/g, " ")} was assigned or snoozed.` : "Nudge was updated.",
        at: row.createdAt.toISOString(),
        actorName: actorName(row.actor),
      };
    default:
      return null;
  }
}

function runHistoryFromAuditRows(rows: AutomationAuditRow[]): AutomationRunHistoryItem[] {
  return rows.flatMap((row) => {
    const metadata = metadataRecord(row.metadata);
    const clientId = metadataString(metadata, "clientId") ?? row.target?.replace(/^client:/, "") ?? "";
    if (!clientId) return [];
    const entry = (value: AutomationRunHistoryItem): AutomationRunHistoryItem[] => [value];
    const clientName = metadataString(metadata, "clientName");
    const meetingTitle = metadataString(metadata, "meetingTitle") ?? "Scribe notes";
    const proposalTitle = metadataString(metadata, "proposalTitle") ?? "Proposal draft";
    const sourceDocumentTitle = metadataString(metadata, "sourceDocumentTitle") ?? "Proposal";
    const createdTasks = metadataNumber(metadata, "createdTasks") ?? 0;
    const createdBlocks = metadataNumber(metadata, "createdFeatureBlocks") ?? 0;
    const createdMilestones = metadataNumber(metadata, "createdMilestones") ?? 0;

    switch (row.action) {
      case "foundry.proposal_draft.previewed":
        return entry({
          id: row.id,
          clientId,
          clientName,
          action: row.action,
          label: "Proposal outline previewed",
          status: "PREVIEWED" as const,
          inputSummary: meetingTitle,
          outputSummary: proposalTitle,
          at: row.createdAt.toISOString(),
          actorName: actorName(row.actor),
        });
      case "foundry.proposal_draft.prepared":
        return entry({
          id: row.id,
          clientId,
          clientName,
          action: row.action,
          label: "Proposal draft approved",
          status: "APPROVED" as const,
          inputSummary: meetingTitle,
          outputSummary: proposalTitle,
          at: row.createdAt.toISOString(),
          actorName: actorName(row.actor),
        });
      case "foundry.onboarding_link.prepared":
        return entry({
          id: row.id,
          clientId,
          clientName,
          action: row.action,
          label: "Onboarding link prepared",
          status: "APPROVED" as const,
          inputSummary: "Commercial sign-off",
          outputSummary: metadataString(metadata, "status") ?? "Onboarding link",
          at: row.createdAt.toISOString(),
          actorName: actorName(row.actor),
        });
      case "foundry.delivery_plan.seeded":
        return entry({
          id: row.id,
          clientId,
          clientName,
          action: row.action,
          label: "Delivery plan seeded",
          status: "APPROVED" as const,
          inputSummary: sourceDocumentTitle,
          outputSummary: `${createdBlocks} blocks, ${createdTasks} tasks, ${createdMilestones} milestones`,
          at: row.createdAt.toISOString(),
          actorName: actorName(row.actor),
        });
      case "foundry.nudge.updated":
        return entry({
          id: row.id,
          clientId,
          clientName,
          action: row.action,
          label: "Nudge updated",
          status: "UPDATED" as const,
          inputSummary: metadataString(metadata, "nudgeKind")?.replace(/_/g, " ") ?? "Nudge",
          outputSummary: metadataString(metadata, "note") ?? "Assigned or snoozed",
          at: row.createdAt.toISOString(),
          actorName: actorName(row.actor),
        });
      default:
        return [];
    }
  });
}

function latestNudgeStatesByClient(rows: AutomationAuditRow[]): Map<string, Map<AutomationNudgeKind, NudgeState>> {
  const grouped = new Map<string, Map<AutomationNudgeKind, NudgeState>>();
  for (const row of rows) {
    if (row.action !== "foundry.nudge.updated") continue;
    const metadata = metadataRecord(row.metadata);
    const clientId = metadataString(metadata, "clientId") ?? row.target?.replace(/^client:/, "") ?? null;
    const kind = metadataString(metadata, "nudgeKind") as AutomationNudgeKind | null;
    if (!clientId || !kind) continue;
    const current = grouped.get(clientId)?.get(kind);
    if (current?.updatedAt && Date.parse(current.updatedAt) > row.createdAt.getTime()) continue;
    const clientStates = grouped.get(clientId) ?? new Map<AutomationNudgeKind, NudgeState>();
    clientStates.set(kind, {
      assignedToName: metadataString(metadata, "assignedToName"),
      snoozedUntil: metadataString(metadata, "snoozedUntil"),
      note: metadataString(metadata, "note"),
      updatedAt: row.createdAt.toISOString(),
      updatedByName: actorName(row.actor),
    });
    grouped.set(clientId, clientStates);
  }
  return grouped;
}

function latestDate(values: Array<Date | null | undefined>): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    if (!latest || value > latest) return value;
    return latest;
  }, null);
}

function latestCompletedAt(row: AutomationDocumentRow | null | undefined): Date | null {
  if (!row) return null;
  return latestDate([
    row.acceptedAt,
    ...row.signatureRequests.map((request) =>
      request.status === "COMPLETED" ? request.completedAt : null,
    ),
  ]);
}

function latestSentAt(row: AutomationDocumentRow | null | undefined): Date | null {
  if (!row) return null;
  return latestDate([
    row.status === "SENT" ? row.updatedAt : null,
    ...row.signatureRequests.map((request) =>
      request.status === "SENT" || request.status === "COMPLETED" ? request.sentAt : null,
    ),
  ]);
}

function latestSignoffAt(
  proposal: AutomationDocumentRow | null,
  contract: AutomationDocumentRow | null,
): Date | null {
  return latestDate([latestCompletedAt(proposal), latestCompletedAt(contract)]);
}

function businessDaysElapsedSince(start: Date, end: Date): number {
  let count = 0;
  let cursor = addDays(startOfUtcDay(start), 1);
  const endDay = startOfUtcDay(end);
  while (cursor <= endDay) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function buildActivity(input: {
  clientId: string;
  auditRows: AutomationAuditRow[];
  signedProposal: AutomationDocumentRow | null;
  contractDocument: AutomationDocumentRow | null;
  onboarding:
    | {
        submittedAt: Date | null;
      }
    | null
    | undefined;
}): AutomationActivityRef[] {
  const activity = input.auditRows.flatMap((row) => {
    const entry = auditActivity(row);
    return entry ? [entry] : [];
  });
  const signoffAt = latestSignoffAt(input.signedProposal, input.contractDocument);
  if (signoffAt) {
    activity.push({
      id: `derived:signature:${input.clientId}:${signoffAt.toISOString()}`,
      kind: "signature_completed",
      label: "Signature complete",
      detail: "Commercial sign-off is complete.",
      at: signoffAt.toISOString(),
      actorName: null,
    });
  }
  if (input.onboarding?.submittedAt) {
    activity.push({
      id: `derived:onboarding:${input.clientId}:${input.onboarding.submittedAt.toISOString()}`,
      kind: "onboarding_submitted",
      label: "Onboarding submitted",
      detail: "Client onboarding form has been submitted.",
      at: input.onboarding.submittedAt.toISOString(),
      actorName: null,
    });
  }
  return activity
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, 3);
}

function buildNudges(input: {
  clientId: string;
  stage: AutomationStageKey;
  sentProposal: AutomationDocumentRow | null;
  signedProposal: AutomationDocumentRow | null;
  contractDocument: AutomationDocumentRow | null;
  onboarding:
    | {
        createdAt: Date;
        submittedAt: Date | null;
        linkedAt: Date | null;
      }
    | null
    | undefined;
  nudgeStates: Map<string, Map<AutomationNudgeKind, NudgeState>>;
  now: Date;
}): AutomationNudge[] {
  const nudges: AutomationNudge[] = [];
  const stateFor = (kind: AutomationNudgeKind): NudgeState | null =>
    input.nudgeStates.get(input.clientId)?.get(kind) ?? null;

  if (input.stage === "WAITING_SIGNATURE") {
    const sentAt = latestSentAt(input.sentProposal);
    if (sentAt) {
      const days = businessDaysElapsedSince(sentAt, input.now);
      if (days >= SIGNATURE_STALE_BUSINESS_DAYS) {
        nudges.push({
          kind: "signature_stale",
          label: "Signature stale",
          detail: `Waiting ${days} business days since sign-off was sent.`,
          since: sentAt.toISOString(),
          state: stateFor("signature_stale"),
        });
      }
    }
  }

  if (input.stage === "SEND_ONBOARDING" && !input.onboarding?.submittedAt) {
    const signoffAt = latestSignoffAt(input.signedProposal, input.contractDocument);
    const anchor = input.onboarding?.createdAt ?? input.onboarding?.linkedAt ?? signoffAt;
    if (anchor) {
      const days = businessDaysElapsedSince(anchor, input.now);
      if (days >= ONBOARDING_STALE_BUSINESS_DAYS) {
        nudges.push({
          kind: "onboarding_stale",
          label: "Onboarding stale",
          detail: input.onboarding
            ? `Onboarding has been open for ${days} business days.`
            : `Sign-off completed ${days} business days ago; onboarding still needs sending.`,
          since: anchor.toISOString(),
          state: stateFor("onboarding_stale"),
        });
      }
    }
  }

  if (input.stage === "READY_TO_SEED_PLAN") {
    nudges.push({
      kind: "active_plan_gap",
      label: "Plan gap",
      detail: "Active client has no feature blocks, tasks, or milestones yet.",
      since: latestSignoffAt(input.signedProposal, input.contractDocument)?.toISOString() ?? null,
      state: stateFor("active_plan_gap"),
    });
  }

  return nudges;
}

async function recordAutomationAudit(
  user: EffectiveUser,
  input: {
    action: (typeof FOUNDRY_AUDIT_ACTIONS)[number];
    clientId: string;
    clientSlug?: string;
    clientName?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const metadata = Object.fromEntries(
    Object.entries({
      source: "foundry_automation",
      clientId: input.clientId,
      clientSlug: input.clientSlug,
      clientName: input.clientName,
      ...(input.metadata ?? {}),
    }).filter(([, value]) => value !== undefined),
  );

  await recordAuditEntry({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: input.action,
    target: clientTarget(input.clientId),
    metadata,
  });
}

export async function getFoundryAutomation(user: EffectiveUser): Promise<FoundryAutomationResponse> {
  assertCan(user, canManageClients, "view the automation workflow");
  await ensureBaseRecords();
  const where: Prisma.WorkspaceClientWhereInput = {
    workspaceId: user.workspaceId,
    hidden: false,
    status: { in: ["PENDING_REVIEW", "ACTIVE"] },
  };

  if (!canSeeAllClients(user)) {
    const ids = await assignedClientIds(user);
    where.id = { in: ids.length ? ids : ["__none__"] };
  }

  const clients = await prisma.workspaceClient.findMany({
    where,
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
    include: {
      onboarding: {
        select: { id: true, status: true, createdAt: true, submittedAt: true, linkedAt: true },
      },
      meetings: {
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          title: true,
          status: true,
          startedAt: true,
          summary: true,
          actionItems: { select: { id: true } },
        },
      },
      documents: {
        where: {
          archivedAt: null,
          documentType: { in: ["PROPOSAL", "SOW", "MSA", "NDA", "DSA"] },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          documentType: true,
          updatedAt: true,
          acceptedAt: true,
          signatureRequests: {
            select: { status: true, sentAt: true, completedAt: true },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
      _count: {
        select: { featureBlocks: true, milestones: true, tasks: true },
      },
    },
  });

  const clientIds = clients.map((client) => client.id);
  const auditRows = clientIds.length
    ? await prisma.auditLog.findMany({
        where: {
          workspaceId: user.workspaceId,
          action: { in: [...FOUNDRY_AUDIT_ACTIONS] },
          target: { in: clientIds.map(clientTarget) },
        },
        orderBy: { createdAt: "desc" },
        take: Math.max(120, clientIds.length * 8),
        include: {
          actor: { select: { name: true, email: true } },
        },
      })
    : [];
  const auditsByClient = groupAuditRowsByClient(auditRows);
  const nudgeStates = latestNudgeStatesByClient(auditRows);
  const runHistory = runHistoryFromAuditRows(auditRows).slice(0, 12);
  const now = new Date();

  const items: FoundryAutomationItem[] = clients.map((client) => {
    const documents = client.documents as AutomationDocumentRow[];
    const proposals = documents.filter((doc) => doc.documentType === "PROPOSAL");
    const latestProposal = proposals[0] ?? null;
    const signedProposal = proposals.find(isSignedOrAccepted) ?? null;
    const draftProposal =
      proposals.find((doc) =>
        ["DRAFT", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF", "IN_REVIEW", "APPROVED"].includes(doc.status),
      ) ?? null;
    const sentProposal =
      proposals.find((doc) => doc.status === "SENT" || hasSentSignature(doc)) ?? null;
    const contractDocument =
      documents.find((doc) => LEGAL_DOCUMENT_TYPES.has(doc.documentType) && hasCompletedSignature(doc)) ??
      null;
    const signatureComplete = Boolean(signedProposal || contractDocument);
    const onboardingSubmitted =
      client.onboarding?.status === "SUBMITTED" || client.onboarding?.status === "LINKED";
    const active = client.status === "ACTIVE";
    const plan: AutomationProjectPlanRef = {
      featureBlockCount: client._count.featureBlocks,
      milestoneCount: client._count.milestones,
      taskCount: client._count.tasks,
    };
    const planExists = plan.featureBlockCount > 0 || plan.milestoneCount > 0 || plan.taskCount > 0;
    const latestMeeting = client.meetings[0] ?? null;
    const notesReady = Boolean(latestMeeting?.summary || latestMeeting?.status === "SUMMARISED");

    let stage: AutomationStageKey;
    if (active && planExists) {
      stage = "DELIVERY_ACTIVE";
    } else if (active && signedProposal) {
      stage = "READY_TO_SEED_PLAN";
    } else if (!active && onboardingSubmitted && signatureComplete) {
      stage = "READY_TO_ACTIVATE";
    } else if (signatureComplete && !onboardingSubmitted) {
      stage = "SEND_ONBOARDING";
    } else if (sentProposal) {
      stage = "WAITING_SIGNATURE";
    } else if (draftProposal) {
      stage = "REVIEW_PROPOSAL";
    } else if (notesReady) {
      stage = "DRAFT_PROPOSAL";
    } else {
      stage = "INTAKE_NEEDED";
    }

    const gates = [
      gate(
        "notes",
        "Gemini notes",
        notesReady ? "done" : "waiting",
        notesReady ? "Scribe has meeting context to work from." : "Waiting for notes or a meeting summary.",
      ),
      gate(
        "proposal",
        "Draft proposal",
        signedProposal ? "done" : draftProposal ? "ready" : notesReady ? "ready" : "waiting",
        signedProposal
          ? "A proposal has been accepted or signed."
          : draftProposal
            ? "A draft exists and needs human review."
            : notesReady
              ? "Notes are ready for proposal drafting."
              : "No usable proposal draft yet.",
      ),
      gate(
        "sent",
        "Send for sign-off",
        signatureComplete ? "done" : sentProposal ? "ready" : draftProposal ? "ready" : "waiting",
        signatureComplete
          ? "The signature/acceptance gate is complete."
          : sentProposal
            ? "Document is out with the client."
            : draftProposal
              ? "Ready for manual send once reviewed."
              : "Waiting on a proposal.",
      ),
      gate(
        "signature",
        "Signature returned",
        signatureComplete ? "done" : sentProposal ? "waiting" : "blocked",
        signatureComplete
          ? contractDocument
            ? "A contract document has a completed signature request."
            : "The proposal has been accepted or signed."
          : sentProposal
            ? "Waiting on the client."
            : "Nothing has been sent for signature yet.",
      ),
      gate(
        "onboarding",
        "Onboarding complete",
        onboardingSubmitted ? "done" : signatureComplete ? "ready" : "waiting",
        onboardingSubmitted
          ? "The onboarding form has been submitted."
          : signatureComplete
            ? "Send the onboarding link."
            : "Wait until commercial sign-off is complete.",
      ),
      gate(
        "activation",
        "Client active",
        active ? "done" : onboardingSubmitted && signatureComplete ? "ready" : "waiting",
        active
          ? "Client is active in Portal."
          : onboardingSubmitted && signatureComplete
            ? "Ready for a human to move to active."
            : "Requires contract/signature and onboarding.",
      ),
      gate(
        "plan",
        "Tasks + Gantt",
        planExists ? "done" : active && signedProposal ? "ready" : "waiting",
        planExists
          ? "Delivery work already exists."
          : active && signedProposal
            ? "Can seed feature blocks, tasks, and milestones from the proposal timeline."
            : "Wait until the client is active and the proposal is signed.",
      ),
    ];

    return {
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        status: client.status as WorkspaceClientStatus,
      },
      stage,
      stageLabel: stageLabel(stage),
      confidence: confidenceFromGates(gates),
      gates,
      nextAction: nextActionFor({
        stage,
        clientSlug: client.slug,
        proposal: signedProposal ?? latestProposal,
      }),
      latestMeeting: meetingRef(latestMeeting),
      sourceProposal: docRef(signedProposal ?? latestProposal),
      contractDocument: docRef(contractDocument),
      onboarding: onboardingRef(client.onboarding),
      projectPlan: plan,
      activity: buildActivity({
        clientId: client.id,
        auditRows: auditsByClient.get(client.id) ?? [],
        signedProposal,
        contractDocument,
        onboarding: client.onboarding,
      }),
      nudges: buildNudges({
        clientId: client.id,
        stage,
        sentProposal,
        signedProposal,
        contractDocument,
        onboarding: client.onboarding,
        nudgeStates,
        now,
      }),
    };
  });

  const queueItems = items.filter((item) => item.stage !== "DELIVERY_ACTIVE");
  const completedItems = items
    .filter((item) => item.stage === "DELIVERY_ACTIVE")
    .sort((left, right) => Date.parse(right.activity[0]?.at ?? "0") - Date.parse(left.activity[0]?.at ?? "0"))
    .slice(0, 6);

  queueItems.sort((left, right) => {
    const rank = stageRank(left.stage) - stageRank(right.stage);
    if (rank !== 0) return rank;
    return right.confidence - left.confidence;
  });

  return {
    summary: {
      total: queueItems.length,
      humanGates: queueItems.filter((item) =>
        ["REVIEW_PROPOSAL", "READY_TO_ACTIVATE", "SEND_ONBOARDING"].includes(item.stage),
      ).length,
      agentReady: queueItems.filter((item) =>
        ["DRAFT_PROPOSAL", "READY_TO_SEED_PLAN"].includes(item.stage),
      ).length,
      waitingOnClient: queueItems.filter((item) => item.stage === "WAITING_SIGNATURE").length,
      activePlanGaps: queueItems.filter((item) => item.stage === "READY_TO_SEED_PLAN").length,
    },
    items: queueItems,
    completedItems,
    runHistory,
  };
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function estimateDurationDays(duration: string, fallbackDays: number): number {
  const text = duration.toLowerCase().replace(/\s+/g, " ");
  const range = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(business days?|days?|weeks?|months?)/);
  const single = text.match(/(\d+)\s*(business days?|days?|weeks?|months?)/);
  const amount = range ? Number(range[2]) : single ? Number(single[1]) : fallbackDays;
  const unit = range?.[3] ?? single?.[2] ?? "days";
  const multiplier = unit.startsWith("month") ? 30 : unit.startsWith("week") ? 7 : 1;
  return Math.min(120, Math.max(1, amount * multiplier));
}

function compactKey(value: string): string {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return key || "item";
}

function deliverablesFrom(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function stringsFromJson(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function titleFromText(value: string, fallback: string): string {
  const firstSentence = value.split(/[.!?]\s/)[0]?.trim();
  return truncate(firstSentence || fallback, 72);
}

function isPlainObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function existingDraftSourceMeetingId(metadata: Prisma.JsonValue | null | undefined): string | null {
  if (!isPlainObject(metadata)) return null;
  const foundryAutomation = metadata.foundryAutomation;
  if (!foundryAutomation || typeof foundryAutomation !== "object" || Array.isArray(foundryAutomation)) {
    return null;
  }
  const sourceMeetingId = (foundryAutomation as Record<string, unknown>).sourceMeetingId;
  return typeof sourceMeetingId === "string" ? sourceMeetingId : null;
}

function sourceMeetingLabel(meeting: { title: string; startedAt: Date | null }): string {
  const date = meeting.startedAt ? meeting.startedAt.toISOString().slice(0, 10) : "undated";
  return `${meeting.title} (${date})`;
}

function cleanList(values: string[] | undefined, fallback: string[]): string[] {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 8);
  return cleaned.length ? cleaned : fallback;
}

function buildDraftEditsFromMeeting(input: {
  clientName: string;
  meeting: DraftMeetingRow;
  draft?: ProposalDraftEdits;
}): Required<ProposalDraftEdits> {
  const summary = input.meeting.summary?.trim() || "Draft generated from Scribe meeting notes.";
  const decisions = stringsFromJson(input.meeting.decisions);
  const actionItems = input.meeting.actionItems;
  const objectives = [
    ...decisions.map((decision) => decision),
    ...actionItems.map((action) => `${action.title?.trim() || titleFromText(action.text, "Follow up action")}: ${action.text}`),
  ].slice(0, 4);
  const touchpoints = actionItems.length
    ? actionItems.slice(0, 5).map((action) => action.title?.trim() || titleFromText(action.text, "Delivery workstream"))
    : ["Discovery follow-up"];
  const base: Required<ProposalDraftEdits> = {
    title: `${input.clientName} - Proposal draft`,
    summary,
    objectives: objectives.length ? objectives : ["Align scope from discovery"],
    touchpoints,
    assumptions: [
      `This draft is based on Scribe notes from ${sourceMeetingLabel(input.meeting)}.`,
      "Scope, pricing, timeline, and legal wording require human review before sending.",
      "Client stakeholders will confirm priorities, dependencies, and acceptance criteria.",
    ],
    outOfScope: [
      "Any work not explicitly confirmed in the reviewed proposal remains out of scope.",
      "Commercial, legal, and delivery assumptions are placeholders until approved by Gitwork.",
    ],
    nextSteps: "Confirm scope, commercials, timeline, and legal wording before sending to the client.",
  };

  return {
    title: input.draft?.title?.trim() || base.title,
    summary: input.draft?.summary?.trim() || base.summary,
    objectives: cleanList(input.draft?.objectives, base.objectives),
    touchpoints: cleanList(input.draft?.touchpoints, base.touchpoints),
    assumptions: cleanList(input.draft?.assumptions, base.assumptions),
    outOfScope: cleanList(input.draft?.outOfScope, base.outOfScope),
    nextSteps: input.draft?.nextSteps?.trim() || base.nextSteps,
  };
}

function proposalPreviewSections(draft: Required<ProposalDraftEdits>): ProposalDraftPreview["sections"] {
  return [
    { key: "summary", label: "Intro summary", detail: draft.summary, items: [] },
    { key: "objectives", label: "Objectives", detail: "Main outcomes pulled from decisions and actions.", items: draft.objectives },
    { key: "touchpoints", label: "Scope touchpoints", detail: "Draft workstreams for proposal review.", items: draft.touchpoints },
    { key: "assumptions", label: "Assumptions", detail: "Commercial and delivery guardrails.", items: draft.assumptions },
    { key: "outOfScope", label: "Out of scope", detail: "Boundaries to keep the draft controlled.", items: draft.outOfScope },
    { key: "nextSteps", label: "Next steps", detail: draft.nextSteps, items: [] },
  ];
}

function buildProposalSectionsFromMeeting(input: {
  clientName: string;
  clientLogoUrl: string | null;
  ownerName: string | null;
  meeting: DraftMeetingRow;
  draft?: ProposalDraftEdits;
}): Array<Prisma.DocumentSectionCreateWithoutDocumentInput> {
  const draft = buildDraftEditsFromMeeting({
    clientName: input.clientName,
    meeting: input.meeting,
    draft: input.draft,
  });
  const summary = draft.summary;
  const decisions = stringsFromJson(input.meeting.decisions);
  const actionItems = input.meeting.actionItems;
  const meetingLabel = sourceMeetingLabel(input.meeting);
  const objectives = draft.objectives.map((objective) => ({
    title: titleFromText(objective, "Confirm objective"),
    detail: objective,
  }));
  const touchpoints = draft.touchpoints.map((touchpoint, index) => {
    const action = actionItems[index];
    return {
          id: `scribe-touch-${index + 1}`,
      title: touchpoint,
      summary: action ? truncate(action.text, 220) : truncate(summary, 220),
          features: [
        action?.owner ? `Owner to confirm: ${action.owner}` : "Owner to confirm",
            "Acceptance criteria to confirm during proposal review",
          ],
          notes: `Pulled from Scribe action item in ${meetingLabel}.`,
          graphic: "",
          callout: "Review scope, commercials, and timeline before sending.",
    };
  });

  const sections = applyClientNameToSections(getDefaultSectionPayload(), input.clientName);

  return sections.map((section) => {
    const data = isPlainObject(section.data as Prisma.JsonValue)
      ? ({ ...(section.data as Prisma.JsonObject) } as Record<string, unknown>)
      : {};

    switch (section.key) {
      case "cover":
        return {
          ...section,
          data: {
            ...data,
            proposalTitle: draft.title,
            productName: "Digital product delivery",
            clientName: input.clientName,
            subtitle: "Drafted from Scribe meeting notes",
            date: new Date().toISOString().slice(0, 10),
            confidentiality: "Confidential: For client stakeholder review only.",
            confidentialityMode: "EXTERNAL",
            brandLockup: "CLIENT_X_GITWORK",
            clientLogoUrl: input.clientLogoUrl ?? "",
          } satisfies Prisma.InputJsonObject,
        };
      case "introduction":
        return {
          ...section,
          data: {
            ...data,
            statement: `Gitwork has prepared this draft proposal for ${input.clientName} from the latest Scribe meeting notes.`,
            summary,
            graphic: "",
          } satisfies Prisma.InputJsonObject,
        };
      case "product_overview":
        return {
          ...section,
          data: {
            ...data,
            platformDescription: summary,
            audience: "Client stakeholders, delivery leads, and Gitwork operators.",
            valueProposition: decisions[0] ?? "Turn the agreed discovery notes into a clear, reviewable delivery proposal.",
            platformsSupported: "To confirm during proposal review.",
            workflowGraphic: "",
          } satisfies Prisma.InputJsonObject,
        };
      case "objectives":
        return {
          ...section,
          data: {
            items: objectives.map((objective, index) => ({
              id: `scribe-objective-${index + 1}`,
              title: objective.title,
              description: truncate(objective.detail, 220),
              icon: index === 0 ? "bolt" : "shield",
            })),
          } satisfies Prisma.InputJsonObject,
        };
      case "touchpoints":
        return {
          ...section,
          data: {
            items: touchpoints,
          } satisfies Prisma.InputJsonObject,
        };
      case "supporting_links_assets":
        return {
          ...section,
          data: {
            ...data,
            notes: `Source: ${meetingLabel}. Draft generated by Foundry automation. Review all scope, dates, pricing, and legal wording before sending.`,
          } satisfies Prisma.InputJsonObject,
        };
      case "assumptions":
        return {
          ...section,
          data: {
            items: draft.assumptions,
          } satisfies Prisma.InputJsonObject,
        };
      case "out_of_scope":
        return {
          ...section,
          data: {
            items: draft.outOfScope,
          } satisfies Prisma.InputJsonObject,
        };
      case "cta_next_steps":
        return {
          ...section,
          data: {
            ...data,
            headline: "Review this draft",
            body: draft.nextSteps,
          } satisfies Prisma.InputJsonObject,
        };
      case "signoff_footer":
        return {
          ...section,
          data: {
            ...data,
            preparedBy: input.ownerName ?? "",
            team: "Gitwork",
            contactDetails: "hello@gitwork.io",
            footerNote: "Draft generated from Scribe notes. Valid only after Gitwork review and approval.",
          } satisfies Prisma.InputJsonObject,
        };
      default:
        return section;
    }
  }) as Array<Prisma.DocumentSectionCreateWithoutDocumentInput>;
}

async function resolveProposalDraftSource(
  user: EffectiveUser,
  input: DraftProposalRequest | ProposalDraftPreviewRequest,
) {
  const { template } = await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);

  const client = await prisma.workspaceClient.findFirst({
    where: { id: input.clientId, workspaceId: user.workspaceId, hidden: false },
    select: { id: true, slug: true, name: true, legalCompanyName: true, logoUrl: true },
  });
  if (!client) throw new ForbiddenError("Client not found");

  const meeting = await prisma.meeting.findFirst({
    where: input.meetingId
      ? { id: input.meetingId, workspaceId: user.workspaceId, clientId: client.id }
      : {
          workspaceId: user.workspaceId,
          clientId: client.id,
          summary: { not: null },
          status: "SUMMARISED",
        },
    orderBy: input.meetingId ? undefined : [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      startedAt: true,
      status: true,
      summary: true,
      decisions: true,
      actionItems: {
        orderBy: { createdAt: "asc" },
        select: { title: true, text: true, owner: true },
      },
    },
  });
  if (!meeting) {
    throw new Error("No summarised Scribe meeting found for this client.");
  }

  const decisions = stringsFromJson(meeting.decisions);
  if (!meeting.summary?.trim() && decisions.length === 0 && meeting.actionItems.length === 0) {
    throw new Error("The selected meeting has no summary, decisions, or action items to draft from.");
  }

  const existingDrafts = await prisma.document.findMany({
    where: {
      workspaceId: user.workspaceId,
      clientId: client.id,
      documentType: "PROPOSAL",
      status: "DRAFT",
      archivedAt: null,
    },
    select: { id: true, title: true, metadata: true },
    orderBy: { updatedAt: "desc" },
  });
  const existingDraft = existingDrafts.find((draft) => existingDraftSourceMeetingId(draft.metadata) === meeting.id);
  const clientName = client.legalCompanyName?.trim() || client.name;
  const draft = buildDraftEditsFromMeeting({
    clientName,
    meeting,
    draft: "draft" in input ? input.draft : undefined,
  });

  return { template, client, meeting, decisions, existingDraft, draft };
}

export async function previewProposalDraftFromMeeting(
  user: EffectiveUser,
  input: ProposalDraftPreviewRequest,
): Promise<ProposalDraftPreview> {
  assertCan(user, canManageDocs, "preview proposal drafts");
  const { client, meeting, existingDraft, draft } = await resolveProposalDraftSource(user, input);

  if (!existingDraft) {
    await recordAutomationAudit(user, {
      action: "foundry.proposal_draft.previewed",
      clientId: client.id,
      clientSlug: client.slug,
      clientName: client.name,
      metadata: {
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        proposalTitle: draft.title,
      },
    });
  }

  return {
    clientId: client.id,
    clientSlug: client.slug,
    clientName: client.name,
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    meetingStartedAt: iso(meeting.startedAt),
    existingDraft: existingDraft
      ? {
          id: existingDraft.id,
          title: existingDraft.title,
          href: `/app/docs/${existingDraft.id}`,
        }
      : null,
    draft,
    sections: proposalPreviewSections(draft),
  };
}

export async function draftProposalFromMeeting(
  user: EffectiveUser,
  input: DraftProposalRequest,
): Promise<DraftProposalResult> {
  assertCan(user, canManageDocs, "draft proposals");
  const { template, client, meeting, decisions, existingDraft, draft } =
    await resolveProposalDraftSource(user, input);
  if (existingDraft) {
    await recordAutomationAudit(user, {
      action: "foundry.proposal_draft.prepared",
      clientId: client.id,
      clientSlug: client.slug,
      clientName: client.name,
      metadata: {
        proposalId: existingDraft.id,
        proposalTitle: existingDraft.title,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        created: false,
      },
    });
    return {
      clientId: client.id,
      clientSlug: client.slug,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      proposalId: existingDraft.id,
      proposalTitle: existingDraft.title,
      href: `/app/docs/${existingDraft.id}`,
      created: false,
    };
  }

  const clientName = client.legalCompanyName?.trim() || client.name;
  const title = draft.title;
  const documentNumber = await allocateDocumentNumber(user.workspaceId, "PROPOSAL");
  const sections = buildProposalSectionsFromMeeting({
    clientName,
    clientLogoUrl: client.logoUrl,
    ownerName: resolveDocumentOwnerName(user),
    meeting,
    draft,
  });

  const document = await prisma.document.create({
    data: {
      workspaceId: user.workspaceId,
      ownerId: user.id,
      templateId: template.id,
      documentType: "PROPOSAL",
      documentNumber,
      status: "DRAFT",
      title,
      productName: "Digital product delivery",
      clientName,
      clientId: client.id,
      summary: meeting.summary?.trim() || "",
      version: "v1.0",
      labels: ["Scribe draft"] satisfies Prisma.InputJsonValue,
      metadata: {
        ...DEFAULT_PROPOSAL_METADATA,
        client: clientName,
        // "Prepared by" = the operator who drafted this from the meeting, never the
        // workspace owner. `user` here is always a real EffectiveUser (the route uses
        // requireAuthedUser), so this only adds the email-local-part fallback.
        owner: resolveDocumentOwnerName(user),
        notes: `Drafted from Scribe meeting "${meeting.title}".`,
        internalComments: [
          meeting.summary ? `Summary:\n${meeting.summary}` : null,
          decisions.length > 0 ? `Decisions:\n${decisions.map((decision) => `- ${decision}`).join("\n")}` : null,
          meeting.actionItems.length > 0
            ? `Action items:\n${meeting.actionItems
                .map((action) => `- ${action.title ? `${action.title}: ` : ""}${action.text}`)
                .join("\n")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        foundryAutomation: {
          source: "scribe_meeting",
          sourceMeetingId: meeting.id,
          draftedAt: new Date().toISOString(),
        },
      } satisfies Prisma.InputJsonObject,
      sections: { create: sections },
      costLineItems: { create: getDefaultCostsPayload() },
      timelinePhases: { create: getDefaultTimelinePayload() },
      links: { create: getDefaultLinkPayload() },
      ctas: { create: getDefaultCtaPayload() },
      assets: { create: getDefaultAssetPayload() },
    },
    select: { id: true, title: true },
  });

  await recordAutomationAudit(user, {
    action: "foundry.proposal_draft.prepared",
    clientId: client.id,
    clientSlug: client.slug,
    clientName: client.name,
    metadata: {
      proposalId: document.id,
      proposalTitle: document.title,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      created: true,
    },
  });

  return {
    clientId: client.id,
    clientSlug: client.slug,
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    proposalId: document.id,
    proposalTitle: document.title,
    href: `/app/docs/${document.id}`,
    created: true,
  };
}

export async function createAutomationOnboardingLink(
  user: EffectiveUser,
  input: AutomationOnboardingLinkRequest,
): Promise<AutomationOnboardingLinkResult> {
  assertCan(user, canManageClients, "send onboarding links");
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);

  const client = await prisma.workspaceClient.findFirst({
    where: { id: input.clientId, workspaceId: user.workspaceId, hidden: false },
    select: {
      id: true,
      slug: true,
      name: true,
      primaryContactEmail: true,
    },
  });
  if (!client) throw new ForbiddenError("Client not found");

  const documents = await prisma.document.findMany({
    where: {
      workspaceId: user.workspaceId,
      clientId: client.id,
      archivedAt: null,
      documentType: { in: ["PROPOSAL", "SOW", "MSA", "NDA", "DSA"] },
    },
    select: {
      status: true,
      signatureRequests: {
        select: { status: true },
      },
    },
  });
  const signatureComplete = documents.some(
    (document) =>
      document.status === "ACCEPTED" ||
      document.signatureRequests.some((request) => request.status === "COMPLETED"),
  );
  if (!signatureComplete) {
    throw new Error("Complete proposal or contract sign-off before sending onboarding.");
  }

  const { link, created } = await createOnboardingLinkForClient({
    workspaceId: user.workspaceId,
    clientId: client.id,
    label: `${client.name} - onboarding`,
  });

  await recordAutomationAudit(user, {
    action: "foundry.onboarding_link.prepared",
    clientId: client.id,
    clientSlug: client.slug,
    clientName: client.name,
    metadata: {
      onboardingId: link.id,
      label: link.label,
      status: link.status,
      created,
    },
  });

  return {
    clientId: client.id,
    clientSlug: client.slug,
    clientName: client.name,
    contactEmail: client.primaryContactEmail,
    linkId: link.id,
    accessToken: link.accessToken,
    path: `/onboarding/${link.accessToken}`,
    label: link.label,
    status: link.status,
    created,
  };
}

export async function updateAutomationNudge(
  user: EffectiveUser,
  input: AutomationNudgeUpdateRequest,
): Promise<AutomationNudgeUpdateResult> {
  assertCan(user, canManageClients, "update automation nudges");
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);

  const client = await prisma.workspaceClient.findFirst({
    where: { id: input.clientId, workspaceId: user.workspaceId, hidden: false },
    select: { id: true, slug: true, name: true },
  });
  if (!client) throw new ForbiddenError("Client not found");

  const assignedToName = input.assignedToName === undefined
    ? user.name ?? user.email
    : input.assignedToName?.trim() || null;
  const note = input.note?.trim() || null;
  const snoozedUntil = input.snoozedUntil?.trim() || null;

  await recordAutomationAudit(user, {
    action: "foundry.nudge.updated",
    clientId: client.id,
    clientSlug: client.slug,
    clientName: client.name,
    metadata: {
      nudgeKind: input.kind,
      assignedToName,
      snoozedUntil,
      note,
    },
  });

  return {
    clientId: client.id,
    kind: input.kind,
    assignedToName,
    snoozedUntil,
    note,
    updatedAt: new Date().toISOString(),
    updatedByName: user.name ?? user.email,
  };
}

function toExistingKeySet(rows: Array<{ clickupId: string | null }>): Set<string> {
  return new Set(rows.flatMap((row) => (row.clickupId ? [row.clickupId] : [])));
}

function parseAnchorDate(startDate: string | undefined, fallback: Date): Date {
  const value = startDate ? new Date(startDate) : fallback;
  if (Number.isNaN(value.getTime())) {
    throw new Error("Choose a valid plan start date before previewing the delivery plan.");
  }
  return startOfUtcDay(value);
}

async function resolveProjectPlanSource(user: EffectiveUser, input: ProjectPlanRequest) {
  assertCan(user, canManageClients, "seed project plans");
  await ensureBaseRecords();
  await assertClientInScope(user, input.clientId);

  const client = await prisma.workspaceClient.findFirst({
    where: { id: input.clientId, workspaceId: user.workspaceId },
    select: { id: true, slug: true, status: true },
  });
  if (!client) throw new ForbiddenError("Client not found");
  if (client.status !== "ACTIVE") {
    throw new Error("Move the client to active before seeding a delivery plan.");
  }

  const source = await prisma.document.findFirst({
    where: input.documentId
      ? {
          id: input.documentId,
          workspaceId: user.workspaceId,
          clientId: input.clientId,
          documentType: "PROPOSAL",
        }
      : {
          workspaceId: user.workspaceId,
          clientId: input.clientId,
          documentType: "PROPOSAL",
          OR: [{ status: "ACCEPTED" }, { signatureRequests: { some: { status: "COMPLETED" } } }],
        },
    include: {
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      signatureRequests: {
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
    },
    orderBy: input.documentId ? undefined : [{ acceptedAt: "desc" }, { updatedAt: "desc" }],
  });

  if (!source) {
    throw new Error("No accepted or signed proposal found for this client.");
  }
  if (source.timelinePhases.length === 0) {
    throw new Error("The selected proposal has no timeline phases to seed.");
  }
  if (!input.documentId && source.status !== "ACCEPTED" && source.signatureRequests.length === 0) {
    throw new Error("The selected proposal must be accepted or signed before seeding.");
  }

  const fallbackDate = source.acceptedAt ?? source.signatureRequests[0]?.completedAt ?? new Date();
  const anchor = parseAnchorDate(input.startDate, fallbackDate);

  return { client, source, anchor };
}

export async function previewProjectPlanFromProposal(
  user: EffectiveUser,
  input: ProjectPlanRequest,
): Promise<ProjectPlanPreview> {
  const { client, source, anchor } = await resolveProjectPlanSource(user, input);
  const plannedBlocks: Omit<ProjectPlanPreviewBlock, "existing">[] = [];
  const plannedMilestones: Omit<ProjectPlanPreviewMilestone, "existing">[] = [];
  let cursor = anchor;

  for (const [index, phase] of source.timelinePhases.entries()) {
    const durationDays = estimateDurationDays(phase.duration, 14);
    const startDate = cursor;
    const endDate = addDays(startDate, durationDays - 1);
    const color = PLAN_COLORS[index % PLAN_COLORS.length];
    const phaseKey = `foundry-plan:${source.id}:${phase.id}`;
    const deliverables = deliverablesFrom(phase.deliverables);
    const taskTitles = deliverables.length > 0 ? deliverables : [phase.summary];

    plannedBlocks.push({
      key: phaseKey,
      phaseId: phase.id,
      name: phase.name,
      summary: phase.summary,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      color,
      tasks: taskTitles.map((title) => ({
        key: `${phaseKey}:task:${compactKey(title)}`,
        title: title.slice(0, 200),
        description: `Seeded from ${source.title} / ${phase.name}.`,
        dueDate: endDate.toISOString(),
        existing: false,
      })),
    });

    plannedMilestones.push({
      key: `${phaseKey}:milestone`,
      phaseId: phase.id,
      name: `${phase.name} sign-off`,
      description: `Generated from the accepted proposal phase "${phase.name}".`,
      date: endDate.toISOString(),
      color,
    });

    cursor = addDays(endDate, 1);
  }

  const blockKeys = plannedBlocks.map((block) => block.key);
  const taskKeys = plannedBlocks.flatMap((block) => block.tasks.map((task) => task.key));
  const milestoneKeys = plannedMilestones.map((milestone) => milestone.key);

  const [existingBlocks, existingTasks, existingMilestones] = await Promise.all([
    prisma.featureBlock.findMany({
      where: { workspaceId: user.workspaceId, clientId: client.id, clickupId: { in: blockKeys } },
      select: { clickupId: true },
    }),
    prisma.task.findMany({
      where: { workspaceId: user.workspaceId, clientId: client.id, clickupId: { in: taskKeys } },
      select: { clickupId: true },
    }),
    prisma.milestone.findMany({
      where: { workspaceId: user.workspaceId, clientId: client.id, clickupId: { in: milestoneKeys } },
      select: { clickupId: true },
    }),
  ]);

  const existingBlockKeys = toExistingKeySet(existingBlocks);
  const existingTaskKeys = toExistingKeySet(existingTasks);
  const existingMilestoneKeys = toExistingKeySet(existingMilestones);

  const blocks: ProjectPlanPreviewBlock[] = plannedBlocks.map((block) => ({
    ...block,
    existing: existingBlockKeys.has(block.key),
    tasks: block.tasks.map((task) => ({
      ...task,
      existing: existingTaskKeys.has(task.key),
    })),
  }));
  const milestones: ProjectPlanPreviewMilestone[] = plannedMilestones.map((milestone) => ({
    ...milestone,
    existing: existingMilestoneKeys.has(milestone.key),
  }));

  const existingTaskCount = blocks.reduce(
    (total, block) => total + block.tasks.filter((task) => task.existing).length,
    0,
  );

  return {
    clientId: client.id,
    clientSlug: client.slug,
    sourceDocumentId: source.id,
    sourceDocumentTitle: source.title,
    startDate: anchor.toISOString(),
    totals: {
      featureBlocks: blocks.length,
      milestones: milestones.length,
      tasks: taskKeys.length,
      newFeatureBlocks: blocks.filter((block) => !block.existing).length,
      newMilestones: milestones.filter((milestone) => !milestone.existing).length,
      newTasks: taskKeys.length - existingTaskCount,
      existingFeatureBlocks: existingBlockKeys.size,
      existingMilestones: existingMilestoneKeys.size,
      existingTasks: existingTaskCount,
    },
    blocks,
    milestones,
  };
}

export async function seedProjectPlanFromProposal(
  user: EffectiveUser,
  input: ProjectPlanRequest,
): Promise<SeedProjectPlanResult> {
  const preview = await previewProjectPlanFromProposal(user, input);
  const milestoneByPhaseId = new Map(preview.milestones.map((milestone) => [milestone.phaseId, milestone]));

  const result: SeedProjectPlanResult = {
    clientId: preview.clientId,
    clientSlug: preview.clientSlug,
    sourceDocumentId: preview.sourceDocumentId,
    sourceDocumentTitle: preview.sourceDocumentTitle,
    created: { featureBlocks: 0, milestones: 0, tasks: 0 },
    skipped: { featureBlocks: 0, milestones: 0, tasks: 0 },
  };

  await prisma.$transaction(async (tx) => {
    const topTask = await tx.task.findFirst({
      where: { workspaceId: user.workspaceId, clientId: preview.clientId, status: "TODO" },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    let taskOrder = (topTask?.orderKey ?? 0) + 1;

    for (const [index, planBlock] of preview.blocks.entries()) {
      let block = await tx.featureBlock.findFirst({
        where: { workspaceId: user.workspaceId, clientId: preview.clientId, clickupId: planBlock.key },
        select: { id: true },
      });
      if (block) {
        result.skipped.featureBlocks++;
      } else {
        block = await tx.featureBlock.create({
          data: {
            workspaceId: user.workspaceId,
            clientId: preview.clientId,
            name: planBlock.name,
            description: planBlock.summary,
            startDate: new Date(planBlock.startDate),
            endDate: new Date(planBlock.endDate),
            color: planBlock.color,
            clickupId: planBlock.key,
            orderKey: index + 1,
          },
          select: { id: true },
        });
        result.created.featureBlocks++;
      }

      for (const task of planBlock.tasks) {
        const exists = await tx.task.findFirst({
          where: { workspaceId: user.workspaceId, clientId: preview.clientId, clickupId: task.key },
          select: { id: true },
        });
        if (exists) {
          result.skipped.tasks++;
          continue;
        }
        await tx.task.create({
          data: {
            workspaceId: user.workspaceId,
            clientId: preview.clientId,
            createdById: user.id,
            featureBlockId: block.id,
            title: task.title,
            description: task.description,
            status: "TODO",
            priority: "MEDIUM",
            orderKey: taskOrder++,
            dueDate: new Date(task.dueDate),
            clickupId: task.key,
            metadata: {
              source: "foundry_automation",
              sourceDocumentId: preview.sourceDocumentId,
              sourceTimelinePhaseId: planBlock.phaseId,
            } satisfies Prisma.InputJsonValue,
          },
        });
        result.created.tasks++;
      }

      const plannedMilestone = milestoneByPhaseId.get(planBlock.phaseId);
      if (!plannedMilestone) continue;

      const milestone = await tx.milestone.findFirst({
        where: { workspaceId: user.workspaceId, clientId: preview.clientId, clickupId: plannedMilestone.key },
        select: { id: true },
      });
      if (milestone) {
        result.skipped.milestones++;
      } else {
        await tx.milestone.create({
          data: {
            workspaceId: user.workspaceId,
            clientId: preview.clientId,
            name: plannedMilestone.name,
            description: plannedMilestone.description,
            date: new Date(plannedMilestone.date),
            color: plannedMilestone.color,
            clickupId: plannedMilestone.key,
          },
        });
        result.created.milestones++;
      }
    }
  });

  await recordAutomationAudit(user, {
    action: "foundry.delivery_plan.seeded",
    clientId: result.clientId,
    clientSlug: result.clientSlug,
    metadata: {
      sourceDocumentId: result.sourceDocumentId,
      sourceDocumentTitle: result.sourceDocumentTitle,
      createdFeatureBlocks: result.created.featureBlocks,
      createdTasks: result.created.tasks,
      createdMilestones: result.created.milestones,
      skippedFeatureBlocks: result.skipped.featureBlocks,
      skippedTasks: result.skipped.tasks,
      skippedMilestones: result.skipped.milestones,
    },
  });

  return result;
}
