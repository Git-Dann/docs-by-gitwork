/**
 * Docs → Google Drive backup.
 *
 * Mirrors documents into a "Foundry Docs Backup" folder in the backup account's Drive as native,
 * editable Google Docs. Each document maps to exactly one Google Doc (`Document.gdriveFileId`), so
 * runs are idempotent: create when there's no backing file, update it in place otherwise.
 *
 * Conversion to a native Google Doc happens on upload: we send `text/html` media with a target
 * `mimeType` of `application/vnd.google-apps.document`, and Drive imports + converts it.
 *
 * Auth: callers pass an OAuth2 client (from `googleClientForRefreshToken`) that carries the
 * `drive.file` scope. `drive.file` only grants access to files the app created — our folder and the
 * docs inside it — never the rest of the account's Drive.
 */

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { renderDocumentToHtml } from "@/server/document-to-html";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
export type DriveClient = ReturnType<typeof google.drive>;

const BACKUP_FOLDER_NAME = "Foundry Docs Backup";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Build a Drive v3 client from an authenticated OAuth2 client. */
export function driveFor(client: OAuth2Client): DriveClient {
  return google.drive({ version: "v3", auth: client });
}

function isNotFound(err: unknown): boolean {
  const e = err as { code?: number; response?: { status?: number } };
  return e?.code === 404 || e?.response?.status === 404;
}

/**
 * Return the id of the backup folder, creating it (and caching the id on the workspace) if needed.
 * If the cached id points at a folder that's since been trashed/deleted, a fresh one is created.
 */
export async function ensureBackupFolder(
  drive: DriveClient,
  workspaceId: string,
  existingFolderId: string | null,
): Promise<string> {
  if (existingFolderId) {
    try {
      const res = await drive.files.get({ fileId: existingFolderId, fields: "id, trashed" });
      if (res.data.id && !res.data.trashed) return res.data.id;
    } catch (err) {
      if (!isNotFound(err)) throw err; // transient error — don't spawn a duplicate folder
    }
  }

  const created = await drive.files.create({
    requestBody: { name: BACKUP_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: "id",
  });
  const folderId = created.data.id;
  if (!folderId) throw new Error("Drive did not return a folder id");

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { docsBackupFolderId: folderId },
  });
  return folderId;
}

export interface BackupResult {
  documentId: string;
  fileId: string;
  action: "created" | "updated";
  title: string;
}

/**
 * Back up a single document. Fetches the full record, renders it to HTML, and creates or updates
 * its Google Doc. Stamps `gdriveFileId` + `gdriveBackedUpAt` on success. Returns null if the
 * document no longer exists.
 */
export async function backupDocument(
  drive: DriveClient,
  folderId: string,
  documentId: string,
): Promise<BackupResult | null> {
  const record = await prisma.document.findUnique({
    where: { id: documentId },
    include: proposalInclude,
  });
  if (!record) return null;

  const { title, html } = renderDocumentToHtml(serializeProposal(record));

  // Update the existing Doc in place when we have one. If Drive says it's gone (404 — deleted by
  // hand), fall through and recreate.
  if (record.gdriveFileId) {
    try {
      const res = await drive.files.update({
        fileId: record.gdriveFileId,
        requestBody: { name: title },
        media: { mimeType: "text/html", body: html },
        fields: "id",
      });
      const fileId = res.data.id ?? record.gdriveFileId;
      await prisma.document.update({
        where: { id: documentId },
        data: { gdriveFileId: fileId, gdriveBackedUpAt: new Date() },
      });
      return { documentId, fileId, action: "updated", title };
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  const res = await drive.files.create({
    requestBody: { name: title, mimeType: GOOGLE_DOC_MIME, parents: [folderId] },
    media: { mimeType: "text/html", body: html },
    fields: "id",
  });
  const fileId = res.data.id;
  if (!fileId) throw new Error("Drive did not return a file id");

  await prisma.document.update({
    where: { id: documentId },
    data: { gdriveFileId: fileId, gdriveBackedUpAt: new Date() },
  });
  return { documentId, fileId, action: "created", title };
}

/**
 * Resolve the backup account's OAuth2 client for a workspace. The backup runs against a single
 * designated account (the workspace owner) so all docs land in one place. Returns null when
 * backup is disabled, no owner token is stored, or the Google client env vars are missing.
 */
export async function resolveBackupAuth(workspace: {
  id: string;
  docsBackupEnabled: boolean;
}): Promise<{ client: OAuth2Client; ownerEmail: string | null } | null> {
  if (!workspace.docsBackupEnabled) return null;

  // The designated backup account = the workspace owner (the User who owns the default records).
  // Fall back to any connected member with a token if the owner hasn't connected Google.
  const owner = await prisma.user.findFirst({
    where: {
      googleOAuthRefreshToken: { not: null },
      OR: [{ email: "owner@gitwork.io" }, { email: "dan@gitwork.co.uk" }],
    },
    select: { googleOAuthRefreshToken: true, googleOAuthEmail: true },
    orderBy: { createdAt: "asc" },
  });

  const account =
    owner ??
    (await prisma.user.findFirst({
      where: { googleOAuthRefreshToken: { not: null } },
      select: { googleOAuthRefreshToken: true, googleOAuthEmail: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!account?.googleOAuthRefreshToken) return null;

  const { googleClientForRefreshToken } = await import("@/server/google-auth");
  const client = googleClientForRefreshToken(account.googleOAuthRefreshToken);
  if (!client) return null;

  return { client, ownerEmail: account.googleOAuthEmail };
}

/**
 * Fire-and-forget backup of a single document — used by the on-share hook so a sent doc lands in
 * Drive immediately rather than waiting for the daily cron. Self-resolves the workspace, backup
 * account, and folder; swallows every error (the cron is the reliable safety net). Never throws,
 * so callers can `void backupDocumentBestEffort(id)` without a try/catch.
 */
export async function backupDocumentBestEffort(documentId: string): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        archivedAt: true,
        workspace: { select: { id: true, docsBackupEnabled: true, docsBackupFolderId: true } },
      },
    });
    if (!doc || doc.archivedAt || !doc.workspace) return;

    const backupAuth = await resolveBackupAuth(doc.workspace);
    if (!backupAuth) return;

    const drive = driveFor(backupAuth.client);
    const folderId = await ensureBackupFolder(drive, doc.workspace.id, doc.workspace.docsBackupFolderId);
    await backupDocument(drive, folderId, documentId);
  } catch (err) {
    console.warn(`[docs-gdrive-backup] on-share backup failed for ${documentId}: ${String(err).slice(0, 160)}`);
  }
}
