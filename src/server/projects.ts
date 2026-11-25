/**
 * Projects (CLAUDE.md §150): a piece of work for a client, with its accepted document, its dates
 * and its budget. Rules for every figure live in src/lib/project-budget.ts; this file reads.
 *
 * ⚠️ Money figures are built ONLY when the caller passes `financials: true`, which every route
 * decides with `canViewClientFinancials`. Without it no document cost line, placement or rate is
 * even read, so a figure can't leak by a component forgetting to hide it.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/server/auth/effective-user";
import { normalizeToMonthly } from "@/server/rate-card";
import { loadFxRates } from "@/server/fx";
import { LINE_SELECT, costingOf, lines, type RawLine } from "@/server/money";
import { docTerms, type FxRates } from "@/lib/money";
import { releaseLabel } from "@/lib/tasks/releases";
import {
  dayOf,
  overlappingProjects,
  projectFigures,
  projectOfTask,
  readProjectStatus,
  timeElapsed,
  workProgress,
  type PlacementCost,
  type ProjectStatus,
} from "@/lib/project-budget";
import type { LinkableDocument, ProjectBudgetRow, ProjectDetailDTO, ProjectDTO, ProjectMoney, ProjectTaskRow } from "@/types/projects";

/** A refused write, with the reason as a sentence. */
export class ProjectError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProjectError";
    this.status = status;
  }
}

