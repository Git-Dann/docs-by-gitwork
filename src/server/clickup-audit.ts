// ClickUp ↔ Portal audit — READ-ONLY drift report.
//
// Compares the committed ClickUp snapshot (src/data/clickup-import.json, refreshed from
// live ClickUp) against the live Portal task DB, per client, and reports where they've
// drifted since the migration. It writes NOTHING — it's the "what needs a human's eye on
// Monday" report, not a reconciler.
//
// Join key: Task.clickupId (indexed) ↔ each snapshot task's clickupId. Status/priority are
// compared like-for-like by running the SAME mappers the importer uses (mapStatus /
// mapPriority), so an audit never flags a difference that's purely a mapping artefact.
//
// Caveats surfaced in the report:
//   • The snapshot is active-only (done/closed ClickUp tasks are excluded upstream), so a
//     Portal task whose clickupId is absent from the snapshot reads as "stale" (its source
//     was completed or deleted in ClickUp) — a close/archive candidate.
//   • Assignee drift is only meaningful when the snapshot carries assignee names (the
//     token/MCP pull does; the older CSV export did not).

import { TaskStatus, TaskPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { mapStatus, mapPriority, normalize, fetchLiveSnapshot } from "@/server/clickup-import";
import { findRosterByName } from "@/server/team-roster";
import { getSlackBotToken, postMessage } from "@/server/slack/client";
import { resolveRollupChannel } from "@/server/tasks-standup";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/types/tasks";
import datasetJson from "@/data/clickup-import.json";

// ── Snapshot shape (produced by scripts/parse-clickup-csv.mjs / the MCP refresh) ──
interface SnapTask {
  clickupId: string;
  name: string;
  status: string | null;
  priority: string | null;
  parentClickupId: string | null;
  assigneeNames: string[];
}
interface SnapList {
  clickupId: string;
  name: string;
  isMilestones: boolean;
  tasks: SnapTask[];
}
interface SnapFolder {
  name: string;
  lists: SnapList[];
}
interface Snapshot {
  generatedFrom: string;
  space: string;
  folders: SnapFolder[];
}

const dataset = datasetJson as unknown as Snapshot;

/** Normalized ClickUp folder name → WorkspaceClient slug (mirrors clickup-csv-import). */
const FOLDER_ALIASES: Record<string, string> = {
  "big wedge": "wedge",
};

// ── Report shapes ────────────────────────────────────────────────────────────
export interface AuditTaskRef {
  clickupId: string;
  title: string;
}
export interface StatusMismatch extends AuditTaskRef {
  clickup: TaskStatus;
  portal: TaskStatus;
}
export interface PriorityMismatch extends AuditTaskRef {
  clickup: TaskPriority;
  portal: TaskPriority;
}
export interface AssigneeMismatch extends AuditTaskRef {
  clickup: string[];
  portal: string[];
}

export interface ClientAudit {
  clientId: string;
  clientName: string;
  clientSlug: string;
  folderName: string;
  /** Active (non-done) ClickUp tasks in this folder's block lists. */
  clickupActive: number;
  /** Portal tasks in this client carrying a clickupId. */
  portalLinked: number;
  /** In ClickUp (active) but absent from Portal → import/create candidates. */
  missingInPortal: AuditTaskRef[];
  /** In Portal (clickupId) but no longer active in ClickUp → close/archive candidates. */
  staleInPortal: AuditTaskRef[];
  statusMismatches: StatusMismatch[];
  priorityMismatches: PriorityMismatch[];
  assigneeMismatches: AssigneeMismatch[];
  /** Linked tasks that agree on status (a quick "how aligned" signal). */
  inSync: number;
  /** Sum of all drift buckets — the client's audit workload. */
  driftCount: number;
}

export interface ClickupAuditReport {
  generatedFrom: string;
  workspace: string;
  /** ClickUp folders with no matching WorkspaceClient (need an alias or a rename). */
  unmatchedFolders: string[];
  totals: {
    clients: number;
    clickupActive: number;
    portalLinked: number;
    missingInPortal: number;
    staleInPortal: number;
    statusMismatches: number;
    priorityMismatches: number;
    assigneeMismatches: number;
  };
  clients: ClientAudit[];
  /** True when the snapshot carries assignee names (so assignee drift is meaningful). */
  hasAssignees: boolean;
  /** The human-readable written report (Slack/markdown). */
  markdown: string;
}

const SAMPLE_CAP = 12; // examples kept per drift bucket; full counts are always exact.

export interface AuditOptions {
  /** Limit the audit to a single client (by slug). */
  clientSlug?: string;
  /**
   * Where the "ClickUp truth" comes from:
   *   • "snapshot" (default) — the committed src/data/clickup-import.json (point-in-time).
   *   • "live" — pull current ClickUp server-side via CLICKUP_TOKEN (current + assignees).
   */
  source?: "snapshot" | "live";
}

function resolveNamesToEmails(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const entry = findRosterByName(n);
    if (entry) out.add(entry.email.toLowerCase());
  }
  return [...out].sort();
}

