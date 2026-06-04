// One-shot, admin-driven task cleanse for migrated client boards.
//
// The ClickUp CSV import landed tasks UNASSIGNED and (for undated lists) without
// dates. This module applies a small, explicit, versioned set of cleanse
// operations to ONE client's tasks — assigning owners by title/section, setting
// due dates, fixing statuses, optionally purging junk — authored from the
// screenshots Dan provides.
//
// ALWAYS dry-run first (the route defaults to it): the dry-run returns a full
// per-task diff (current → proposed) + a structure dump (so the exact block names
// are visible) + match counts + any unresolved assignees / no-op rules, and writes
// NOTHING. Re-run with { dryRun: false } to apply. Idempotent — safe to re-run.

import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { findRosterByName } from "@/server/team-roster";

// ── Op model ─────────────────────────────────────────────────────────────────

export type CleanseOp = {
  /** Match tasks whose title contains this (case-insensitive). */
  match?: string;
  /** Match every task in this section/feature-block (name compared loosely — a
   *  leading "P1. " phase prefix and "&"/"and" differences are ignored). */
  block?: string;
  /** Assign to this person (roster name or alias). Replaces existing assignees. */
  assignTo?: string;
  /** Set the due date — "YYYY-MM-DD". */
  dueDate?: string;
  /** Set the status. */
  status?: TaskStatus;
  /** Purge: delete matching tasks (and their subtasks). */
  delete?: boolean;
};

