/**
 * The Google Drive copy of HR documents (docs/hr-platform.md, Phase 1b). When a business
 * turns it on, every uploaded file is copied into its own Drive: a "Foundry HR" folder
 * with one folder per person. Drive is the backup and the place to hand one folder to an
 * accountant or solicitor; Foundry stays the index (what's required, what's expiring,
 * who looked).
 *
 * Best-effort by design: a Drive failure never fails the upload. The row records the
 * error, the profile shows it to HR, and the next copy attempt retries.
 *
 * ⚠️ A file opened straight from Drive is not in Foundry's access log. The folder is
 * created by Foundry in the workspace owner's Drive and shared by nobody until HR shares
 * it, which is the business's decision to make.
 */

import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { readStoredUpload } from "@/server/blob-storage";
import { driveFor, ensureChildFolder, resolveWorkspaceGoogleAccount, type DriveClient } from "@/server/google-drive-backup";
import { parseHrDocumentSettings } from "@/lib/hr-documents";

const ROOT_FOLDER_NAME = "Foundry HR";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function ensureHrRoot(drive: DriveClient, workspaceId: string, cached: string | null): Promise<string> {
  if (cached) {
    try {
      const res = await drive.files.get({ fileId: cached, fields: "id, trashed" });
      if (res.data.id && !res.data.trashed) return res.data.id;
    } catch {
      // Gone or unreadable: make a fresh one below.
    }
  }
  const created = await drive.files.create({ requestBody: { name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME }, fields: "id" });
  const id = created.data.id;
  if (!id) throw new Error("Drive did not return a folder id");
  await prisma.workspace.update({ where: { id: workspaceId }, data: { hrDriveFolderId: id } });
  return id;
}

/** Copy one document's file into Drive. Never throws: the outcome is written to the row. */
export async function copyDocumentToDrive(documentId: string): Promise<void> {
  const doc = await prisma.staffDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      workspaceId: true,
      recordId: true,
      title: true,
      filename: true,
      mime: true,
      bytes: true,
      storageKey: true,
      driveFileId: true,
    },
  });
  if (!doc || doc.driveFileId || (!doc.bytes && !doc.storageKey)) return;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: doc.workspaceId },
      select: { hrDocumentSettings: true, hrDriveFolderId: true },
    });
    if (!workspace || !parseHrDocumentSettings(workspace.hrDocumentSettings).driveEnabled) return;
    const account = await resolveWorkspaceGoogleAccount(doc.workspaceId);
    if (!account) throw new Error("Nobody in this workspace has connected Google, so there's no Drive to copy to.");

    const drive = driveFor(account.client);
    const root = await ensureHrRoot(drive, doc.workspaceId, workspace.hrDriveFolderId);
    const record = await prisma.candidate.findFirst({
      where: { id: doc.recordId, workspaceId: doc.workspaceId },
      select: { name: true, hrDriveFolderId: true },
    });
    if (!record) throw new Error("The person's record is gone.");
    const folderId = await ensureChildFolder(drive, root, record.name, record.hrDriveFolderId);
    if (folderId !== record.hrDriveFolderId) {
      await prisma.candidate.update({ where: { id: doc.recordId }, data: { hrDriveFolderId: folderId } });
    }

    const bytes = await readStoredUpload({ storageKey: doc.storageKey, bytes: doc.bytes });
    if (!bytes) throw new Error("The stored file couldn't be read.");
    const created = await drive.files.create({
      requestBody: { name: doc.filename ?? doc.title, parents: [folderId] },
      media: { mimeType: doc.mime ?? "application/octet-stream", body: Readable.from(bytes) },
      fields: "id",
    });
    await prisma.staffDocument.update({
      where: { id: doc.id },
      data: { driveFileId: created.data.id ?? null, driveSyncedAt: new Date(), driveError: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.staffDocument
      .update({ where: { id: doc.id }, data: { driveError: message.slice(0, 300) } })
      .catch(() => undefined);
  }
}

/** Move a deleted document's Drive copy to the bin (Drive keeps it 30 days). Never throws. */
export async function trashDriveCopy(workspaceId: string, driveFileId: string | null): Promise<void> {
  if (!driveFileId) return;
  try {
    const account = await resolveWorkspaceGoogleAccount(workspaceId);
    if (!account) return;
    await driveFor(account.client).files.update({ fileId: driveFileId, requestBody: { trashed: true } });
  } catch (err) {
    console.warn(`[hr-drive] could not bin ${driveFileId}:`, err instanceof Error ? err.message : err);
  }
}