const PROJECT_SELECT = {
  id: true,
  workspaceId: true,
  clientId: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  documentId: true,
  budgetAmount: true,
  budgetCurrency: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

const DOC_BASE_SELECT = {
  id: true,
  title: true,
  clientId: true,
  archivedAt: true,
  status: true,
  acceptedAt: true,
  updatedAt: true,
  signatureRequests: { where: { status: "COMPLETED" }, select: { completedAt: true }, orderBy: { completedAt: "asc" }, take: 1 },
} as const satisfies Prisma.DocumentSelect;

const DOC_MONEY_SELECT = {
  ...DOC_BASE_SELECT,
  costLineItems: { select: LINE_SELECT },
  sections: { where: { key: "costing" }, select: { data: true }, take: 1 },
} as const satisfies Prisma.DocumentSelect;

type DocRow = Prisma.DocumentGetPayload<{ select: typeof DOC_BASE_SELECT }>;
type DocMoneyRow = Prisma.DocumentGetPayload<{ select: typeof DOC_MONEY_SELECT }>;

const PLACEMENT_SELECT = {
  clientId: true,
  candidateId: true,
  startDate: true,
  endDate: true,
  candidate: {
    select: {
      devGroup: true,
      rateCardPerson: { select: { sourceRate: true, billingPeriod: true, sourceCurrencyCode: true, archivedAt: true } },
    },
  },
} as const satisfies Prisma.PlacementSelect;

/** Accepted, or signed through DocuSeal: the same "won" Money uses. */
function isWon(d: DocRow): boolean {
  return Boolean(d.acceptedAt) || d.status === "ACCEPTED" || d.signatureRequests.length > 0;
}

function wonAt(d: DocRow): Date {
  return d.acceptedAt ?? d.signatureRequests[0]?.completedAt ?? d.updatedAt;
}

/** The budget a project gets: from its document, else typed by hand. With the reason when the document gives none. */
function budgetOf(
  p: ProjectRow,
  doc: DocMoneyRow | undefined,
): { budget: { amount: number; currency: string; source: "document" | "manual" } | null; problem: string | null } {
  if (p.documentId) {
    if (!doc) return { budget: null, problem: "The linked document can't be found." };
    if (doc.archivedAt) return { budget: null, problem: "The linked document was archived, so it gives no budget." };
    if (!isWon(doc)) return { budget: null, problem: "The linked document hasn't been accepted or signed yet." };
    const terms = docTerms(lines(doc.costLineItems as RawLine[]), costingOf(doc.sections));
    if (!(terms.total > 0)) return { budget: null, problem: "The linked document has no costs." };
    return { budget: { amount: terms.total, currency: terms.currency, source: "document" }, problem: null };
  }
  const amount = p.budgetAmount == null ? null : Number(p.budgetAmount);
  if (amount != null && amount > 0) return { budget: { amount, currency: p.budgetCurrency || "GBP", source: "manual" }, problem: null };
  return { budget: null, problem: null };
}

/**
 * Builds DTOs for these projects (any clients of one workspace). `allLive` is every live project
 * of the same clients: a task's own link only counts when it names a live project, and overlap is
 * judged against them.
 */
async function buildProjects(
  workspaceId: string,
  rows: ProjectRow[],
  allLive: ProjectRow[],
  opts: { financials: boolean; now: Date; taskRows?: boolean },
): Promise<Array<ProjectDTO & { tasks?: ProjectTaskRow[] }>> {
  if (rows.length === 0) return [];
  const liveIds = new Set(allLive.map((p) => p.id));
  const ids = rows.map((p) => p.id);
  const clientIds = [...new Set(allLive.map((p) => p.clientId))];

  const [releases, blocks] = await Promise.all([
    prisma.clientRelease.findMany({
      where: { workspaceId, clientId: { in: clientIds }, projectId: { in: [...liveIds] } },
      select: { id: true, version: true, name: true, projectId: true, orderKey: true, changelogVersion: true, client: { select: { releasesUseChangelog: true } } },
      orderBy: { orderKey: "asc" },
    }),
    prisma.featureBlock.findMany({
      where: { workspaceId, clientId: { in: clientIds }, projectId: { in: [...liveIds] } },
      select: { id: true, name: true, projectId: true, orderKey: true },
      orderBy: { orderKey: "asc" },
    }),
  ]);
  const releaseProject = new Map(releases.map((r) => [r.id, r.projectId as string]));
  const blockProject = new Map(blocks.map((b) => [b.id, b.projectId as string]));

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId,
      clientId: { in: clientIds },
      archivedAt: null,
      parentId: null,
      OR: [
        { projectId: { in: ids } },
        ...(releases.length ? [{ releaseId: { in: releases.map((r) => r.id) } }] : []),
        ...(blocks.length ? [{ featureBlockId: { in: blocks.map((b) => b.id) } }] : []),
      ],
    },
    select: { id: true, title: true, status: true, estimateHours: true, projectId: true, releaseId: true, featureBlockId: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const tasksBy = new Map<string, ProjectTaskRow[]>();
  for (const t of tasks) {
    const ownLive = t.projectId && liveIds.has(t.projectId) ? t.projectId : null;
    const pid = projectOfTask({ projectId: ownLive, releaseId: t.releaseId, featureBlockId: t.featureBlockId }, releaseProject, blockProject);
    if (!pid) continue;
    const via: ProjectTaskRow["via"] = ownLive ? "task" : t.releaseId && releaseProject.has(t.releaseId) ? "release" : "category";
    const list = tasksBy.get(pid) ?? [];
    list.push({ id: t.id, title: t.title, status: t.status, done: t.status === "DONE", estimateHours: t.estimateHours, via });
    tasksBy.set(pid, list);
  }

  const docIds = [...new Set(rows.map((p) => p.documentId).filter((x): x is string => !!x))];
  const docs = new Map<string, DocMoneyRow | DocRow>();
  if (docIds.length) {
    const found = opts.financials
      ? await prisma.document.findMany({ where: { id: { in: docIds }, workspaceId, clientId: { in: clientIds } }, select: DOC_MONEY_SELECT })
      : await prisma.document.findMany({ where: { id: { in: docIds }, workspaceId, clientId: { in: clientIds } }, select: DOC_BASE_SELECT });
    for (const d of found) docs.set(d.id, d);
  }

  // Money: placements across the projects' clients, and rates for each budget currency.
  const placementsBy = new Map<string, PlacementCost[]>();
  const fxBy = new Map<string, FxRates>();
  if (opts.financials) {
    const minStart = new Date(Math.min(...rows.map((p) => dayOf(p.startDate))));
    const placements = await prisma.placement.findMany({
      where: {
        clientId: { in: [...new Set(rows.map((p) => p.clientId))] },
        candidate: { workspaceId },
        startDate: { lte: opts.now },
        OR: [{ endDate: null }, { endDate: { gte: minStart } }],
      },
      select: PLACEMENT_SELECT,
    });
    for (const p of placements) {
      if (!p.clientId) continue;
      const rc = p.candidate.rateCardPerson;
      const proBono = p.candidate.devGroup === "PRO_BONO";
      const priced = !proBono && rc && !rc.archivedAt;
      const list = placementsBy.get(p.clientId) ?? [];
      list.push({
        candidateId: p.candidateId,
        start: p.startDate.toISOString(),
        end: p.endDate ? p.endDate.toISOString() : null,
        monthly: priced ? normalizeToMonthly(rc.sourceRate, rc.billingPeriod) : null,
        currency: priced ? rc.sourceCurrencyCode : "GBP",
        proBono,
      });
      placementsBy.set(p.clientId, list);
    }
    const currencies = new Set<string>();
    for (const p of rows) currencies.add(budgetOf(p, docs.get(p.documentId ?? "") as DocMoneyRow | undefined).budget?.currency ?? "GBP");
    await Promise.all([...currencies].map(async (c) => fxBy.set(c, await loadFxRates(c))));
  }

  const liveByClient = new Map<string, Array<{ id: string; name: string; startDate: string; endDate: string | null }>>();
  for (const p of allLive) {
    const list = liveByClient.get(p.clientId) ?? [];
    list.push({ id: p.id, name: p.name, startDate: p.startDate.toISOString(), endDate: p.endDate ? p.endDate.toISOString() : null });
    liveByClient.set(p.clientId, list);
  }

  return rows.map((p) => {
    const start = p.startDate.toISOString();
    const end = p.endDate ? p.endDate.toISOString() : null;
    const ptasks = tasksBy.get(p.id) ?? [];
    const progress = workProgress(ptasks);
    const doc = p.documentId ? docs.get(p.documentId) : undefined;
    let money: ProjectMoney | null = null;
    if (opts.financials) {
      const { budget, problem } = budgetOf(p, doc as DocMoneyRow | undefined);
      const fx = fxBy.get(budget?.currency ?? "GBP") ?? { base: budget?.currency ?? "GBP", rates: {}, asOf: null, error: "the exchange rates could not be read" };
      money = {
        ...projectFigures({ start, end, now: opts.now, budget, placements: placementsBy.get(p.clientId) ?? [], fx, progress }),
        budgetProblem: problem,
        manualBudget:
          !p.documentId && p.budgetAmount != null ? { amount: Number(p.budgetAmount), currency: p.budgetCurrency || "GBP" } : null,
      };
    }
    const own = { id: p.id, name: p.name, startDate: start, endDate: end };
    return {
      id: p.id,
      clientId: p.clientId,
      name: p.name,
      status: readProjectStatus(p.status),
      startDate: start,
      endDate: end,
      document: doc ? { id: doc.id, title: doc.title } : null,
      progress,
      timeShare: timeElapsed(start, end, opts.now),
      releases: releases.filter((r) => r.projectId === p.id).map((r) => ({ id: r.id, label: releaseLabel(r) })),
      categories: blocks.filter((b) => b.projectId === p.id).map((b) => ({ id: b.id, name: b.name })),
      sharedWith: overlappingProjects(own, liveByClient.get(p.clientId) ?? []),
      money,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      ...(opts.taskRows
        ? { tasks: [...ptasks.filter((t) => !t.done), ...ptasks.filter((t) => t.done)].slice(0, 60) }
        : {}),
    };
  });
}

async function liveProjects(workspaceId: string, clientIds: string[]): Promise<ProjectRow[]> {
  return prisma.project.findMany({
    where: { workspaceId, clientId: { in: clientIds }, archivedAt: null },
    select: PROJECT_SELECT,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
}

/** A client's live projects, newest start first. */
export async function listClientProjects(
  workspaceId: string,
  clientId: string,
  opts: { financials: boolean; now?: Date },
): Promise<ProjectDTO[]> {
  const rows = await liveProjects(workspaceId, [clientId]);
  return buildProjects(workspaceId, rows, rows, { financials: opts.financials, now: opts.now ?? new Date() });
}

/** One live project with its tasks. Another client's id, or an archived one, is a 404. */
export async function getClientProject(
  workspaceId: string,
  clientId: string,
  id: string,
  opts: { financials: boolean; now?: Date },
): Promise<ProjectDetailDTO> {
  const all = await liveProjects(workspaceId, [clientId]);
  const row = all.find((p) => p.id === id);
  if (!row) throw new NotFoundError("Project not found");
  const [dto] = await buildProjects(workspaceId, [row], all, { financials: opts.financials, now: opts.now ?? new Date(), taskRows: true });
  return { ...dto, tasks: dto.tasks ?? [] };
}

/** Money's per-project table: every live project in the workspace with a budget. Financial viewers only. */
export async function loadProjectBudgets(workspaceId: string, now: Date = new Date()): Promise<ProjectBudgetRow[]> {
  const all = await prisma.project.findMany({
    where: { workspaceId, archivedAt: null, client: { hidden: false } },
    select: { ...PROJECT_SELECT, client: { select: { name: true, slug: true } } },
    orderBy: [{ startDate: "desc" }],
  });
  const built = await buildProjects(workspaceId, all, all, { financials: true, now });
  const clientOf = new Map(all.map((p) => [p.id, p.client]));
  return built
    .filter((p) => p.money)
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      clientName: clientOf.get(p.id)?.name ?? "",
      clientSlug: clientOf.get(p.id)?.slug ?? "",
      startDate: p.startDate,
      endDate: p.endDate,
      progress: p.progress,
      timeShare: p.timeShare,
      money: p.money as ProjectMoney,
    }));
}

