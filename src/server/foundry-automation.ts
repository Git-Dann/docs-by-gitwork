import { Prisma } from "@prisma/client";
import { applyClientNameToSections } from "@/lib/apply-client-name";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { allocateDocumentNumber } from "@/server/documents";
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
  AutomationDocumentRef,
  AutomationGate,
  AutomationGateState,
  AutomationMeetingRef,
  AutomationOnboardingRef,
  AutomationProjectPlanRef,
  AutomationStageKey,
  DraftProposalRequest,
  DraftProposalResult,
  FoundryAutomationItem,
  FoundryAutomationResponse,
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
      return { kind: "draft_proposal", label: "Draft from notes" };
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

function buildProposalSectionsFromMeeting(input: {
  clientName: string;
  clientLogoUrl: string | null;
  ownerName: string | null;
  meeting: {
    title: string;
    startedAt: Date | null;
    summary: string | null;
    decisions: Prisma.JsonValue | null;
    actionItems: Array<{ title: string | null; text: string; owner: string | null }>;
  };
}): Array<Prisma.DocumentSectionCreateWithoutDocumentInput> {
  const summary = input.meeting.summary?.trim() || "Draft generated from Scribe meeting notes.";
  const decisions = stringsFromJson(input.meeting.decisions);
  const actionItems = input.meeting.actionItems;
  const meetingLabel = sourceMeetingLabel(input.meeting);
  const objectiveSources = [
    ...decisions.map((decision) => ({ title: titleFromText(decision, "Confirm decision"), detail: decision })),
    ...actionItems.map((action) => ({
      title: action.title?.trim() || titleFromText(action.text, "Follow up action"),
      detail: action.text,
    })),
  ].slice(0, 4);
  const objectives =
    objectiveSources.length > 0
      ? objectiveSources
      : [{ title: "Align scope from discovery", detail: summary }];
  const touchpoints =
    actionItems.length > 0
      ? actionItems.slice(0, 5).map((action, index) => ({
          id: `scribe-touch-${index + 1}`,
          title: action.title?.trim() || titleFromText(action.text, `Workstream ${index + 1}`),
          summary: truncate(action.text, 220),
          features: [
            action.owner ? `Owner to confirm: ${action.owner}` : "Owner to confirm",
            "Acceptance criteria to confirm during proposal review",
          ],
          notes: `Pulled from Scribe action item in ${meetingLabel}.`,
          graphic: "",
          callout: "Review scope, commercials, and timeline before sending.",
        }))
      : [
          {
            id: "scribe-touch-1",
            title: "Discovery follow-up",
            summary,
            features: ["Confirm scope", "Confirm timeline", "Confirm commercial model"],
            notes: `Drafted from ${meetingLabel}.`,
            graphic: "",
            callout: "Review required before client send.",
          },
        ];

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
            proposalTitle: `${input.clientName} - Proposal`,
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
            items: [
              `This draft is based on Scribe notes from ${meetingLabel}.`,
              "Scope, pricing, timeline, and legal wording require human review before sending.",
              "Client stakeholders will confirm priorities, dependencies, and acceptance criteria.",
            ],
          } satisfies Prisma.InputJsonObject,
        };
      case "out_of_scope":
        return {
          ...section,
          data: {
            items: [
              "Any work not explicitly confirmed in the reviewed proposal remains out of scope.",
              "Commercial, legal, and delivery assumptions are placeholders until approved by Gitwork.",
            ],
          } satisfies Prisma.InputJsonObject,
        };
      case "cta_next_steps":
        return {
          ...section,
          data: {
            ...data,
            headline: "Review this draft",
            body: "Confirm scope, commercials, timeline, and legal wording before sending to the client.",
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

export async function draftProposalFromMeeting(
  user: EffectiveUser,
  input: DraftProposalRequest,
): Promise<DraftProposalResult> {
  assertCan(user, canManageDocs, "draft proposals");
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
  if (existingDraft) {
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
  const title = `${clientName} - Proposal draft`;
  const documentNumber = await allocateDocumentNumber(user.workspaceId, "PROPOSAL");
  const sections = buildProposalSectionsFromMeeting({
    clientName,
    clientLogoUrl: client.logoUrl,
    ownerName: user.name,
    meeting,
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
        owner: user.name ?? DEFAULT_PROPOSAL_METADATA.owner,
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

  return result;
}