export async function runClickupAudit(opts: AuditOptions = {}): Promise<ClickupAuditReport> {
  // The ClickUp side: committed snapshot (default) or a live server-side pull.
  const snap: Snapshot = opts.source === "live" ? await fetchLiveSnapshot() : dataset;

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  const wsId = workspace.id;

  // Client lookup — same matching breadth as the CSV importer.
  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: wsId },
    select: { id: true, name: true, slug: true },
  });
  const byName = new Map<string, (typeof clients)[number]>();
  const bySlug = new Map<string, (typeof clients)[number]>();
  const byCompact = new Map<string, (typeof clients)[number]>();
  for (const c of clients) {
    byName.set(normalize(c.name), c);
    bySlug.set(c.slug, c);
    byCompact.set(normalize(c.name).replace(/\s+/g, ""), c);
  }
  const matchFolder = (folderName: string) => {
    const nf = normalize(folderName);
    const aliasSlug = FOLDER_ALIASES[nf];
    return (
      (aliasSlug ? bySlug.get(aliasSlug) : undefined) ??
      byName.get(nf) ??
      byCompact.get(nf.replace(/\s+/g, "")) ??
      bySlug.get(nf.replace(/\s+/g, "-")) ??
      null
    );
  };

  // A global set of every active ClickUp task id (across all block lists), used for
  // staleness — a task moved between folders shouldn't read as stale.
  const globalActiveIds = new Set<string>();
  let anyAssignees = false;
  for (const folder of snap.folders) {
    for (const list of folder.lists) {
      if (list.isMilestones) continue;
      for (const t of list.tasks) {
        if (t.assigneeNames.length) anyAssignees = true;
        if (mapStatus({ status: t.status ?? undefined }) !== null) globalActiveIds.add(t.clickupId);
      }
    }
  }

  const report: ClickupAuditReport = {
    generatedFrom: snap.generatedFrom,
    workspace: DEFAULT_WORKSPACE_SLUG,
    unmatchedFolders: [],
    totals: {
      clients: 0,
      clickupActive: 0,
      portalLinked: 0,
      missingInPortal: 0,
      staleInPortal: 0,
      statusMismatches: 0,
      priorityMismatches: 0,
      assigneeMismatches: 0,
    },
    clients: [],
    hasAssignees: anyAssignees,
    markdown: "",
  };

  for (const folder of snap.folders) {
    const matched = matchFolder(folder.name);
    if (!matched) {
      report.unmatchedFolders.push(folder.name);
      continue;
    }
    if (opts.clientSlug && matched.slug !== opts.clientSlug) continue;

    // ── ClickUp side: active tasks in this folder's block lists, keyed by clickupId ──
    const cuById = new Map<
      string,
      { title: string; status: TaskStatus; priority: TaskPriority; assignees: string[] }
    >();
    for (const list of folder.lists) {
      if (list.isMilestones) continue;
      for (const t of list.tasks) {
        const status = mapStatus({ status: t.status ?? undefined });
        if (status === null) continue; // done/closed — excluded from the active audit
        cuById.set(t.clickupId, {
          title: t.name || "(untitled)",
          status,
          priority: mapPriority(t.priority ? { priority: t.priority } : null),
          assignees: resolveNamesToEmails(t.assigneeNames),
        });
      }
    }

    // ── Portal side: this client's clickup-linked tasks (incl. subtasks) ──
    const portalTasks = await prisma.task.findMany({
      where: { workspaceId: wsId, clientId: matched.id, clickupId: { not: null }, archivedAt: null },
      select: {
        title: true,
        status: true,
        priority: true,
        clickupId: true,
        assignees: { select: { email: true } },
      },
    });
    const portalById = new Map<string, (typeof portalTasks)[number]>();
    for (const p of portalTasks) if (p.clickupId) portalById.set(p.clickupId, p);

    const audit: ClientAudit = {
      clientId: matched.id,
      clientName: matched.name,
      clientSlug: matched.slug,
      folderName: folder.name,
      clickupActive: cuById.size,
      portalLinked: portalById.size,
      missingInPortal: [],
      staleInPortal: [],
      statusMismatches: [],
      priorityMismatches: [],
      assigneeMismatches: [],
      inSync: 0,
      driftCount: 0,
    };

    // ClickUp → Portal: missing + field mismatches.
    for (const [id, cu] of cuById) {
      const p = portalById.get(id);
      if (!p) {
        audit.missingInPortal.push({ clickupId: id, title: cu.title });
        continue;
      }
      let drifted = false;
      if (cu.status !== p.status) {
        audit.statusMismatches.push({ clickupId: id, title: cu.title, clickup: cu.status, portal: p.status });
        drifted = true;
      }
      if (cu.priority !== p.priority) {
        audit.priorityMismatches.push({
          clickupId: id,
          title: cu.title,
          clickup: cu.priority,
          portal: p.priority,
        });
        drifted = true;
      }
      if (cu.assignees.length > 0) {
        const portalEmails = [...new Set(p.assignees.map((a) => a.email.toLowerCase()))].sort();
        if (cu.assignees.join("|") !== portalEmails.join("|")) {
          audit.assigneeMismatches.push({
            clickupId: id,
            title: cu.title,
            clickup: cu.assignees,
            portal: portalEmails,
          });
          drifted = true;
        }
      }
      if (!drifted) audit.inSync += 1;
    }

    // Portal → ClickUp: stale (linked to a task no longer active anywhere in ClickUp).
    for (const [id, p] of portalById) {
      if (!globalActiveIds.has(id)) {
        audit.staleInPortal.push({ clickupId: id, title: p.title });
      }
    }

    audit.driftCount =
      audit.missingInPortal.length +
      audit.staleInPortal.length +
      audit.statusMismatches.length +
      audit.priorityMismatches.length +
      audit.assigneeMismatches.length;

    report.totals.clients += 1;
    report.totals.clickupActive += audit.clickupActive;
    report.totals.portalLinked += audit.portalLinked;
    report.totals.missingInPortal += audit.missingInPortal.length;
    report.totals.staleInPortal += audit.staleInPortal.length;
    report.totals.statusMismatches += audit.statusMismatches.length;
    report.totals.priorityMismatches += audit.priorityMismatches.length;
    report.totals.assigneeMismatches += audit.assigneeMismatches.length;

    report.clients.push(audit);
  }

  // Most-drifted first so the noisiest clients lead the report.
  report.clients.sort((a, b) => b.driftCount - a.driftCount);
  // Render from the full arrays (so counts + "…and N more" are exact) …
  report.markdown = renderMarkdown(report);
  // … then cap the returned JSON so the payload stays small.
  for (const c of report.clients) {
    c.missingInPortal = c.missingInPortal.slice(0, SAMPLE_CAP);
    c.staleInPortal = c.staleInPortal.slice(0, SAMPLE_CAP);
    c.statusMismatches = c.statusMismatches.slice(0, SAMPLE_CAP);
    c.priorityMismatches = c.priorityMismatches.slice(0, SAMPLE_CAP);
    c.assigneeMismatches = c.assigneeMismatches.slice(0, SAMPLE_CAP);
  }
  return report;
}

