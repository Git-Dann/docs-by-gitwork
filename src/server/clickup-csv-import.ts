// One-time ClickUp → Foundry migration — CSV-export path (no token).
//
// ClickUp's CSV export is a flat, complete dump that sidesteps the API/MCP
// bulk-pull timeouts. The export is parsed locally by scripts/parse-clickup-csv.mjs
// into src/data/clickup-import.json (a compact, active-only dataset), which this
// module imports and writes to the DB — idempotently, keyed on clickupId.
//
// NOTE: ClickUp omits custom fields from CSV exports, so this path imports tasks
// UNASSIGNED (the native "Assignees" column is empty; the custom "Assignee" field
// isn't exported). Assignments are done in-app via the batch tools. Everything
// else — clients, lists→blocks, milestones, statuses, one-level subtasks — comes
// through. (The token path in clickup-import.ts carries assignees + custom fields
// if full fidelity is ever needed.)
//
// Mapping mirrors clickup-import.ts: folder→WorkspaceClient (normalized name +
// FOLDER_ALIASES), list→FeatureBlock (undated), Milestones list→Milestone (dated),
// task→Task (active only — the dataset is pre-filtered), subtask→parentId (one level).

import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { mapStatus, mapPriority, normalize, type ImportReport, type ClientReport, type ListReport } from "@/server/clickup-import";
import datasetJson from "@/data/clickup-import.json";

// ── Dataset shape (produced by scripts/parse-clickup-csv.mjs) ────────────────
interface CsvTask {
  clickupId: string;
  name: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  dueMs: number | null;
  startMs: number | null;
  parentClickupId: string | null;
  assigneeNames: string[];
}
interface CsvList {
  clickupId: string;
  name: string;
  isMilestones: boolean;
  tasks: CsvTask[];
}
interface CsvFolder {
  name: string;
  lists: CsvList[];
}
interface CsvDataset {
  generatedFrom: string;
  space: string;
  folders: CsvFolder[];
}

const dataset = datasetJson as unknown as CsvDataset;

/** Normalized ClickUp folder name → WorkspaceClient slug, for any name mismatches. */
const FOLDER_ALIASES: Record<string, string> = {
  // ClickUp folder name (normalized) → Portal client slug, where the names diverge.
  "big wedge": "wedge",
};

// ── Writers (find-then-write, keyed on clickupId) ────────────────────────────

async function upsertBlock(wsId: string, clientId: string, list: CsvList, order: number): Promise<string> {
  const existing = await prisma.featureBlock.findFirst({
    where: { clientId, clickupId: list.clickupId },
    select: { id: true },
  });
  if (existing) {
    await prisma.featureBlock.update({ where: { id: existing.id }, data: { name: list.name } });
    return existing.id;
  }
  const created = await prisma.featureBlock.create({
    data: { workspaceId: wsId, clientId, name: list.name, orderKey: order, clickupId: list.clickupId },
    select: { id: true },
  });
  return created.id;
}

async function upsertMilestone(wsId: string, clientId: string, t: CsvTask, date: Date): Promise<void> {
  const existing = await prisma.milestone.findFirst({
    where: { clientId, clickupId: t.clickupId },
    select: { id: true },
  });
  const data = { name: t.name || "Milestone", date };
  if (existing) await prisma.milestone.update({ where: { id: existing.id }, data });
  else await prisma.milestone.create({ data: { workspaceId: wsId, clientId, clickupId: t.clickupId, ...data } });
}

