// One-time ClickUp → Foundry migration.
//
// Token-based, server-side, idempotent. Self-discovers the ClickUp hierarchy from
// just a personal token (CLICKUP_TOKEN): team → "Clients" space → folders (one per
// client) → lists → tasks (subtasks + custom fields + descriptions arrive inline on
// the Get-Tasks endpoint, so NO per-task fetches are needed → stays inside the rate
// limit and runs in ~1 pass).
//
// Mapping (confirmed with Dan, June 2026 — see docs/clickup-import-plan.md):
//   • folder            → WorkspaceClient (matched by normalized name + alias map)
//   • list              → FeatureBlock (undated; a Gantt bar only once dated by hand)
//   • "Milestones" list → Milestone records (single date markers; ALL imported)
//   • task              → Task   (ACTIVE only — done/complete/closed excluded)
//   • subtask           → Task.parentId (ONE level; deeper nesting flattened)
//   • urgent priority   → HIGH (folded); high→HIGH, normal→MEDIUM, low→LOW
//   • assignees         → multi-assignee, resolved via native assignees + the custom
//                         28-name "Assignee" label field, mapped through team-roster
//   • custom fields     → Task.metadata (display-only)
//   • assignments       → ClientAssignment derived where a dev holds ≥1 imported task
//
// Re-runnable: every write is keyed on clickupId (indexed, NOT unique — we find-then-
// write rather than upsert) so a second run reconciles instead of duplicating.
//
// Lists matching Support / Feedback / Course-request / {{Legacy}} are skipped (Care
// replaces support; legacy is dead). Retainer lists are NOT skipped (Dan: "import
// retainer logs") — the dry-run surfaces their counts so we can eyeball before a live
// run. ACTIVE is defined by STATUS, not ClickUp's `include_closed` flag: ClickUp's
// "complete" is a *custom* status (type !== "closed"), so include_closed=false would
// still return finished work. We fetch everything and filter by the status map.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { findRosterByName } from "@/server/team-roster";
import { TaskStatus, TaskPriority } from "@prisma/client";

// ── ClickUp REST shapes (only the fields we read) ───────────────────────────
interface CuTeam {
  id: string;
  name: string;
}
interface CuSpace {
  id: string;
  name: string;
}
interface CuList {
  id: string;
  name: string;
}
interface CuFolder {
  id: string;
  name: string;
  lists?: CuList[];
}
interface CuStatus {
  status?: string;
  type?: string;
}
interface CuAssignee {
  id?: number;
  username?: string;
  email?: string;
}
interface CuOption {
  id: string;
  name?: string;
  label?: string;
}
interface CuCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: { options?: CuOption[] };
  value?: unknown;
}
interface CuTask {
  id: string;
  name: string;
  text_content?: string;
  description?: string;
  markdown_description?: string;
  status?: CuStatus | null;
  priority?: { priority?: string | null } | null;
  assignees?: CuAssignee[];
  due_date?: string | null;
  start_date?: string | null;
  parent?: string | null;
  custom_fields?: CuCustomField[];
}

// ── Report shapes (returned to the admin route; the dry-run gate) ────────────
export type ListRole = "block" | "milestones" | "skipped";

export interface ListReport {
  name: string;
  clickupId: string;
  role: ListRole;
  /** Active (non-done) tasks that would import (top-level + subtasks combined). */
  activeTasks: number;
  /** Subset of activeTasks that are subtasks (one level). */
  subtasks: number;
  /** Tasks excluded because their status maps to DONE. */
  doneSkipped: number;
}

export interface ClientReport {
  folderId: string;
  folderName: string;
  matchedClient: { id: string; name: string; slug: string } | null;
  lists: ListReport[];
  blocks: number;
  milestones: number;
  milestonesDateless: number;
  tasks: number;
  subtasks: number;
  assignments: number;
}

export interface ImportReport {
  dryRun: boolean;
  workspace: string;
  spaceName: string | null;
  totals: {
    foldersSeen: number;
    clientsMatched: number;
    blocks: number;
    milestones: number;
    tasks: number;
    subtasks: number;
    assignments: number;
  };
  /** ClickUp folders we couldn't match to a WorkspaceClient (need an alias or rename). */
  unmatchedFolders: string[];
  /** Distinct assignee names from ClickUp that didn't resolve to a roster entry. */
  unmatchedAssignees: string[];
  /** Roster people referenced by tasks but with no Foundry User yet (run /api/dev/seed-team). */
  knownButMissingUsers: string[];
  clients: ClientReport[];
}