const SLACK_TEXT_CAP = 38_000; // chat.postMessage hard limit is 40k; leave headroom.

export interface SlackPostResult {
  ok: boolean;
  channel: string | null;
  reason?: string;
}

/** Post the written audit report to Slack (roll-up channel by default). Best-effort. */
export async function postAuditToSlack(
  report: ClickupAuditReport,
  opts: { channelId?: string } = {},
): Promise<SlackPostResult> {
  const ws = await prisma.workspace.findUnique({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: {
      slackBotToken: true,
      slackBotTokenEncrypted: true,
      channelRoutes: true,
      slackSummaryChannelId: true,
    },
  });
  const token = getSlackBotToken(ws);
  if (!token) return { ok: false, channel: null, reason: "no_token" };
  const channel = opts.channelId ?? resolveRollupChannel(ws);
  if (!channel) return { ok: false, channel: null, reason: "no_channel" };

  const text =
    report.markdown.length > SLACK_TEXT_CAP
      ? `${report.markdown.slice(0, SLACK_TEXT_CAP)}\n…(truncated — full report in the audit route response)`
      : report.markdown;
  const res = await postMessage(token, { channel, text });
  return { ok: res.ok, channel, reason: res.ok ? undefined : res.error ?? "post_failed" };
}

/** Render up to SAMPLE_CAP rows of a bucket, then a "…and N more" line. */
function bucketLines<T>(items: T[], line: (item: T) => string): string[] {
  const out = items.slice(0, SAMPLE_CAP).map((it) => `      – ${line(it)}`);
  if (items.length > SAMPLE_CAP) out.push(`      …and ${items.length - SAMPLE_CAP} more`);
  return out;
}