export type CleanseOptions = {
  clientSlug: string;
  ops: CleanseOp[];
  dryRun?: boolean;
  /** After applying task dates, persist each block's span (min/max of its tasks'
   *  due dates) so sections render as Gantt bars. Default true. */
  setBlockSpans?: boolean;
  /** Grant assigned devs ClientAssignment access so the tasks show on their
   *  boards / My Day. Default true. */
  grantAccess?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Loose block-name key: drop a leading "P1. " phase prefix, normalise "&"→"and". */
function blockKey(s: string): string {
  return norm(s).replace(/^p\d+\.\s*/, "").replace(/&/g, "and").replace(/\s+/g, " ").trim();
}

function ymd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function parseYmd(s: string): Date {
  // Anchor at midday UTC so the date can't slip across a timezone boundary.
  return new Date(`${s}T12:00:00.000Z`);
}

// ── Report shapes ────────────────────────────────────────────────────────────

type TaskChange = {
  ref: string;
  title: string;
  block: string | null;
  assignee?: { from: string; to: string };
  dueDate?: { from: string | null; to: string };
  status?: { from: TaskStatus; to: TaskStatus };
  delete?: true;
};

export type CleanseReport = {
  dryRun: boolean;
  client: { name: string; slug: string };
  applied: boolean;
  counts: { tasks: number; assigned: number; dated: number; restatused: number; deleted: number };
  changes: TaskChange[];
  blockSpans: { name: string; start: string | null; end: string | null }[];
  accessGranted: string[];
  unresolvedAssignees: string[];
  rulesMatchedNothing: string[];
  structure: { block: string; tasks: { ref: string; title: string; due: string | null; status: TaskStatus; assignees: string }[] }[];
};

function ref(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

// ── Runner ───────────────────────────────────────────────────────────────────

export async function runTaskCleanse(opts: CleanseOptions): Promise<CleanseReport> {
  const dryRun = opts.dryRun !== false;
  const setBlockSpans = opts.setBlockSpans !== false;
  const grantAccess = opts.grantAccess !== false;

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  const wsId = workspace.id;

  const client = await prisma.workspaceClient.findFirst({
    where: { workspaceId: wsId, slug: opts.clientSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!client) throw new Error(`Client not found for slug "${opts.clientSlug}"`);

  // ── Resolve assignee names → user ids (roster email first, then name fallback)
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: wsId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const byEmail = new Map<string, { id: string; name: string }>();
  const byName = new Map<string, { id: string; name: string }>();
  for (const m of members) {
    if (!m.user) continue;
    const u = { id: m.user.id, name: m.user.name ?? m.user.email };
    byEmail.set(norm(m.user.email), u);
    byName.set(norm(u.name), u);
  }
  const userCache = new Map<string, { id: string; name: string } | null>();
  const unresolved = new Set<string>();
  function resolveUser(name: string): { id: string; name: string } | null {
    const key = norm(name);
    if (userCache.has(key)) return userCache.get(key)!;
    let hit: { id: string; name: string } | null = null;
    const entry = findRosterByName(name);
    if (entry) hit = byEmail.get(norm(entry.email)) ?? null;
    if (!hit) hit = byName.get(key) ?? null;
    if (!hit) unresolved.add(name);
    userCache.set(key, hit);
    return hit;
  }

  // ── Load the client's tasks
  const tasks = await prisma.task.findMany({
    where: { workspaceId: wsId, clientId: client.id },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      featureBlock: { select: { id: true, name: true } },
      assignees: { select: { id: true, name: true } },
    },
    orderBy: { orderKey: "asc" },
  });

  // ── Compute proposed changes (apply every matching op in order; later wins)
  const rulesHit = new Array(opts.ops.length).fill(0);
  type Proposed = { assignee?: { id: string; name: string }; dueDate?: string; status?: TaskStatus; delete?: boolean };
  const proposals = new Map<string, Proposed>();

  for (const t of tasks) {
    const titleN = norm(t.title);
    const bKey = t.featureBlock ? blockKey(t.featureBlock.name) : null;
    const prop: Proposed = {};
    let touched = false;
    opts.ops.forEach((op, i) => {
      if (op.match && !titleN.includes(norm(op.match))) return;
      if (op.block && bKey !== blockKey(op.block)) return;
      if (!op.match && !op.block) return; // a matcher is required
      rulesHit[i]++;
      touched = true;
      if (op.delete) prop.delete = true;
      if (op.assignTo) {
        const u = resolveUser(op.assignTo);
        if (u) prop.assignee = u;
      }
      if (op.dueDate) prop.dueDate = op.dueDate;
      if (op.status) prop.status = op.status;
    });
    if (touched) proposals.set(t.id, prop);
  }

  // ── Build the diff
  const changes: TaskChange[] = [];
  const counts = { tasks: tasks.length, assigned: 0, dated: 0, restatused: 0, deleted: 0 };
  for (const t of tasks) {
    const p = proposals.get(t.id);
    if (!p) continue;
    const change: TaskChange = { ref: ref(t.id), title: t.title, block: t.featureBlock?.name ?? null };
    let real = false;
    if (p.delete) {
      change.delete = true;
      counts.deleted++;
      changes.push(change);
      continue;
    }
    if (p.assignee) {
      const current = t.assignees.map((a) => a.name).join(", ") || "—";
      if (t.assignees.length !== 1 || t.assignees[0]?.id !== p.assignee.id) {
        change.assignee = { from: current, to: p.assignee.name };
        counts.assigned++;
        real = true;
      }
    }
    if (p.dueDate) {
      const from = ymd(t.dueDate);
      if (from !== p.dueDate) {
        change.dueDate = { from, to: p.dueDate };
        counts.dated++;
        real = true;
      }
    }
    if (p.status && p.status !== t.status) {
      change.status = { from: t.status, to: p.status };
      counts.restatused++;
      real = true;
    }
    if (real) changes.push(change);
  }

  // ── Compute block spans from the PROPOSED due dates (so sections get a bar)
  const blocks = await prisma.featureBlock.findMany({
    where: { workspaceId: wsId, clientId: client.id },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  const blockSpan = new Map<string, { start: Date | null; end: Date | null }>();
  if (setBlockSpans) {
    for (const b of blocks) {
      const dues = tasks
        .filter((t) => t.featureBlock?.id === b.id)
        .map((t) => {
          const p = proposals.get(t.id);
          const d = p?.delete ? null : p?.dueDate ? parseYmd(p.dueDate) : t.dueDate;
          return d;
        })
        .filter((d): d is Date => d != null)
        .sort((a, z) => a.getTime() - z.getTime());
      blockSpan.set(b.id, { start: dues[0] ?? null, end: dues[dues.length - 1] ?? null });
    }
  }
  const blockSpans = blocks
    .map((b) => ({ name: b.name, ...(blockSpan.get(b.id) ?? { start: b.startDate, end: b.endDate }) }))
    .map((b) => ({ name: b.name, start: ymd(b.start), end: ymd(b.end) }));

  // ── Structure dump (so the real block names + state are visible in dry-run)
  const structure = blocks.map((b) => ({
    block: b.name,
    tasks: tasks
      .filter((t) => t.featureBlock?.id === b.id)
      .map((t) => ({
        ref: ref(t.id),
        title: t.title,
        due: ymd(t.dueDate),
        status: t.status,
        assignees: t.assignees.map((a) => a.name).join(", ") || "—",
      })),
  }));
  const looseTasks = tasks.filter((t) => !t.featureBlock);
  if (looseTasks.length) {
    structure.push({
      block: "(no section)",
      tasks: looseTasks.map((t) => ({
        ref: ref(t.id),
        title: t.title,
        due: ymd(t.dueDate),
        status: t.status,
        assignees: t.assignees.map((a) => a.name).join(", ") || "—",
      })),
    });
  }

  const rulesMatchedNothing = opts.ops
    .map((op, i) => ({ op, hit: rulesHit[i] }))
    .filter((x) => x.hit === 0)
    .map((x) => x.op.block ? `block:"${x.op.block}"` : `match:"${x.op.match}"`);

  // Assigned devs → access list
  const assignedUserIds = new Set<string>();
  for (const p of proposals.values()) if (!p.delete && p.assignee) assignedUserIds.add(p.assignee.id);
  const idToName = new Map(members.filter((m) => m.user).map((m) => [m.user!.id, m.user!.name]));
  const accessGranted = grantAccess ? Array.from(assignedUserIds).map((id) => idToName.get(id) ?? id) : [];

  const report: CleanseReport = {
    dryRun,
    client: { name: client.name, slug: client.slug },
    applied: false,
    counts,
    changes,
    blockSpans,
    accessGranted,
    unresolvedAssignees: Array.from(unresolved),
    rulesMatchedNothing,
    structure,
  };

  if (dryRun) return report;

  // ── APPLY ──────────────────────────────────────────────────────────────────
  for (const t of tasks) {
    const p = proposals.get(t.id);
    if (!p) continue;
    if (p.delete) {
      // Remove subtasks first to avoid orphaning the self-relation.
      await prisma.task.deleteMany({ where: { parentId: t.id } });
      await prisma.task.delete({ where: { id: t.id } });
      continue;
    }
    const data: Prisma.TaskUpdateInput = {};
    if (p.assignee && (t.assignees.length !== 1 || t.assignees[0]?.id !== p.assignee.id)) {
      data.assignees = { set: [{ id: p.assignee.id }] };
      data.assignee = { disconnect: true };
    }
    if (p.dueDate && ymd(t.dueDate) !== p.dueDate) data.dueDate = parseYmd(p.dueDate);
    if (p.status && p.status !== t.status) data.status = p.status;
    if (Object.keys(data).length) await prisma.task.update({ where: { id: t.id }, data });
  }

  if (setBlockSpans) {
    for (const b of blocks) {
      const span = blockSpan.get(b.id);
      if (!span) continue;
      await prisma.featureBlock.update({
        where: { id: b.id },
        data: { startDate: span.start, endDate: span.end },
      });
    }
  }

  if (grantAccess) {
    for (const userId of assignedUserIds) {
      await prisma.clientAssignment.upsert({
        where: { clientId_userId: { clientId: client.id, userId } },
        create: { workspaceId: wsId, clientId: client.id, userId },
        update: {},
      });
    }
  }

  report.applied = true;
  return report;
}

// ── Versioned presets (authored from Dan's screenshots) ──────────────────────

export const CLEANSE_PRESETS: Record<string, { clientSlug: string; ops: CleanseOp[] }> = {
  // Speakify — pass 1: owners + due dates.
  //  • Backend  → Muhammad Usman   • Frontend → Kashan Fayyaz
  //  • Section due dates from the Gantt screenshots (one date per section, with
  //    a few per-task exceptions). Block names are matched loosely; any that miss
  //    surface in `rulesMatchedNothing` on the dry-run.
  speakify: {
    clientSlug: "speakify",
    ops: [
      // 1) Section due dates (every task in the section)
      { block: "Architecture & Auth", dueDate: "2026-03-27" },
      { block: "Profiles & Catalogue", dueDate: "2026-04-24" },
      { block: "Buyer Onboarding", dueDate: "2026-04-17" },
      { block: "Speaker Onboarding", dueDate: "2026-04-03" },
      { block: "Speaker Onboarding Continued", dueDate: "2026-04-10" },
      { block: "Events & Applications", dueDate: "2026-05-01" },
      { block: "AI Matching & Recommendations", dueDate: "2026-05-08" },
      { block: "Booking & Contracts", dueDate: "2026-05-15" },
      { block: "Payments & Notifications", dueDate: "2026-05-22" },
      { block: "Admin, QA & CI/CD", dueDate: "2026-06-05" },
      { block: "Polish & Launch", dueDate: "2026-06-12" },
      // 2) Owner by discipline
      { match: "backend", assignTo: "Muhammad Usman" },
      { match: "frontend", assignTo: "Kashan Fayyaz" },
      // 3) Non-Backend/Frontend owners (+ a couple of date exceptions)
      { match: "setup repositories", assignTo: "Muhammad Usman" },
      { match: "setup web application", assignTo: "Muhammad Usman" },
      { match: "infra", assignTo: "Muhammad Usman" },
      { match: "landing page", assignTo: "Kashan Fayyaz", dueDate: "2026-04-13" },
      { match: "home screen", assignTo: "Kashan Fayyaz" },
      { match: "reusable components", assignTo: "Kashan Fayyaz" },
      { match: "create event flow", assignTo: "Kashan Fayyaz" },
      { match: "multi-currency pricing", assignTo: "Muhammad Usman", dueDate: "2026-05-27" },
      { match: "regional pricing", assignTo: "Muhammad Usman" },
      { match: "admin panel decision", assignTo: "Kashan Fayyaz" },
      // 4) Per-task date exceptions
      { match: "multi-currency support", dueDate: "2026-05-11" },
      { match: "transaction management", dueDate: "2026-05-27" },
    ],
  },
};
