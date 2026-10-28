import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { targetKey } from "@/lib/pulse-projects";
import { countOpenFindings, findingFingerprint, findingTask, type FindingDecision, type FindingState, type FindingTask } from "@/lib/pulse-findings";
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
  id: true, workspaceId: true, clientId: true, createdAt: true, inputUrl: true, inputGithubRepo: true, projectName: true,
  checks: { select: { checkKey: true, label: true, category: true, status: true, detail: true, evidence: true } },
} as const satisfies Prisma.PulseScanSelect;

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

/** One project to read findings for: its key, and the client whose board its tasks are on. */
export interface FindingTarget {
  targetKey: string;
  clientId: string | null;
  /** When the scan being read was made: passes after this do not count (an older scan reads as it was). */
  asOf: Date;
}

/**
 * The decisions and board tasks for many projects at once, in a fixed number of queries
 * however many projects there are (the Projects list reads every project's). One scan's
 * read goes through here too, so the list and the scan page cannot disagree.
 */
export async function loadFindingStates(
  workspaceId: string,
  targets: FindingTarget[],
): Promise<Map<string, { states: FindingState[]; tasks: FindingTask[] }>> {
  const out = new Map<string, { states: FindingState[]; tasks: FindingTask[] }>();
  if (targets.length === 0) return out;
  const keys = [...new Set(targets.map((t) => t.targetKey))];
  const clientIds = [...new Set(targets.map((t) => t.clientId).filter((x): x is string => Boolean(x)))];

  const [rows, legacy] = await Promise.all([
    prisma.pulseFindingState.findMany({ where: { workspaceId, targetKey: { in: keys } } }),
    // Tasks made with the older per-check "+ Task" button carry the check key in their
    // metadata but have no state row; they count as sent to the board.
    clientIds.length
      ? prisma.task.findMany({
        where: { clientId: { in: clientIds }, archivedAt: null, metadata: { path: ["source"], equals: "pulse_scan" } },
        select: { id: true, clientId: true, metadata: true },
      })
      : Promise.resolve([]),
  ]);

  const legacyByClient = new Map<string, Map<string, string>>();
  for (const t of legacy) {
    const ck = (t.metadata as Record<string, unknown> | null)?.["pulseCheckKey"];
    if (typeof ck !== "string" || !t.clientId) continue;
    const m = legacyByClient.get(t.clientId) ?? new Map<string, string>();
    if (!m.has(ck)) m.set(ck, t.id);
    legacyByClient.set(t.clientId, m);
  }

  const deciderIds = [...new Set(rows.map((r) => r.decidedById).filter((x): x is string => Boolean(x)))];
  const deciders = deciderIds.length
    ? await prisma.user.findMany({ where: { id: { in: deciderIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(deciders.map((u) => [u.id, u.name ?? u.email ?? null]));

  // Did a scan of the same project pass the check after the decision? Then a failure now
  // is a new instance, and the decision reopens (src/lib/pulse-findings.ts staleDecision).
  // One read for every decision on every project being loaded.
  const decided = rows.filter((r) => r.decision && r.decidedAt);
  const passes = decided.length
    ? await prisma.pulseScanCheck.findMany({
      where: {
        checkKey: { in: [...new Set(decided.map((r) => r.checkKey))] },
        status: "PASS",
        scan: {
          workspaceId,
          status: "COMPLETED",
          createdAt: { gt: new Date(Math.min(...decided.map((r) => r.decidedAt!.getTime()))) },
        },
      },
      select: { checkKey: true, scan: { select: { createdAt: true, inputUrl: true, inputGithubRepo: true, projectName: true } } },
    })
    : [];
  const passedSince = (t: FindingTarget, r: { checkKey: string; decision: unknown; decidedAt: Date | null }): boolean => {
    if (!r.decision || !r.decidedAt) return false;
    const after = r.decidedAt.getTime();
    return passes.some((p) => p.checkKey === r.checkKey
      && p.scan.createdAt.getTime() > after
      && p.scan.createdAt.getTime() <= t.asOf.getTime()
      && targetKey(p.scan) === t.targetKey);
  };

  const statesOf = new Map<string, FindingState[]>();
  for (const t of targets) {
    if (statesOf.has(t.targetKey)) continue;
    const legacyByCheck = (t.clientId && legacyByClient.get(t.clientId)) || new Map<string, string>();
    const states: FindingState[] = rows.filter((r) => r.targetKey === t.targetKey).map((r) => ({
      checkKey: r.checkKey,
      decision: r.decision,
      note: r.note,
      taskId: r.taskId ?? legacyByCheck.get(r.checkKey) ?? null,
      decidedByName: r.decidedById ? nameOf.get(r.decidedById) ?? null : null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      fingerprint: r.decisionFingerprint ?? null,
      decisionStatus: r.decisionStatus ?? null,
      passedSinceDecision: passedSince(t, r),
    }));
    const seen = new Set(states.map((s) => s.checkKey));
    for (const [checkKey, taskId] of legacyByCheck) {
      if (!seen.has(checkKey)) states.push({ checkKey, decision: null, note: null, taskId, decidedByName: null, decidedAt: null });
    }
    statesOf.set(t.targetKey, states);
  }

  const taskIds = [...new Set([...statesOf.values()].flat().map((s) => s.taskId).filter((x): x is string => Boolean(x)))];
  const taskRows = taskIds.length
    ? await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, status: true, title: true, client: { select: { slug: true } }, assignees: { select: { name: true, email: true }, take: 1 } },
    })
    : [];
  const taskById = new Map<string, FindingTask>(taskRows.map((t) => [t.id, {
    id: t.id, status: t.status, title: t.title, assigneeName: t.assignees[0]?.name ?? t.assignees[0]?.email ?? null,
    clientSlug: t.client?.slug ?? null,
  }]));

  for (const [key, states] of statesOf) {
    // A task deleted from the board is not "on the board".
    for (const s of states) if (s.taskId && !taskById.has(s.taskId)) s.taskId = null;
    const ids = new Set(states.map((s) => s.taskId).filter(Boolean));
    out.set(key, { states, tasks: [...ids].map((id) => taskById.get(id as string)!) });
  }
  return out;
}

/** The decisions and tasks for the scan's project. */
export async function getFindingStates(scanId: string): Promise<FindingsResponse> {
  const { scan, key } = await loadScan(scanId);
  const found = (await loadFindingStates(scan.workspaceId, [{ targetKey: key, clientId: scan.clientId, asOf: scan.createdAt }])).get(key)!;
  return { targetKey: key, clientId: scan.clientId, states: found.states, tasks: found.tasks };
}

/**
 * Open findings for each project's newest completed scan, keyed by scan id. A fixed number
 * of queries for the whole list: the checks of every scan in one read, and the decisions
 * and tasks of every project in `loadFindingStates`.
 */
export async function countOpenFindingsForScans(scanIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (scanIds.length === 0) return out;
  const scans = await prisma.pulseScan.findMany({
    where: { id: { in: scanIds } },
    select: { id: true, workspaceId: true, clientId: true, createdAt: true, inputUrl: true, inputGithubRepo: true, projectName: true },
  });
  if (scans.length === 0) return out;
  // Only failing and warning checks can be open, so only those are read.
  const checks = await prisma.pulseScanCheck.findMany({
    where: { scanId: { in: scans.map((s) => s.id) }, status: { in: ["FAIL", "WARN"] } },
    select: { scanId: true, checkKey: true, status: true, detail: true, evidence: true },
  });
  const checksOf = new Map<string, { checkKey: string; status: string; detail: string | null; evidence: string | null }[]>();
  for (const c of checks) checksOf.set(c.scanId, [...(checksOf.get(c.scanId) ?? []), c]);

  const byWorkspace = new Map<string, typeof scans>();
  for (const s of scans) byWorkspace.set(s.workspaceId, [...(byWorkspace.get(s.workspaceId) ?? []), s]);
  for (const [workspaceId, list] of byWorkspace) {
    const found = await loadFindingStates(workspaceId, list.map((s) => ({ targetKey: targetKey(s), clientId: s.clientId, asOf: s.createdAt })));
    for (const s of list) {
      const f = found.get(targetKey(s));
      out.set(s.id, countOpenFindings(checksOf.get(s.id) ?? [], f?.states ?? [], f?.tasks ?? []));
    }
  }
  return out;
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
  const check = scan.checks.find((c) => c.checkKey === checkKey);
  if (!check) throw new FindingError("That check is not part of this scan.", 404);
  const data = {
    decision,
    note: decision ? note?.trim().slice(0, 1000) || null : null,
    // What the decision was made about, so it can reopen when that changes.
    decisionFingerprint: decision ? findingFingerprint(check) : null,
    decisionStatus: decision ? check.status : null,
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
