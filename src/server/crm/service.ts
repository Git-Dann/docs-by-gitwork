/**
 * CRM service — everything the lead panel, the Desk and the conversion flow read and write.
 * The sync itself lives in ./sync.ts; the rules in src/lib/crm/*.
 */

import type { LeadStage } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { effectiveLeadDomains } from "@/server/crm/sync";
import { STAGE_LABEL } from "@/lib/crm/lead-stage-engine";
import { buildConversionProposals, deriveMainContact, type ConvertField } from "@/lib/crm/convert";
import { normaliseDomains } from "@/lib/crm/signals";
import type {
  ConvertPreview,
  ConvertResult,
  CrmStageSuggestionDTO,
  LeadActionDTO,
  LeadActionState,
  LeadCrmStatus,
  MyLeadAction,
} from "@/types/crm";

/** How long a sync claim is honoured before the panel stops showing "Syncing…". */
const SYNC_CLAIM_MS = 5 * 60_000;

async function findLead(slug: string) {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      slug: true,
      status: true,
      website: true,
      primaryContactName: true,
      primaryContactEmail: true,
      crmAutoEnabled: true,
      crmEmailDomains: true,
      crmLastSyncedAt: true,
      crmLastSyncError: true,
      crmSyncStartedAt: true,
      slackInternalChannelId: true,
      slackInternalChannelName: true,
      slackChannelId: true,
      leadStage: true,
      leadStagePinned: true,
      leadStageChangedAt: true,
      leadOwnerId: true,
    },
  });
  return client;
}

async function namesFor(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));
}

type ActionRow = {
  id: string;
  title: string;
  dueAt: Date | null;
  ownerId: string | null;
  state: string;
  source: string;
  reason: string | null;
  evidenceTouchpointId: string | null;
  doneAt: Date | null;
  createdAt: Date;
};

