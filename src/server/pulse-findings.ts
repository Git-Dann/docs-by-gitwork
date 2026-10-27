import { prisma } from "@/lib/prisma";
import { targetKey } from "@/lib/pulse-projects";
import { findingTask, type FindingDecision, type FindingState, type FindingTask } from "@/lib/pulse-findings";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { createTask } from "@/server/tasks";

/**
 * Storage for Pulse findings: the team's decision about each finding, and the board task
 * it was sent to, per project (see src/lib/pulse-findings.ts for the rules). Every function
 * takes a scan id the caller has already been allowed to see (`requireScanAccess`), and works
 * on that scan's PROJECT, so a decision made on one scan carries to the next.
 */

class FindingError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const SCAN_SELECT = {
  id: true, workspaceId: true, clientId: true, inputUrl: true, inputGithubRepo: true, projectName: true,
  checks: { select: { checkKey: true, label: true, category: true, status: true, detail: true, evidence: true } },
} as const;

async function loadScan(scanId: string) {
  const scan = await prisma.pulseScan.findUnique({ where: { id: scanId }, select: SCAN_SELECT });
  if (!scan) throw new FindingError("Scan not found.", 404);
  return { scan, key: targetKey(scan) };
}

export interface FindingsResponse {
  targetKey: string;
  clientId: string | null;
  states: FindingState[];
  tasks: FindingTask[];
}

/** The decisions and tasks for the scan's project. */
export async function getFindingStates(scanId: string): Promise<FindingsResponse> {
  const { scan, key } = await loadScan(scanId);
  const rows = await prisma.pulseFindingState.findMany({ where: { workspaceId: scan.workspaceId, targetKey: key } });

  // Tasks made with the older per-check "+ Task" button carry the check key in their
  // metadata but have no state row; they count as sent to the board.
  const legacy = scan.clientId
    ? await prisma.task.findMany({
      where: { clientId: scan.clientId, archivedAt: null, metadata: { path: ["source"], equals: "pulse_scan" } },
      select: { id: true, metadata: true },
    })
    : [];
  const legacyByCheck = new Map<string, string>();
  for (const t of legacy) {
    const ck = (t.metadata as Record<string, unknown> | null)?.["pulseCheckKey"];
    if (typeof ck === "string" && !legacyByCheck.has(ck)) legacyByCheck.set(ck, t.id);
  }

  const deciderIds = [...new Set(rows.map((r) => r.decidedById).filter((x): x is string => Boolean(x)))];
  const deciders = deciderIds.length
    ? await prisma.user.findMany({ where: { id: { in: deciderIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(deciders.map((u) => [u.id, u.name ?? u.email ?? null]));

  const states: FindingState[] = rows.map((r) => ({
    checkKey: r.checkKey,
    decision: r.decision,
    note: r.note,
    taskId: r.taskId ?? legacyByCheck.get(r.checkKey) ?? null,
    decidedByName: r.decidedById ? nameOf.get(r.decidedById) ?? null : null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
  const seen = new Set(states.map((s) => s.checkKey));
  for (const [checkKey, taskId] of legacyByCheck) {
    if (!seen.has(checkKey)) states.push({ checkKey, decision: null, note: null, taskId, decidedByName: null, decidedAt: null });
  }

  const taskIds = [...new Set(states.map((s) => s.taskId).filter((x): x is string => Boolean(x)))];
  const taskRows = taskIds.length
    ? await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, status: true, title: true, assignees: { select: { name: true, email: true }, take: 1 } },
    })
    : [];
  const tasks: FindingTask[] = taskRows.map((t) => ({
    id: t.id, status: t.status, title: t.title, assigneeName: t.assignees[0]?.name ?? t.assignees[0]?.email ?? null,
  }));
  // A task deleted from the board is not "on the board".
  const live = new Set(tasks.map((t) => t.id));
  for (const s of states) if (s.taskId && !live.has(s.taskId)) s.taskId = null;

  return { targetKey: key, clientId: scan.clientId, states, tasks };
}

/** Record (or clear, with `null`) a decision about one finding. */
export async function setFindingDecision(
  user: EffectiveUser | null,
  scanId: string,
  checkKey: string,
  decision: FindingDecision | null,
  note: string | null,
): Promise<void> {
  const { scan, key } = await loadScan(scanId);
  if (!scan.checks.some((c) => c.checkKey === checkKey)) throw new FindingError("That check is not part of this scan.", 404);
  const data = {
    decision,
    note: decision ? note?.trim().slice(0, 1000) || null : null,
    decidedById: user?.id ?? null,
    decidedAt: new Date(),
    scanId,
  };
  await prisma.pulseFindingState.upsert({
    where: { workspaceId_targetKey_checkKey: { workspaceId: scan.workspaceId, targetKey: key, checkKey } },
    create: { workspaceId: scan.workspaceId, targetKey: key, checkKey, ...data },
    update: data,
  });
}

/**
 * Put one finding on the linked client's board. Idempotent: a finding already on the board
 * returns its task rather than adding a second one.
 */
export async function sendFindingToBoard(user: EffectiveUser, scanId: string, checkKey: string): Promise<{ taskId: string; created: boolean }> {
  const { scan, key } = await loadScan(scanId);
  if (!scan.clientId) throw new FindingError("Link this scan to a client first, so the task has a board to go on.", 400);
  const check = scan.checks.find((c) => c.checkKey === checkKey);
  if (!check) throw new FindingError("That check is not part of this scan.", 404);

  const existing = (await getFindingStates(scanId)).states.find((s) => s.checkKey === checkKey);
  if (existing?.taskId) return { taskId: existing.taskId, created: false };

  const t = findingTask(check, scan.id);
  const task = await createTask(user, { clientId: scan.clientId, title: t.title, description: t.description || undefined, priority: t.priority, metadata: t.metadata });
  await prisma.pulseFindingState.upsert({
    where: { workspaceId_targetKey_checkKey: { workspaceId: scan.workspaceId, targetKey: key, checkKey } },
    create: { workspaceId: scan.workspaceId, targetKey: key, checkKey, taskId: task.id, scanId },
    update: { taskId: task.id, scanId },
  });
  return { taskId: task.id, created: true };
}
