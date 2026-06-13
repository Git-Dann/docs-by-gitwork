import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  assertCan,
  canManageClients,
  canSeeAllClients,
  type EffectiveUser,
  ForbiddenError,
} from "@/server/auth/effective-user";
import { assertClientInScope, assignedClientIds } from "@/server/tasks";
import type {
  AutomationAction,
  AutomationDocumentRef,
  AutomationGate,
  AutomationGateState,
  AutomationMeetingRef,
  AutomationOnboardingRef,
  AutomationProjectPlanRef,
  AutomationStageKey,
  FoundryAutomationItem,
  FoundryAutomationResponse,
  SeedProjectPlanResult,
} from "@/types/foundry-automation";
import type { WorkspaceClientStatus } from "@/types/client";

const LEGAL_DOCUMENT_TYPES = new Set(["SOW", "MSA", "NDA", "DSA"]);
const PLAN_COLORS = ["blue", "violet", "emerald", "amber", "rose", "slate"];

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
      return { kind: "link", label: "Draft proposal", href: "/app/docs" };
    case "REVIEW_PROPOSAL":
      return { kind: "link", label: "Review and send", href: docHref };
    case "WAITING_SIGNATURE":
      return { kind: "link", label: "Check signature request", href: docHref };
    case "SEND_ONBOARDING":
      return { kind: "link", label: "Send onboarding/contract", href: "/app/portal?tab=onboarding" };
    case "READY_TO_ACTIVATE":
      return { kind: "link", label: "Review and activate", href: `/app/portal/${input.clientSlug}` };
    case "READY_TO_SEED_PLAN":
      return { kind: "seed_project_plan", label: "Seed tasks + Gantt" };
    case "DELIVERY_ACTIVE":
      return { kind: "link", label: "Open delivery plan", href: `/app/portal/${input.clientSlug}/tasks` };
    case "INTAKE_NEEDED":
      return { kind: "link", label: "Open client record", href: `/app/portal/${input.clientSlug}` };
  }
}

export async function getFoundryAutomation(user: EffectiveUser): Promise<FoundryAutomationResponse> {
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
        select: { id: true, status: true, submittedAt: true, linkedAt: true },
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
    };
  });

  items.sort((left, right) => {
    const rank = stageRank(left.stage) - stageRank(right.stage);
    if (rank !== 0) return rank;
    return right.confidence - left.confidence;
  });

  return {
    summary: {
      total: items.length,
      humanGates: items.filter((item) =>
        ["REVIEW_PROPOSAL", "READY_TO_ACTIVATE", "SEND_ONBOARDING"].includes(item.stage),
      ).length,
      agentReady: items.filter((item) =>
        ["DRAFT_PROPOSAL", "READY_TO_SEED_PLAN"].includes(item.stage),
      ).length,
      waitingOnClient: items.filter((item) => item.stage === "WAITING_SIGNATURE").length,
      activePlanGaps: items.filter((item) => item.stage === "READY_TO_SEED_PLAN").length,
    },
    items,
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

export async function seedProjectPlanFromProposal(
  user: EffectiveUser,
  input: { clientId: string; documentId?: string; startDate?: string },
): Promise<SeedProjectPlanResult> {
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

  const anchor = input.startDate
    ? startOfUtcDay(new Date(input.startDate))
    : startOfUtcDay(source.acceptedAt ?? source.signatureRequests[0]?.completedAt ?? new Date());

  const result: SeedProjectPlanResult = {
    clientId: client.id,
    clientSlug: client.slug,
    sourceDocumentId: source.id,
    sourceDocumentTitle: source.title,
    created: { featureBlocks: 0, milestones: 0, tasks: 0 },
    skipped: { featureBlocks: 0, milestones: 0, tasks: 0 },
  };

  await prisma.$transaction(async (tx) => {
    const topTask = await tx.task.findFirst({
      where: { workspaceId: user.workspaceId, clientId: client.id, status: "TODO" },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    let taskOrder = (topTask?.orderKey ?? 0) + 1;
    let cursor = anchor;

    for (const [index, phase] of source.timelinePhases.entries()) {
      const durationDays = estimateDurationDays(phase.duration, 14);
      const startDate = cursor;
      const endDate = addDays(startDate, durationDays - 1);
      const phaseKey = `foundry-plan:${source.id}:${phase.id}`;

      let block = await tx.featureBlock.findFirst({
        where: { workspaceId: user.workspaceId, clientId: client.id, clickupId: phaseKey },
        select: { id: true },
      });
      if (block) {
        result.skipped.featureBlocks++;
      } else {
        block = await tx.featureBlock.create({
          data: {
            workspaceId: user.workspaceId,
            clientId: client.id,
            name: phase.name,
            description: phase.summary,
            startDate,
            endDate,
            color: PLAN_COLORS[index % PLAN_COLORS.length],
            clickupId: phaseKey,
            orderKey: index + 1,
          },
          select: { id: true },
        });
        result.created.featureBlocks++;
      }

      const deliverables = deliverablesFrom(phase.deliverables);
      const taskTitles = deliverables.length > 0 ? deliverables : [phase.summary];
      for (const title of taskTitles) {
        const taskKey = `${phaseKey}:task:${compactKey(title)}`;
        const exists = await tx.task.findFirst({
          where: { workspaceId: user.workspaceId, clientId: client.id, clickupId: taskKey },
          select: { id: true },
        });
        if (exists) {
          result.skipped.tasks++;
          continue;
        }
        await tx.task.create({
          data: {
            workspaceId: user.workspaceId,
            clientId: client.id,
            createdById: user.id,
            featureBlockId: block.id,
            title: title.slice(0, 200),
            description: `Seeded from ${source.title} → ${phase.name}.`,
            status: "TODO",
            priority: "MEDIUM",
            orderKey: taskOrder++,
            dueDate: endDate,
            clickupId: taskKey,
            metadata: {
              source: "foundry_automation",
              sourceDocumentId: source.id,
              sourceTimelinePhaseId: phase.id,
            } satisfies Prisma.InputJsonValue,
          },
        });
        result.created.tasks++;
      }

      const milestoneKey = `${phaseKey}:milestone`;
      const milestone = await tx.milestone.findFirst({
        where: { workspaceId: user.workspaceId, clientId: client.id, clickupId: milestoneKey },
        select: { id: true },
      });
      if (milestone) {
        result.skipped.milestones++;
      } else {
        await tx.milestone.create({
          data: {
            workspaceId: user.workspaceId,
            clientId: client.id,
            name: `${phase.name} sign-off`,
            description: `Generated from the accepted proposal phase "${phase.name}".`,
            date: endDate,
            color: PLAN_COLORS[index % PLAN_COLORS.length],
            clickupId: milestoneKey,
          },
        });
        result.created.milestones++;
      }

      cursor = addDays(endDate, 1);
    }
  });

  return result;
}