async function serializeActions(rows: ActionRow[]): Promise<LeadActionDTO[]> {
  const names = await namesFor(rows.map((r) => r.ownerId));
  const evidenceIds = rows.map((r) => r.evidenceTouchpointId).filter((i): i is string => !!i);
  const evidence = evidenceIds.length
    ? await prisma.clientTouchpoint.findMany({
        where: { id: { in: evidenceIds } },
        select: { id: true, note: true, occurredAt: true, source: true },
      })
    : [];
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  return rows.map((r) => {
    const e = r.evidenceTouchpointId ? evidenceById.get(r.evidenceTouchpointId) : undefined;
    return {
      id: r.id,
      title: r.title,
      dueAt: r.dueAt?.toISOString() ?? null,
      ownerId: r.ownerId,
      ownerName: r.ownerId ? names.get(r.ownerId) ?? null : null,
      state: r.state as LeadActionState,
      source: r.source === "ai" ? "ai" : "manual",
      reason: r.reason,
      evidence: e ? { note: e.note, occurredAt: e.occurredAt.toISOString(), source: e.source } : null,
      doneAt: r.doneAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** Open actions first by due date (undated last), then suggested, then done (recent first). */
function orderActions(actions: LeadActionDTO[]): LeadActionDTO[] {
  const rank: Record<LeadActionState, number> = { open: 0, suggested: 1, done: 2, dismissed: 3 };
  return [...actions].sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    if (a.state === "done") return (b.doneAt ?? "").localeCompare(a.doneAt ?? "");
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function getLeadCrmStatus(slug: string, viewer: EffectiveUser | null): Promise<LeadCrmStatus | null> {
  const client = await findLead(slug);
  if (!client) return null;

  const [members, suggestionRows, actionRows, me] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: client.workspaceId, ...ACTIVE_MEMBER },
      select: {
        crmMailboxEnabled: true,
        user: { select: { id: true, name: true, email: true, googleOAuthRefreshToken: true } },
      },
    }),
    prisma.clientTouchpoint.findMany({
      where: { clientId: client.id, type: "SUGGESTION", suggestionState: "pending" },
      orderBy: { occurredAt: "desc" },
      select: { id: true, suggestedStage: true, note: true, occurredAt: true, direction: true },
    }),
    prisma.leadAction.findMany({
      where: { clientId: client.id, state: { not: "dismissed" } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    viewer
      ? prisma.workspaceMember.findFirst({
          where: { workspaceId: client.workspaceId, userId: viewer.id, ...ACTIVE_MEMBER },
          select: { crmMailboxEnabled: true, user: { select: { googleOAuthRefreshToken: true } } },
        })
      : Promise.resolve(null),
  ]);

  const actions = orderActions(await serializeActions(actionRows));
  const nameOf = (u: { name: string | null; email: string }) => u.name?.trim() || u.email;
  const ownerMember = client.leadOwnerId ? members.find((m) => m.user.id === client.leadOwnerId) : undefined;
  const channelId = (client.slackInternalChannelId ?? client.slackChannelId ?? "").trim();

  const suggestions: CrmStageSuggestionDTO[] = suggestionRows
    .filter((s) => s.suggestedStage)
    .map((s) => ({
      id: s.id,
      stage: s.suggestedStage as LeadStage,
      reason: s.note,
      occurredAt: s.occurredAt.toISOString(),
      direction: s.direction,
    }));

  return {
    enabled: client.crmAutoEnabled,
    stage: client.leadStage,
    pinned: client.leadStagePinned,
    stageChangedAt: client.leadStageChangedAt?.toISOString() ?? null,
    owner: ownerMember ? { id: ownerMember.user.id, name: nameOf(ownerMember.user) } : null,
    emailDomains: client.crmEmailDomains,
    effectiveDomains: effectiveLeadDomains(client),
    mailboxes: members
      .filter((m) => m.crmMailboxEnabled)
      .map((m) => ({ userId: m.user.id, name: nameOf(m.user), connected: !!m.user.googleOAuthRefreshToken })),
    me:
      viewer && me
        ? { userId: viewer.id, mailboxEnabled: me.crmMailboxEnabled, googleConnected: !!me.user.googleOAuthRefreshToken }
        : null,
    slackChannel: channelId ? { id: channelId, name: client.slackInternalChannelName ?? null } : null,
    lastSyncedAt: client.crmLastSyncedAt?.toISOString() ?? null,
    lastSyncError: client.crmLastSyncError ? client.crmLastSyncError.split("\n").filter(Boolean) : [],
    syncing: !!client.crmSyncStartedAt && Date.now() - client.crmSyncStartedAt.getTime() < SYNC_CLAIM_MS,
    suggestions,
    actions,
    nextStep: actions.find((a) => a.state === "open") ?? null,
    people: members.map((m) => ({ id: m.user.id, name: nameOf(m.user) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export class CrmInputError extends Error {
  status = 400;
}

/** Turn automation on/off, set the lead's domains and owner, or resume a pinned stage. */
export async function updateLeadCrmSettings(
  slug: string,
  input: { enabled?: boolean; emailDomains?: string[]; ownerId?: string | null; pinned?: false },
): Promise<boolean> {
  const client = await findLead(slug);
  if (!client) return false;

  const data: Record<string, unknown> = {};
  if (input.enabled !== undefined) {
    data.crmAutoEnabled = input.enabled;
    // Anchor the current stage's "since" the moment automation starts, so evidence that predates
    // switching it on can never pull a lead out of LOST / ON HOLD (lead-stage-engine rules 4–5).
    if (input.enabled && !client.leadStageChangedAt) data.leadStageChangedAt = new Date();
  }
  if (input.emailDomains !== undefined) {
    const domains = normaliseDomains(input.emailDomains);
    const rejected = input.emailDomains.filter((d) => d.trim() && !normaliseDomains([d]).length);
    if (rejected.length > 0) throw new CrmInputError(`Not a domain: ${rejected.join(", ")}`);
    data.crmEmailDomains = domains;
  }
  if (input.ownerId !== undefined) {
    if (input.ownerId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: client.workspaceId, userId: input.ownerId, ...ACTIVE_MEMBER },
        select: { id: true },
      });
      if (!member) throw new CrmInputError("That person isn't an active member of this workspace.");
    }
    data.leadOwnerId = input.ownerId;
  }
  if (input.pinned === false) data.leadStagePinned = false;

  if (Object.keys(data).length > 0) {
    await prisma.workspaceClient.update({ where: { id: client.id }, data });
  }
  return true;
}

/** Accept (apply the stage) or dismiss a stage suggestion. */
export async function resolveStageSuggestion(
  slug: string,
  suggestionId: string,
  action: "accept" | "dismiss",
  actor: EffectiveUser | null,
): Promise<boolean> {
  const client = await findLead(slug);
  if (!client) return false;
  const suggestion = await prisma.clientTouchpoint.findFirst({
    where: { id: suggestionId, clientId: client.id, type: "SUGGESTION" },
    select: { id: true, suggestedStage: true, suggestionState: true, note: true },
  });
  if (!suggestion || !suggestion.suggestedStage) return false;
  if (suggestion.suggestionState !== "pending") return true; // already handled — idempotent

  const now = new Date();
  if (action === "dismiss") {
    await prisma.clientTouchpoint.update({ where: { id: suggestion.id }, data: { suggestionState: "dismissed" } });
    return true;
  }

  // Accepting is a person's decision but NOT a pin: later facts can still carry the lead
  // forward. `leadStageChangedAt` is what stops older evidence overriding it.
  const stage = suggestion.suggestedStage;
  await prisma.$transaction([
    prisma.clientTouchpoint.update({ where: { id: suggestion.id }, data: { suggestionState: "accepted" } }),
    prisma.clientTouchpoint.updateMany({
      where: { clientId: client.id, type: "SUGGESTION", suggestionState: "pending", suggestedStage: { not: stage } },
      data: { suggestionState: "dismissed" },
    }),
    prisma.workspaceClient.update({
      where: { id: client.id },
      data: { leadStage: stage, leadStageChangedAt: now },
    }),
    prisma.clientTouchpoint.create({
      data: {
        clientId: client.id,
        workspaceId: client.workspaceId,
        type: "STAGE",
        source: "system",
        authorId: actor?.id ?? null,
        note: `Moved to ${STAGE_LABEL[stage]} — suggestion accepted${suggestion.note ? `: ${suggestion.note}` : ""}`,
        occurredAt: now,
      },
    }),
  ]);
  revalidateTag("client-collections");
  return true;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createLeadAction(
  slug: string,
  input: { title: string; dueAt?: string | null; ownerId?: string | null },
  actor: EffectiveUser | null,
): Promise<LeadActionDTO | null> {
  const client = await findLead(slug);
  if (!client) return null;
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) throw new CrmInputError("An action needs a title.");
  const row = await prisma.leadAction.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      title: title.slice(0, 200),
      dueAt: parseDue(input.dueAt),
      ownerId: input.ownerId === undefined ? actor?.id ?? client.leadOwnerId : input.ownerId,
      state: "open",
      source: "manual",
      createdById: actor?.id ?? null,
    },
  });
  const [dto] = await serializeActions([row]);
  return dto;
}

function parseDue(value: string | null | undefined): Date | null {
  if (!value || !value.trim()) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T09:00:00.000Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) throw new CrmInputError("Not a valid due date.");
  return d;
}

/**
 * Edit an action, or move it between states: accept (suggested → open), dismiss, done, reopen.
 * Accepting a suggested action with no owner gives it to whoever accepted it — an action nobody
 * owns is an action nobody does.
 */
export async function updateLeadAction(
  slug: string,
  actionId: string,
  input: {
    title?: string;
    dueAt?: string | null;
    ownerId?: string | null;
    transition?: "accept" | "dismiss" | "done" | "reopen";
  },
  actor: EffectiveUser | null,
): Promise<LeadActionDTO | null> {
  const client = await findLead(slug);
  if (!client) return null;
  const action = await prisma.leadAction.findFirst({ where: { id: actionId, clientId: client.id } });
  if (!action) return null;

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.replace(/\s+/g, " ").trim();
    if (!title) throw new CrmInputError("An action needs a title.");
    data.title = title.slice(0, 200);
  }
  if (input.dueAt !== undefined) data.dueAt = parseDue(input.dueAt);
  if (input.ownerId !== undefined) data.ownerId = input.ownerId;

  switch (input.transition) {
    case "accept":
      if (action.state !== "suggested") break;
      data.state = "open";
      if (!action.ownerId && input.ownerId === undefined) data.ownerId = actor?.id ?? client.leadOwnerId;
      break;
    case "dismiss":
      if (action.state === "suggested" || action.state === "open") data.state = "dismissed";
      break;
    case "done":
      if (action.state === "open") {
        data.state = "done";
        data.doneAt = new Date();
      }
      break;
    case "reopen":
      if (action.state === "done") {
        data.state = "open";
        data.doneAt = null;
      }
      break;
  }

  const row = Object.keys(data).length
    ? await prisma.leadAction.update({ where: { id: action.id }, data })
    : action;
  const [dto] = await serializeActions([row]);
  return dto;
}