// ── Mapping config ──────────────────────────────────────────────────────────

/** Lists whose name matches any of these are skipped entirely. */
const SKIP_LIST_PATTERNS = [
  /support/i,
  /feedback/i,
  /course\s*request/i,
  /\blegacy\b/i,
  /\{\{.*\}\}/, // {{Legacy}}-style archival markers
];

const MILESTONE_LIST = /milestone/i;

/**
 * Normalized ClickUp folder name → WorkspaceClient slug. Only needed where the
 * folder name doesn't normalize-match the client name. Populated after the first
 * dry-run surfaces any unmatched folders. Empty = pure name matching.
 */
const FOLDER_ALIASES: Record<string, string> = {};

export function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a ClickUp status to one of our five. Returns null for done/complete/closed. */
export function mapStatus(status: CuStatus | null | undefined): TaskStatus | null {
  const type = (status?.type ?? "").toLowerCase();
  const name = (status?.status ?? "").toLowerCase().trim();
  // ClickUp's structural "closed"/"done" type, OR a custom status named like one.
  if (type === "closed" || type === "done") return null;
  if (/\b(done|complete|completed|closed|archived|cancel|cancelled|canceled|live|shipped|merged)\b/.test(name)) {
    return null;
  }
  if (/\b(review|qa|q\.a|testing|test|uat|staging|verify|verification)\b/.test(name)) return TaskStatus.IN_REVIEW;
  if (/\b(progress|doing|dev|development|wip|started|working|build|building)\b/.test(name)) return TaskStatus.DOING;
  if (/\b(blocked|on\s*hold|hold|waiting|paused)\b/.test(name)) return TaskStatus.DOING; // active, just stuck
  if (/\b(todo|to\s*do|ready|open|not\s*started|planned|scheduled|next)\b/.test(name)) return TaskStatus.TODO;
  if (/\b(backlog|idea|ideas|icebox|someday)\b/.test(name)) return TaskStatus.BACKLOG;
  // Unknown but not done → keep it as a live backlog item rather than drop it.
  return TaskStatus.BACKLOG;
}

export function mapPriority(priority: CuTask["priority"]): TaskPriority {
  const p = (priority?.priority ?? "").toLowerCase();
  if (p === "urgent" || p === "high") return TaskPriority.HIGH; // urgent folded into High
  if (p === "low") return TaskPriority.LOW;
  return TaskPriority.MEDIUM;
}

function parseCuDate(ms: string | null | undefined): Date | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
}