async function upsertTask(
  wsId: string,
  clientId: string,
  blockId: string | null,
  t: CsvTask,
  status: TaskStatus,
  parentId: string | null,
): Promise<string> {
  // Preserve the source status/priority + any names ClickUp had on the row (display-only).
  const metadata: Record<string, unknown> = {
    _clickup: { taskId: t.clickupId, status: t.status, priority: t.priority },
  };
  if (t.assigneeNames.length) metadata.clickupAssignees = t.assigneeNames;

  const base = {
    title: t.name || "(untitled)",
    description: t.description,
    status,
    priority: mapPriority(t.priority ? { priority: t.priority } : null),
    dueDate: t.dueMs ? new Date(t.dueMs) : null,
    featureBlockId: blockId,
    parentId,
    metadata: metadata as Prisma.InputJsonValue,
  };

  const existing = await prisma.task.findFirst({
    where: { workspaceId: wsId, clickupId: t.clickupId },
    select: { id: true },
  });
  if (existing) {
    await prisma.task.update({ where: { id: existing.id }, data: { ...base, clientId } });
    return existing.id;
  }
  const created = await prisma.task.create({
    data: { workspaceId: wsId, clientId, clickupId: t.clickupId, ...base },
    select: { id: true },
  });
  return created.id;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export interface CsvRunOptions {
  dryRun?: boolean;
  clientSlug?: string;
}

export async function runCsvImport(opts: CsvRunOptions = {}): Promise<ImportReport> {
  const dryRun = opts.dryRun !== false; // default ON

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  const wsId = workspace.id;

  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: wsId },
    select: { id: true, name: true, slug: true },
  });
  const byName = new Map<string, (typeof clients)[number]>();
  const bySlug = new Map<string, (typeof clients)[number]>();
  // Space-insensitive key so a folder like "AfterDesk" matches a client "After Desk".
  const byCompact = new Map<string, (typeof clients)[number]>();
  for (const c of clients) {
    byName.set(normalize(c.name), c);
    bySlug.set(c.slug, c);
    byCompact.set(normalize(c.name).replace(/\s+/g, ""), c);
  }

  const report: ImportReport = {
    dryRun,
    workspace: DEFAULT_WORKSPACE_SLUG,
    spaceName: dataset.space,
    totals: { foldersSeen: 0, clientsMatched: 0, blocks: 0, milestones: 0, tasks: 0, subtasks: 0, assignments: 0 },
    unmatchedFolders: [],
    unmatchedAssignees: [],
    knownButMissingUsers: [],
    clients: [],
  };

  for (const folder of dataset.folders) {
    report.totals.foldersSeen++;
    const nf = normalize(folder.name);
    const aliasSlug = FOLDER_ALIASES[nf];
    const matched =
      (aliasSlug ? bySlug.get(aliasSlug) : undefined) ??
      byName.get(nf) ??
      byCompact.get(nf.replace(/\s+/g, "")) ?? // "after desk" → "afterdesk"
      bySlug.get(nf.replace(/\s+/g, "-")); // "after desk" → "after-desk"
    if (!matched) {
      report.unmatchedFolders.push(folder.name);
      continue;
    }
    if (opts.clientSlug && matched.slug !== opts.clientSlug) continue;

    report.totals.clientsMatched++;
    const cReport: ClientReport = {
      folderId: folder.name,
      folderName: folder.name,
      matchedClient: matched,
      lists: [],
      blocks: 0,
      milestones: 0,
      milestonesDateless: 0,
      tasks: 0,
      subtasks: 0,
      assignments: 0,
    };

    for (let li = 0; li < folder.lists.length; li++) {
      const list = folder.lists[li];
      const lReport: ListReport = {
        name: list.name,
        clickupId: list.clickupId,
        role: list.isMilestones ? "milestones" : "block",
        activeTasks: 0,
        subtasks: 0,
        doneSkipped: 0,
      };

      if (list.isMilestones) {
        for (const t of list.tasks) {
          const date = t.dueMs ? new Date(t.dueMs) : t.startMs ? new Date(t.startMs) : null;
          if (!date) {
            cReport.milestonesDateless++;
            continue;
          }
          if (!dryRun) await upsertMilestone(wsId, matched.id, t, date);
          cReport.milestones++;
          lReport.activeTasks++;
        }
        cReport.lists.push(lReport);
        continue;
      }

      // Block list → FeatureBlock + its active tasks.
      let blockId: string | null = null;
      if (!dryRun) blockId = await upsertBlock(wsId, matched.id, list, li);
      cReport.blocks++;

      const active = list.tasks
        .map((t) => ({ t, status: mapStatus({ status: t.status ?? undefined }) }))
        .filter((x): x is { t: CsvTask; status: TaskStatus } => {
          if (x.status === null) {
            lReport.doneSkipped++;
            return false;
          }
          return true;
        });

      const top = active.filter((x) => !x.t.parentClickupId);
      const kids = active.filter((x) => !!x.t.parentClickupId);
      const topIds = new Set(top.map((x) => x.t.clickupId));
      const idByCu = new Map<string, string | null>();

      for (const { t, status } of top) {
        const fid = dryRun ? null : await upsertTask(wsId, matched.id, blockId, t, status, null);
        idByCu.set(t.clickupId, fid);
        cReport.tasks++;
        lReport.activeTasks++;
      }
      for (const { t, status } of kids) {
        const parentInSet = !!(t.parentClickupId && topIds.has(t.parentClickupId));
        const parentFid = parentInSet ? (idByCu.get(t.parentClickupId as string) ?? null) : null;
        if (!dryRun) await upsertTask(wsId, matched.id, blockId, t, status, parentFid);
        cReport.tasks++;
        if (parentInSet) {
          cReport.subtasks++;
          lReport.subtasks++;
        }
        lReport.activeTasks++;
      }

      cReport.lists.push(lReport);
    }

    report.clients.push(cReport);
    report.totals.blocks += cReport.blocks;
    report.totals.milestones += cReport.milestones;
    report.totals.tasks += cReport.tasks;
    report.totals.subtasks += cReport.subtasks;
  }

  return report;
}