export async function deleteLeadAction(slug: string, actionId: string): Promise<boolean> {
  const client = await findLead(slug);
  if (!client) return false;
  const deleted = await prisma.leadAction.deleteMany({ where: { id: actionId, clientId: client.id } });
  return deleted.count > 0;
}

/** The caller's open actions across every lead — for On Your Desk. */
export async function listMyLeadActions(user: EffectiveUser): Promise<MyLeadAction[]> {
  const rows = await prisma.leadAction.findMany({
    where: {
      workspaceId: user.workspaceId,
      ownerId: user.id,
      state: "open",
      client: { status: "LEAD" },
    },
    include: { client: { select: { slug: true, name: true, leadStage: true } } },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 50,
  });
  const dtos = await serializeActions(rows);
  return dtos.map((dto, i) => ({
    ...dto,
    lead: { slug: rows[i].client.slug, name: rows[i].client.name, stage: rows[i].client.leadStage },
  }));
}

// ── Mailbox opt-in ───────────────────────────────────────────────────────────

/** A person turns the CRM's read of their OWN mailbox on or off. Nobody can do it for them. */
export async function setMyCrmMailbox(user: EffectiveUser, enabled: boolean): Promise<{ enabled: boolean; googleConnected: boolean }> {
  const updated = await prisma.workspaceMember.updateMany({
    where: { workspaceId: user.workspaceId, userId: user.id, ...ACTIVE_MEMBER },
    data: { crmMailboxEnabled: enabled },
  });
  if (updated.count === 0) throw new CrmInputError("You aren't an active member of this workspace.");
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { googleOAuthRefreshToken: true } });
  return { enabled, googleConnected: !!u?.googleOAuthRefreshToken };
}