// ── Written report (Slack mrkdwn-friendly markdown) ──────────────────────────

function renderMarkdown(r: ClickupAuditReport): string {
  const L: string[] = [];
  L.push(`*ClickUp ↔ Portal audit* — ${r.totals.clients} clients`);
  L.push(`_Snapshot: ${r.generatedFrom}_`);
  L.push("");
  L.push(
    `Totals: ${r.totals.clickupActive} active in ClickUp · ${r.totals.portalLinked} linked in Portal · ` +
      `${r.totals.missingInPortal} missing · ${r.totals.staleInPortal} stale · ` +
      `${r.totals.statusMismatches} status · ${r.totals.priorityMismatches} priority` +
      (r.hasAssignees ? ` · ${r.totals.assigneeMismatches} assignee` : ""),
  );
  if (!r.hasAssignees) {
    L.push("_(Snapshot has no assignee data — assignee drift not audited on this run.)_");
  }
  if (r.unmatchedFolders.length) {
    L.push(`⚠️ Unmatched ClickUp folders (no Portal client): ${r.unmatchedFolders.join(", ")}`);
  }
  L.push("");

  const clean = r.clients.filter((c) => c.driftCount === 0);
  const drifted = r.clients.filter((c) => c.driftCount > 0);

  for (const c of drifted) {
    L.push(`*${c.clientName}* — ${c.driftCount} to review (${c.inSync} in sync)`);
    if (c.missingInPortal.length) {
      L.push(`  • Missing in Portal (${c.missingInPortal.length}):`);
      L.push(...bucketLines(c.missingInPortal, (t) => t.title));
    }
    if (c.staleInPortal.length) {
      L.push(`  • Stale in Portal — done/removed in ClickUp (${c.staleInPortal.length}):`);
      L.push(...bucketLines(c.staleInPortal, (t) => t.title));
    }
    if (c.statusMismatches.length) {
      L.push(`  • Status differs (${c.statusMismatches.length}):`);
      L.push(
        ...bucketLines(
          c.statusMismatches,
          (t) => `${t.title}: ClickUp ${TASK_STATUS_LABELS[t.clickup]} vs Portal ${TASK_STATUS_LABELS[t.portal]}`,
        ),
      );
    }
    if (c.priorityMismatches.length) {
      L.push(`  • Priority differs (${c.priorityMismatches.length}):`);
      L.push(
        ...bucketLines(
          c.priorityMismatches,
          (t) => `${t.title}: ClickUp ${TASK_PRIORITY_LABELS[t.clickup]} vs Portal ${TASK_PRIORITY_LABELS[t.portal]}`,
        ),
      );
    }
    if (r.hasAssignees && c.assigneeMismatches.length) {
      L.push(`  • Assignees differ (${c.assigneeMismatches.length}):`);
      L.push(
        ...bucketLines(
          c.assigneeMismatches,
          (t) => `${t.title}: ClickUp [${t.clickup.join(", ")}] vs Portal [${t.portal.join(", ")}]`,
        ),
      );
    }
    L.push("");
  }

  if (clean.length) {
    L.push(`✅ In sync: ${clean.map((c) => c.clientName).join(", ")}`);
  }
  return L.join("\n");
}