/** Accepted or signed documents of a client, for "Link a document". */
export async function linkableDocuments(workspaceId: string, clientId: string, opts: { financials: boolean }): Promise<LinkableDocument[]> {
  const docs = await prisma.document.findMany({
    where: {
      workspaceId,
      clientId,
      archivedAt: null,
      OR: [{ acceptedAt: { not: null } }, { status: "ACCEPTED" }, { signatureRequests: { some: { status: "COMPLETED" } } }],
    },
    select: DOC_MONEY_SELECT,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return docs.map((d) => {
    const terms = opts.financials ? docTerms(lines(d.costLineItems as RawLine[]), costingOf(d.sections)) : null;
    return {
      id: d.id,
      title: d.title,
      wonAt: wonAt(d).toISOString(),
      total: terms ? terms.total : null,
      currency: terms ? terms.currency : null,
    };
  });
}

/** A document can be linked when it belongs to this client, isn't archived and was accepted or signed. */
async function assertLinkableDocument(workspaceId: string, clientId: string, documentId: string): Promise<void> {
  const d = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { ...DOC_BASE_SELECT } });
  if (!d || d.clientId !== clientId) throw new ProjectError("That document isn't on this client.", 400);
  if (d.archivedAt) throw new ProjectError("That document is archived.", 400);
  if (!isWon(d)) throw new ProjectError("Only an accepted or signed document can set a project's budget.", 400);
}