// ── Lead → client ────────────────────────────────────────────────────────────

async function findConversionProposal(client: { id: string; workspaceId: string; name: string }) {
  const docs = await prisma.document.findMany({
    where: {
      workspaceId: client.workspaceId,
      documentType: "PROPOSAL",
      OR: [{ clientId: client.id }, { clientName: { equals: client.name, mode: "insensitive" } }],
    },
    select: {
      id: true,
      title: true,
      clientId: true,
      status: true,
      acceptedAt: true,
      updatedAt: true,
      signatureRequests: { where: { status: "COMPLETED" }, select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (docs.length === 0) return null;
  const accepted = docs.find((d) => d.status === "ACCEPTED" || d.acceptedAt || d.signatureRequests.length > 0);
  const chosen = accepted ?? docs[0];
  return { id: chosen.id, title: chosen.title || "Untitled proposal", accepted: !!accepted, linked: chosen.clientId === client.id };
}

export async function getConversionPreview(slug: string): Promise<ConvertPreview | null> {
  const client = await findLead(slug);
  if (!client) return null;
  const domains = effectiveLeadDomains(client);
  const [emailRows, proposal, openActions] = await Promise.all([
    prisma.clientTouchpoint.findMany({
      where: { clientId: client.id, source: "gmail", counterpartEmail: { not: null } },
      select: { direction: true, counterpartEmail: true, counterpartName: true, occurredAt: true },
      take: 2000,
    }),
    findConversionProposal(client),
    prisma.leadAction.count({ where: { clientId: client.id, state: "open" } }),
  ]);
  return {
    fields: buildConversionProposals(client, deriveMainContact(emailRows, domains), domains),
    proposal,
    openActions,
  };
}

/**
 * Convert a lead into a full Portal client: apply the chosen CRM-derived fields (empty fields
 * only — re-checked here, not trusted from the preview), link the proposal so Plan review can
 * seed delivery from it, close the pipeline at Won, and flip status to ACTIVE. The activity log,
 * actions and history stay on the record; it is the same client, now active.
 */
export async function convertLeadToClient(
  slug: string,
  input: { fields: ConvertField[] },
  actor: EffectiveUser | null,
): Promise<ConvertResult | null> {
  const client = await findLead(slug);
  if (!client) return null;
  if (client.status !== "LEAD") throw new CrmInputError("Only a lead can be converted.");

  const preview = await getConversionPreview(slug);
  if (!preview) return null;
  const wanted = new Set(input.fields);
  const data: Record<string, unknown> = {};
  const applied: string[] = [];
  for (const f of preview.fields) {
    if (!wanted.has(f.field)) continue;
    data[f.field] = f.proposed;
    applied.push(f.label);
  }

  const now = new Date();
  const proposal = preview.proposal;
  await prisma.$transaction([
    prisma.workspaceClient.update({
      where: { id: client.id },
      data: {
        ...data,
        status: "ACTIVE",
        leadStage: "WON",
        leadStageChangedAt: now,
        crmAutoEnabled: false,
        resumeAt: null,
        pauseNote: null,
      },
    }),
    ...(proposal && !proposal.linked
      ? [prisma.document.update({ where: { id: proposal.id }, data: { clientId: client.id } })]
      : []),
    prisma.clientTouchpoint.create({
      data: {
        clientId: client.id,
        workspaceId: client.workspaceId,
        type: "STAGE",
        source: "system",
        authorId: actor?.id ?? null,
        note: `Converted to a client${applied.length ? ` — filled in ${applied.join(", ").toLowerCase()}` : ""}`,
        occurredAt: now,
      },
    }),
  ]);
  revalidateTag("client-collections");
  return { clientSlug: client.slug, applied, proposalId: proposal?.id ?? null };
}

/** Leads the scheduled sync should visit. */
export async function listLeadsForScheduledSync(): Promise<string[]> {
  const rows = await prisma.workspaceClient.findMany({
    where: { crmAutoEnabled: true, status: "LEAD" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** The lead's id for a slug, or null. */
export async function getLeadIdBySlug(slug: string): Promise<string | null> {
  const client = await findLead(slug);
  return client?.id ?? null;
}