function cleanText(task: CuTask): string | null {
  const raw = task.markdown_description ?? task.text_content ?? task.description ?? "";
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Authenticated ClickUp GET with retry/backoff on 429 + 5xx. */
async function cu<T>(token: string, path: string): Promise<T> {
  const url = `https://api.clickup.com/api/v2${path}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: token, "Content-Type": "application/json" },
    });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`ClickUp ${res.status} on ${path}`);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClickUp ${res.status} on ${path}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
  throw lastErr ?? new Error(`ClickUp request failed: ${path}`);
}

/** Fetch every task in a list (paginated), including closed + subtasks + markdown. */
async function fetchAllTasks(token: string, listId: string): Promise<CuTask[]> {
  const out: CuTask[] = [];
  for (let page = 0; page < 50; page++) {
    const qs = `archived=false&include_closed=true&subtasks=true&include_markdown_description=true&page=${page}`;
    const data = await cu<{ tasks?: CuTask[]; last_page?: boolean }>(token, `/list/${listId}/task?${qs}`);
    const tasks = data.tasks ?? [];
    out.push(...tasks);
    if (data.last_page || tasks.length === 0) break;
  }
  return out;
}

// ── Live snapshot (for the audit — no DB writes) ─────────────────────────────
//
// Pulls the current ClickUp "Clients" tree into the same compact shape the committed
// snapshot (src/data/clickup-import.json) uses, so the audit can diff Portal against
// *live* ClickUp without a CSV re-export. Server-side fetch (reuses `cu`/`fetchAllTasks`)
// — no MCP, no per-task calls, carries assignee names.

export interface LiveSnapTask {
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
export interface LiveSnapList {
  clickupId: string;
  name: string;
  isMilestones: boolean;
  tasks: LiveSnapTask[];
}
export interface LiveSnapFolder {
  name: string;
  lists: LiveSnapList[];
}
export interface LiveSnapshot {
  generatedFrom: string;
  space: string;
  folders: LiveSnapFolder[];
}

/** Human-readable assignee names on a task: native usernames + the custom "Assignee"
 *  label field's option names (the 28-name list team-roster aliases match). */
function assigneeNamesOf(task: CuTask): string[] {
  const names = new Set<string>();
  for (const a of task.assignees ?? []) {
    if (a.username) names.add(a.username);
  }
  const field = (task.custom_fields ?? []).find(
    (f) => /assignee/i.test(f.name) && f.value != null && f.value !== "",
  );
  if (field) {
    const options = field.type_config?.options ?? [];
    const optionName = (id: string) => options.find((o) => o.id === id)?.name ?? options.find((o) => o.id === id)?.label;
    const items: unknown[] = Array.isArray(field.value) ? field.value : [field.value];
    for (const item of items) {
      if (typeof item === "string") {
        const n = optionName(item);
        if (n) names.add(n);
      } else if (item && typeof item === "object") {
        const obj = item as { id?: unknown; name?: unknown; username?: unknown };
        if (typeof obj.username === "string") names.add(obj.username);
        if (typeof obj.name === "string") names.add(obj.name);
        if (typeof obj.id === "string") {
          const n = optionName(obj.id);
          if (n) names.add(n);
        }
      }
    }
  }
  return [...names];
}

export async function fetchLiveSnapshot(): Promise<LiveSnapshot> {
  const token = process.env.CLICKUP_TOKEN;
  if (!token) throw new Error("CLICKUP_TOKEN is not set");

  const { teams } = await cu<{ teams: CuTeam[] }>(token, "/team");
  if (!teams?.length) throw new Error("ClickUp: no teams visible to this token");
  const teamId = teams[0].id;

  const { spaces } = await cu<{ spaces: CuSpace[] }>(token, `/team/${teamId}/space?archived=false`);
  const clientSpace = spaces.find((s) => /client/i.test(s.name)) ?? spaces[0];
  if (!clientSpace) throw new Error("ClickUp: no spaces found");

  const { folders } = await cu<{ folders: CuFolder[] }>(
    token,
    `/space/${clientSpace.id}/folder?archived=false`,
  );

  const out: LiveSnapFolder[] = [];
  for (const folder of folders) {
    const lists: LiveSnapList[] = [];
    for (const list of folder.lists ?? []) {
      const tasks = await fetchAllTasks(token, list.id);
      lists.push({
        clickupId: list.id,
        name: list.name,
        isMilestones: MILESTONE_LIST.test(list.name),
        tasks: tasks.map((t) => ({
          clickupId: t.id,
          name: t.name,
          description: cleanText(t),
          status: t.status?.status ?? null,
          priority: t.priority?.priority ?? null,
          dueMs: t.due_date ? Number(t.due_date) : null,
          startMs: t.start_date ? Number(t.start_date) : null,
          parentClickupId: t.parent ?? null,
          assigneeNames: assigneeNamesOf(t),
        })),
      });
    }
    out.push({ name: folder.name, lists });
  }

  return { generatedFrom: `live:${clientSpace.name}`, space: clientSpace.name, folders: out };
}

// ── Resolution context ──────────────────────────────────────────────────────
interface Ctx {
  workspaceId: string;
  dryRun: boolean;
  emailToUserId: Map<string, string>;
  unmatchedAssignees: Set<string>;
  knownButMissingUsers: Set<string>;
}

/** Resolve a task's assignees (native + custom "Assignee" field) to Foundry user ids. */
function resolveAssigneeIds(task: CuTask, ctx: Ctx): string[] {
  const emails: string[] = [];
  const names: string[] = [];

  for (const a of task.assignees ?? []) {
    if (a.email) emails.push(a.email);
    if (a.username) names.push(a.username);
  }

  const field = (task.custom_fields ?? []).find(
    (f) => /assignee/i.test(f.name) && f.value != null && f.value !== "",
  );
  if (field) {
    const options = field.type_config?.options ?? [];
    const optionName = (id: string): string | undefined => {
      const o = options.find((opt) => opt.id === id);
      return o?.name ?? o?.label;
    };
    const v = field.value;
    const items: unknown[] = Array.isArray(v) ? v : [v];
    for (const item of items) {
      if (typeof item === "string") {
        const n = optionName(item);
        if (n) names.push(n);
      } else if (item && typeof item === "object") {
        const obj = item as { id?: unknown; email?: unknown; username?: unknown; name?: unknown };
        if (typeof obj.email === "string") emails.push(obj.email);
        if (typeof obj.username === "string") names.push(obj.username);
        if (typeof obj.name === "string") names.push(obj.name);
        // Labels can come through as {id} only — resolve via the option table.
        if (typeof obj.id === "string") {
          const n = optionName(obj.id);
          if (n) names.push(n);
        }
      }
    }
  }

  const ids = new Set<string>();

  for (const email of emails) {
    const id = ctx.emailToUserId.get(email.toLowerCase());
    if (id) ids.add(id);
  }
  for (const name of names) {
    const entry = findRosterByName(name);
    if (!entry) {
      ctx.unmatchedAssignees.add(name.trim());
      continue;
    }
    const id = ctx.emailToUserId.get(entry.email.toLowerCase());
    if (id) ids.add(id);
    else ctx.knownButMissingUsers.add(entry.email);
  }

  return [...ids];
}

// ── Writers (find-then-write, keyed on clickupId; no-op in dry-run) ──────────

async function upsertFeatureBlock(
  ctx: Ctx,
  clientId: string,
  list: CuList,
  orderKey: number,
): Promise<string | null> {
  if (ctx.dryRun) return null;
  const existing = await prisma.featureBlock.findFirst({
    where: { clientId, clickupId: list.id },
    select: { id: true },
  });
  if (existing) {
    await prisma.featureBlock.update({ where: { id: existing.id }, data: { name: list.name } });
    return existing.id;
  }
  const created = await prisma.featureBlock.create({
    data: {
      workspaceId: ctx.workspaceId,
      clientId,
      name: list.name,
      orderKey,
      clickupId: list.id,
    },
    select: { id: true },
  });
  return created.id;
}

async function upsertMilestone(ctx: Ctx, clientId: string, task: CuTask, date: Date): Promise<void> {
  if (ctx.dryRun) return;
  const existing = await prisma.milestone.findFirst({
    where: { clientId, clickupId: task.id },
    select: { id: true },
  });
  const data = { name: task.name || "Milestone", date };
  if (existing) {
    await prisma.milestone.update({ where: { id: existing.id }, data });
  } else {
    await prisma.milestone.create({
      data: { workspaceId: ctx.workspaceId, clientId, clickupId: task.id, ...data },
    });
  }
}

interface TaskWrite {
  clientId: string;
  featureBlockId: string | null;
  task: CuTask;
  status: TaskStatus;
  assigneeIds: string[];
  parentId: string | null;
}

/** Upsert a Task by clickupId. Returns the Foundry task id (null in dry-run). */
async function upsertTask(ctx: Ctx, w: TaskWrite): Promise<string | null> {
  const metadataObj = buildMetadata(w.task);
  const base = {
    title: w.task.name || "(untitled)",
    description: cleanText(w.task),
    status: w.status,
    priority: mapPriority(w.task.priority),
    dueDate: parseCuDate(w.task.due_date),
    featureBlockId: w.featureBlockId,
    parentId: w.parentId,
    metadata: metadataObj ? (metadataObj as Prisma.InputJsonValue) : Prisma.JsonNull,
  };

  if (ctx.dryRun) return null;

  const existing = await prisma.task.findFirst({
    where: { workspaceId: ctx.workspaceId, clickupId: w.task.id },
    select: { id: true },
  });

  if (existing) {
    await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...base,
        clientId: w.clientId,
        assignees: { set: w.assigneeIds.map((id) => ({ id })) },
        assigneeId: w.assigneeIds[0] ?? null,
      },
    });
    return existing.id;
  }

  const created = await prisma.task.create({
    data: {
      workspaceId: ctx.workspaceId,
      clientId: w.clientId,
      clickupId: w.task.id,
      ...base,
      assignees: { connect: w.assigneeIds.map((id) => ({ id })) },
      assigneeId: w.assigneeIds[0] ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

/** Collect non-assignee custom fields (with a value) into a display-only metadata object. */
function buildMetadata(task: CuTask): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const f of task.custom_fields ?? []) {
    if (/assignee/i.test(f.name)) continue;
    if (f.value == null || f.value === "") continue;
    const options = f.type_config?.options ?? [];
    let value: unknown = f.value;
    // Resolve dropdown/label option ids to their human labels.
    if (options.length) {
      const label = (id: string) => options.find((o) => o.id === id)?.name ?? options.find((o) => o.id === id)?.label;
      if (typeof f.value === "string") value = label(f.value) ?? f.value;
      else if (Array.isArray(f.value)) {
        value = f.value.map((v) => (typeof v === "string" ? label(v) ?? v : v));
      }
    }
    out[f.name] = value;
  }
  out["_clickup"] = {
    taskId: task.id,
    status: task.status?.status ?? null,
    priority: task.priority?.priority ?? null,
  };
  return Object.keys(out).length ? out : null;
}

async function upsertAssignment(ctx: Ctx, clientId: string, userId: string): Promise<void> {
  if (ctx.dryRun) return;
  await prisma.clientAssignment.upsert({
    where: { clientId_userId: { clientId, userId } },
    update: {},
    create: { workspaceId: ctx.workspaceId, clientId, userId },
  });
}

// ── Main entry ──────────────────────────────────────────────────────────────

export interface RunOptions {
  /** When true (default), reads everything and reports counts but writes nothing. */
  dryRun?: boolean;
  /** Limit the run to a single WorkspaceClient (by slug) — useful for piloting. */
  clientSlug?: string;
}

export async function runClickupImport(opts: RunOptions = {}): Promise<ImportReport> {
  const dryRun = opts.dryRun !== false; // default ON
  const token = process.env.CLICKUP_TOKEN;
  if (!token) throw new Error("CLICKUP_TOKEN is not set");

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });

  // Index existing clients (by normalized name) + users (by email).
  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true, slug: true },
  });
  const clientByName = new Map<string, (typeof clients)[number]>();
  const clientBySlug = new Map<string, (typeof clients)[number]>();
  for (const c of clients) {
    clientByName.set(normalize(c.name), c);
    clientBySlug.set(c.slug, c);
  }

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const emailToUserId = new Map<string, string>();
  for (const u of users) emailToUserId.set(u.email.toLowerCase(), u.id);

  const ctx: Ctx = {
    workspaceId: workspace.id,
    dryRun,
    emailToUserId,
    unmatchedAssignees: new Set(),
    knownButMissingUsers: new Set(),
  };

  // Discover the ClickUp hierarchy from the token.
  const { teams } = await cu<{ teams: CuTeam[] }>(token, "/team");
  if (!teams?.length) throw new Error("ClickUp: no teams visible to this token");
  const teamId = teams[0].id;

  const { spaces } = await cu<{ spaces: CuSpace[] }>(token, `/team/${teamId}/space?archived=false`);
  const clientSpace = spaces.find((s) => /client/i.test(s.name)) ?? spaces[0];
  if (!clientSpace) throw new Error("ClickUp: no spaces found");

  const { folders } = await cu<{ folders: CuFolder[] }>(
    token,
    `/space/${clientSpace.id}/folder?archived=false`,
  );

  const report: ImportReport = {
    dryRun,
    workspace: DEFAULT_WORKSPACE_SLUG,
    spaceName: clientSpace.name,
    totals: { foldersSeen: 0, clientsMatched: 0, blocks: 0, milestones: 0, tasks: 0, subtasks: 0, assignments: 0 },
    unmatchedFolders: [],
    unmatchedAssignees: [],
    knownButMissingUsers: [],
    clients: [],
  };

  for (const folder of folders) {
    report.totals.foldersSeen++;

    // Match folder → client (alias first, then normalized name).
    const aliasSlug = FOLDER_ALIASES[normalize(folder.name)];
    const matched = aliasSlug ? clientBySlug.get(aliasSlug) : clientByName.get(normalize(folder.name));

    if (!matched) {
      report.unmatchedFolders.push(folder.name);
      continue;
    }
    // Piloting: skip everything but the requested client.
    if (opts.clientSlug && matched.slug !== opts.clientSlug) continue;

    report.totals.clientsMatched++;
    const cReport: ClientReport = {
      folderId: folder.id,
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

    const assignmentPairs = new Set<string>(); // userId (per this client)
    const lists = folder.lists ?? [];

    for (let li = 0; li < lists.length; li++) {
      const list = lists[li];
      const lReport: ListReport = {
        name: list.name,
        clickupId: list.id,
        role: "block",
        activeTasks: 0,
        subtasks: 0,
        doneSkipped: 0,
      };

      // Classify.
      if (SKIP_LIST_PATTERNS.some((re) => re.test(list.name))) {
        lReport.role = "skipped";
        cReport.lists.push(lReport);
        continue;
      }
      const isMilestones = MILESTONE_LIST.test(list.name);
      lReport.role = isMilestones ? "milestones" : "block";

      const tasks = await fetchAllTasks(token, list.id);

      if (isMilestones) {
        for (const t of tasks) {
          const date = parseCuDate(t.due_date) ?? parseCuDate(t.start_date);
          if (!date) {
            cReport.milestonesDateless++;
            continue;
          }
          await upsertMilestone(ctx, matched.id, t, date);
          cReport.milestones++;
          lReport.activeTasks++;
        }
        cReport.lists.push(lReport);
        continue;
      }

      // Block list → FeatureBlock + its active tasks.
      const blockId = await upsertFeatureBlock(ctx, matched.id, list, li);
      cReport.blocks++;

      // Active tasks only; split top-level vs subtasks (one level).
      const active = tasks
        .map((t) => ({ t, status: mapStatus(t.status) }))
        .filter((x): x is { t: CuTask; status: TaskStatus } => {
          if (x.status === null) {
            lReport.doneSkipped++;
            return false;
          }
          return true;
        });

      const topLevel = active.filter((x) => !x.t.parent);
      const children = active.filter((x) => !!x.t.parent);

      // Pass 1: top-level tasks → record clickupId → foundry id.
      const idByCuId = new Map<string, string | null>();
      for (const { t, status } of topLevel) {
        const assigneeIds = resolveAssigneeIds(t, ctx);
        const fid = await upsertTask(ctx, {
          clientId: matched.id,
          featureBlockId: blockId,
          task: t,
          status,
          assigneeIds,
          parentId: null,
        });
        idByCuId.set(t.id, fid);
        cReport.tasks++;
        lReport.activeTasks++;
        for (const uid of assigneeIds) assignmentPairs.add(uid);
      }

      // Pass 2: subtasks → parentId when the parent imported here; else promote to top-level.
      for (const { t, status } of children) {
        const parentFid = t.parent ? idByCuId.get(t.parent) ?? null : null;
        const assigneeIds = resolveAssigneeIds(t, ctx);
        await upsertTask(ctx, {
          clientId: matched.id,
          featureBlockId: blockId,
          task: t,
          status,
          assigneeIds,
          parentId: parentFid, // null in dry-run, or when parent excluded → becomes top-level
        });
        cReport.tasks++;
        if (parentFid) {
          cReport.subtasks++;
          lReport.subtasks++;
        }
        lReport.activeTasks++;
        for (const uid of assigneeIds) assignmentPairs.add(uid);
      }

      cReport.lists.push(lReport);
    }

    // Derive client assignments from who holds tasks here.
    for (const uid of assignmentPairs) {
      await upsertAssignment(ctx, matched.id, uid);
      cReport.assignments++;
    }

    report.clients.push(cReport);
    report.totals.blocks += cReport.blocks;
    report.totals.milestones += cReport.milestones;
    report.totals.tasks += cReport.tasks;
    report.totals.subtasks += cReport.subtasks;
    report.totals.assignments += cReport.assignments;
  }

  report.unmatchedAssignees = [...ctx.unmatchedAssignees].sort();
  report.knownButMissingUsers = [...ctx.knownButMissingUsers].sort();
  return report;
}
