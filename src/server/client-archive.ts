/**
 * Client → Google Drive archive.
 *
 * Exports everything attached to a WorkspaceClient into a per-client subfolder under the
 * "Foundry Client Archives" Drive folder, as a folder of readable native Google Docs plus one
 * machine-readable `client-archive.json` snapshot. Triggered when a client is archived or deleted
 * (via the BackgroundJob queue) and re-runnable on demand from the client detail page.
 *
 *   Foundry Client Archives/
 *     └─ {Client} — archived {date}/
 *          ├─ 00 — Client Overview          (profile, contacts, billing, retainer, onboarding)
 *          ├─ Tasks & Timeline              (feature blocks, tasks, milestones)
 *          ├─ Meetings                      (Scribe summaries + action items)
 *          ├─ Wiki                          (all wiki pages)
 *          ├─ Documents/ → one Google Doc per proposal/contract/SOW/…
 *          └─ client-archive.json           (full snapshot for fidelity)
 *
 * Reuses the Docs→Drive infra (google-drive-backup.ts): the same backup account, the
 * `docsBackupEnabled` master switch, and `renderDocumentToHtml` for the per-document Google Docs.
 * A re-run reuses the client's folder and rewrites its contents (clean, no duplicate snapshots).
 *
 * Security: the client's encrypted `bankAccount` is deliberately NOT exported — decrypted bank
 * details must not leave the platform into Drive.
 */

import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { renderDocumentToHtml } from "@/server/document-to-html";
import {
  clearFolderContents,
  createSubfolder,
  driveFor,
  ensureChildFolder,
  ensureClientArchiveFolder,
  resolveBackupAuth,
  uploadHtmlAsDoc,
  uploadJsonFile,
} from "@/server/google-drive-backup";

export interface ClientArchiveResult {
  clientId: string;
  status: "archived" | "skipped";
  reason?: string;
  folderId?: string;
  documents?: number;
  sections?: string[];
}

// ── HTML helpers ────────────────────────────────────────────────────────────

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlDoc(title: string, bodyInner: string): string {
  return `<html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><h1>${esc(title)}</h1>${bodyInner}</body></html>`;
}

/** A labelled paragraph — skipped when the value is blank. */
function field(label: string, value: unknown): string {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return "";
  return `<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`;
}