/** A project id a task, release or category may point at: live and on the same client. */
export async function assertProjectInClient(workspaceId: string, clientId: string, projectId: string): Promise<void> {
  const p = await prisma.project.findFirst({ where: { id: projectId, workspaceId, clientId, archivedAt: null }, select: { id: true } });
  if (!p) throw new ProjectError("That project isn't on this client.", 400);
}

export interface ProjectWrite {
  name?: string;
  status?: ProjectStatus;
  startDate?: string;
  endDate?: string | null;
  documentId?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  /** The client's categories that make up this project: replaces the current set. */
  featureBlockIds?: string[];
}

async function setCategories(workspaceId: string, clientId: string, projectId: string, ids: string[]): Promise<void> {
  if (ids.length) {
    const found = await prisma.featureBlock.count({ where: { id: { in: ids }, workspaceId, clientId } });
    if (found !== new Set(ids).size) throw new ProjectError("A category isn't on this client.", 400);
  }
  await prisma.$transaction([
    prisma.featureBlock.updateMany({ where: { workspaceId, clientId, projectId, id: { notIn: ids } }, data: { projectId: null } }),
    ...(ids.length ? [prisma.featureBlock.updateMany({ where: { workspaceId, clientId, id: { in: ids } }, data: { projectId } })] : []),
  ]);
}