function fmtDate(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

type Row = Record<string, unknown>;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildOverviewHtml(client: Row): string {
  const parts: string[] = [];
  parts.push("<h2>Profile</h2>");
  parts.push(field("Name", client.name));
  parts.push(field("Status", client.status));
  parts.push(field("Website", client.website));
  parts.push(field("Created", fmtDate(client.createdAt)));
  parts.push(field("Notes", client.notes));

  parts.push("<h2>Contacts</h2>");
  parts.push(field("Primary contact", client.primaryContactName));
  parts.push(field("Email", client.primaryContactEmail));
  parts.push(field("Phone", client.primaryContactPhone));
  parts.push(field("Invoice email", client.invoiceEmail));

  parts.push("<h2>Address</h2>");
  parts.push(
    field(
      "Address",
      [client.addressLine1, client.addressLine2, client.city, client.county, client.postcode, client.country]
        .filter((v) => typeof v === "string" && v.trim())
        .join(", "),
    ),
  );

  parts.push("<h2>Company &amp; billing</h2>");
  parts.push(field("Legal company name", client.legalCompanyName));
  parts.push(field("Company number", client.companyNumber));
  parts.push(field("VAT number", client.vatNumber));
  parts.push(field("Retainer (days/mo)", client.retainerDays));
  parts.push(field("Retainer used this month", client.retainerDaysUsed));

  parts.push("<h2>Links</h2>");
  parts.push(field("Google Drive folder", client.googleDriveFolderUrl));
  parts.push(field("ClickUp", client.clickupUrl));

  // Onboarding — dump the answers map if present.
  const onboarding = client.onboarding as Row | null;
  if (onboarding) {
    parts.push("<h2>Onboarding</h2>");
    parts.push(field("Submitted", fmtDate(onboarding.submittedAt ?? onboarding.createdAt)));
    const answers = onboarding.answers as Row | null;
    if (answers && typeof answers === "object") {
      const rows = Object.entries(answers)
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`)
        .join("");
      if (rows) parts.push(`<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>${rows}</tbody></table>`);
    }
  }

  // CRM touchpoints
  const touchpoints = asRows(client.touchpoints);
  if (touchpoints.length) {
    parts.push("<h2>CRM touchpoints</h2>");
    const rows = touchpoints
      .map((t) => `<tr><td>${fmtDate(t.occurredAt)}</td><td>${esc(t.type)}</td><td>${esc(t.note)}</td></tr>`)
      .join("");
    parts.push(`<table><thead><tr><th>Date</th><th>Type</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  return htmlDoc("Client Overview", parts.filter(Boolean).join("\n"));
}

function buildTasksHtml(client: Row): string {
  const blocks = asRows(client.featureBlocks);
  const tasks = asRows(client.tasks);
  const milestones = asRows(client.milestones);
  const parts: string[] = [];

  const byBlock = new Map<string | null, Row[]>();
  for (const task of tasks) {
    const key = (task.featureBlockId as string | null) ?? null;
    const list = byBlock.get(key) ?? [];
    list.push(task);
    byBlock.set(key, list);
  }

  const renderTaskList = (list: Row[]): string =>
    list.length
      ? `<ul>${list
          .map(
            (t) =>
              `<li>${esc(t.title)} <em>(${esc(t.status)}${t.priority ? `, ${esc(t.priority)}` : ""})</em>` +
              `${t.dueDate ? ` — due ${fmtDate(t.dueDate)}` : ""}</li>`,
          )
          .join("")}</ul>`
      : "<p><em>No tasks.</em></p>";

  parts.push("<h2>Feature blocks</h2>");
  if (!blocks.length) parts.push("<p><em>No feature blocks.</em></p>");
  for (const block of blocks) {
    const range =
      block.startDate || block.endDate ? ` (${fmtDate(block.startDate)} → ${fmtDate(block.endDate)})` : "";
    parts.push(`<h3>${esc(block.name)}${range}</h3>`);
    parts.push(renderTaskList(byBlock.get(block.id as string) ?? []));
  }

  const loose = byBlock.get(null) ?? [];
  if (loose.length) {
    parts.push("<h3>Unassigned tasks</h3>");
    parts.push(renderTaskList(loose));
  }

  if (milestones.length) {
    parts.push("<h2>Milestones</h2>");
    parts.push(
      `<ul>${milestones.map((m) => `<li>${esc(m.name)} — ${fmtDate(m.date)}</li>`).join("")}</ul>`,
    );
  }

  return htmlDoc("Tasks & Timeline", parts.join("\n"));
}

function buildMeetingsHtml(client: Row): string {
  const meetings = asRows(client.meetings);
  if (!meetings.length) return htmlDoc("Meetings", "<p><em>No meetings.</em></p>");
  const parts: string[] = [];
  for (const meeting of meetings) {
    parts.push(`<h2>${esc(meeting.title)}</h2>`);
    parts.push(field("Date", fmtDate(meeting.startedAt ?? meeting.createdAt)));
    if (meeting.summary) parts.push(`<p>${esc(meeting.summary)}</p>`);
    const actions = asRows(meeting.actionItems);
    if (actions.length) {
      parts.push("<h3>Action items</h3>");
      parts.push(
        `<ul>${actions.map((a) => `<li>${esc(a.text ?? a.description ?? a.title)}</li>`).join("")}</ul>`,
      );
    }
  }
  return htmlDoc("Meetings", parts.join("\n"));
}

function buildWikiHtml(client: Row): string {
  const wiki = client.wiki as Row | null;
  const pages = asRows(wiki?.pages);
  if (!wiki || !pages.length) return htmlDoc("Wiki", "<p><em>No wiki pages.</em></p>");
  const parts: string[] = [];
  for (const page of pages) {
    parts.push(`<h2>${esc(page.title)}</h2>`);
    const body = page.content ?? page.body ?? page.markdown;
    if (body) parts.push(`<p>${esc(body)}</p>`);
  }
  return htmlDoc("Wiki", parts.join("\n"));
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Export a single client's data to Drive. Idempotent per client (reuses the folder, rewrites its
 * contents). Returns a `skipped` result (no throw) when backup is disabled or no backup account is
 * connected — retrying wouldn't help. Throws on Drive/API errors so the job runner retries.
 */
export async function runClientArchive(clientId: string): Promise<ClientArchiveResult> {
  const client = (await prisma.workspaceClient.findUnique({
    where: { id: clientId },
    include: {
      workspace: { select: { id: true, docsBackupEnabled: true, clientArchiveFolderId: true } },
      onboarding: true,
      touchpoints: { orderBy: { occurredAt: "desc" } },
      tasks: true,
      featureBlocks: true,
      milestones: true,
      meetings: { include: { actionItems: true } },
      placements: true,
      platforms: true,
      designSystem: true,
      designs: true,
      studies: true,
      assignments: true,
      wiki: { include: { pages: true, changelog: true, documents: true } },
    },
    // bankAccount intentionally omitted — never export decrypted bank details to Drive.
  })) as (Row & { workspace: { id: string; docsBackupEnabled: boolean; clientArchiveFolderId: string | null } }) | null;

  if (!client) throw new Error(`Client ${clientId} not found`);
  const workspace = client.workspace;

  const backupAuth = await resolveBackupAuth(workspace);
  if (!backupAuth) {
    return {
      clientId,
      status: "skipped",
      reason: workspace.docsBackupEnabled ? "no_connected_backup_account" : "backup_disabled",
    };
  }

  const drive = driveFor(backupAuth.client);
  const rootId = await ensureClientArchiveFolder(drive, workspace.id, workspace.clientArchiveFolderId);

  const stamp = new Date().toISOString().slice(0, 10);
  const folderName = `${client.name} — archived ${stamp}`;
  const folderId = await ensureChildFolder(
    drive,
    rootId,
    folderName,
    (client.archiveDriveFolderId as string | null) ?? null,
  );

  // Clean rewrite so re-runs don't accumulate duplicate snapshots.
  await clearFolderContents(drive, folderId);

  const sections: string[] = [];

  // Section docs.
  await uploadHtmlAsDoc(drive, folderId, "00 — Client Overview", buildOverviewHtml(client));
  sections.push("overview");
  await uploadHtmlAsDoc(drive, folderId, "Tasks & Timeline", buildTasksHtml(client));
  sections.push("tasks");
  await uploadHtmlAsDoc(drive, folderId, "Meetings", buildMeetingsHtml(client));
  sections.push("meetings");
  await uploadHtmlAsDoc(drive, folderId, "Wiki", buildWikiHtml(client));
  sections.push("wiki");

  // Per-document Google Docs.
  const docs = await prisma.document.findMany({ where: { clientId }, include: proposalInclude });
  let documentCount = 0;
  if (docs.length) {
    const docsFolderId = await createSubfolder(drive, folderId, "Documents");
    for (const doc of docs) {
      const { title, html } = renderDocumentToHtml(serializeProposal(doc));
      await uploadHtmlAsDoc(drive, docsFolderId, title || "Untitled document", html);
      documentCount += 1;
    }
    sections.push("documents");
  }

  // Full machine-readable snapshot (bank details already excluded from the query).
  const snapshot = {
    exportedAt: new Date().toISOString(),
    client,
    documents: docs.map((d) => serializeProposal(d)),
  };
  await uploadJsonFile(drive, folderId, "client-archive.json", JSON.stringify(snapshot, null, 2));
  sections.push("json");

  await prisma.workspaceClient.update({
    where: { id: clientId },
    data: { archiveDriveFolderId: folderId, archivedToDriveAt: new Date() },
  });

  return { clientId, status: "archived", folderId, documents: documentCount, sections };
}

/**
 * Enqueue a client archive (durable, retried). Fire-and-forget from the archive/delete triggers.
 * Deduped per client so repeated triggers collapse onto one in-flight job.
 */
export async function archiveClientToDriveBestEffort(
  clientId: string,
  workspaceId: string,
  reason: "archived" | "deleted" | "manual",
): Promise<void> {
  const { enqueueJobBestEffort } = await import("@/server/jobs/queue");
  enqueueJobBestEffort({
    type: "CLIENT_ARCHIVE",
    payload: { clientId, reason },
    workspaceId,
    dedupeKey: `client-archive:${clientId}`,
  });
}