function budgetData(input: ProjectWrite): Pick<Prisma.ProjectUncheckedCreateInput, "budgetAmount" | "budgetCurrency"> {
  // A linked document sets the budget; a typed one is never kept beside it.
  if (input.documentId) return { budgetAmount: null, budgetCurrency: null };
  const out: Pick<Prisma.ProjectUncheckedCreateInput, "budgetAmount" | "budgetCurrency"> = {};
  if (input.budgetAmount !== undefined) out.budgetAmount = input.budgetAmount;
  if (input.budgetCurrency !== undefined) out.budgetCurrency = input.budgetCurrency;
  return out;
}

export async function createProject(
  workspaceId: string,
  clientId: string,
  createdById: string | null,
  input: ProjectWrite & { name: string; startDate: string },
): Promise<string> {
  if (input.documentId) await assertLinkableDocument(workspaceId, clientId, input.documentId);
  const row = await prisma.project.create({
    data: {
      workspaceId,
      clientId,
      createdById,
      name: input.name.trim(),
      status: input.status ?? "PLANNED",
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      documentId: input.documentId || null,
      ...budgetData(input),
    },
    select: { id: true },
  });
  if (input.featureBlockIds) await setCategories(workspaceId, clientId, row.id, input.featureBlockIds);
  return row.id;
}

export async function updateProject(workspaceId: string, clientId: string, id: string, input: ProjectWrite): Promise<void> {
  const existing = await prisma.project.findFirst({
    where: { id, workspaceId, clientId, archivedAt: null },
    select: { startDate: true, endDate: true, documentId: true },
  });
  if (!existing) throw new NotFoundError("Project not found");
  const start = input.startDate !== undefined ? new Date(input.startDate) : existing.startDate;
  const end = input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : existing.endDate;
  if (end && dayOf(end) < dayOf(start)) throw new ProjectError("The end date must be on or after the start date.", 400);
  if (input.documentId) await assertLinkableDocument(workspaceId, clientId, input.documentId);

  const data: Prisma.ProjectUpdateManyMutationInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.status !== undefined) data.status = input.status;
  if (input.startDate !== undefined) data.startDate = start;
  if (input.endDate !== undefined) data.endDate = end;
  if (input.documentId !== undefined) data.documentId = input.documentId || null;
  const nextDoc = input.documentId !== undefined ? input.documentId : existing.documentId;
  Object.assign(data, budgetData({ ...input, documentId: nextDoc }));
  // Scoped by client and still live: a project archived meanwhile, or another client's, writes nothing.
  const res = await prisma.project.updateMany({ where: { id, workspaceId, clientId, archivedAt: null }, data });
  if (res.count === 0) throw new NotFoundError("Project not found");
  if (input.featureBlockIds) await setCategories(workspaceId, clientId, id, input.featureBlockIds);
}

/** Archives, never deletes. Links stay; an archived project simply stops counting anywhere. */
export async function archiveProject(workspaceId: string, clientId: string, id: string): Promise<void> {
  const res = await prisma.project.updateMany({
    where: { id, workspaceId, clientId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (res.count === 0) throw new NotFoundError("Project not found");
}
