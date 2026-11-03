/**
 * HR documents (docs/hr-platform.md, Phase 1b): list, add, open, check, request and
 * delete the documents on a person's record.
 *
 * - Files are checked by their contents, not their name (the Launchpad rules), and stored
 *   wherever every other upload is (src/server/blob-storage.ts).
 * - Who sees which document is canSeeDocument; who may add which type is canUploadType.
 *   A person's own upload waits as TO_CHECK until HR accepts it.
 * - Every open by someone other than the person, and every add, check and delete, is
 *   written to HrAccessLog. The log names the document type, never the contents.
 * - When the business has turned Drive on, each file is also copied there, after the
 *   response (documents-drive.ts).
 */

import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyLaunchpadUpload, LAUNCHPAD_SNIFF_BYTES } from "@/lib/launchpad/files";
import { deleteStoredUpload, placeUpload, readStoredUpload } from "@/server/blob-storage";
import { canManageHr, canViewStaff, ForbiddenError, type EffectiveUser } from "@/server/auth/effective-user";
import { relationTo, writeLog } from "@/server/hr/profile";
import { copyDocumentToDrive, trashDriveCopy } from "@/server/hr/documents-drive";
import { StaffInputError } from "@/server/staff";
import {
  canSeeDocument,
  canUploadType,
  isStaffDocumentType,
  normaliseDocumentMeta,
  parseHrDocumentSettings,
  requirementsFor,
  safeDriveLink,
  STAFF_DOCUMENT_LABEL,
  STAFF_DOCUMENT_TYPES,
  type DocumentMetaInput,
  type DocumentStatus,
  type DocumentVisibility,
  type HrDocumentSettings,
  type StaffDocumentRecord,
  type StaffDocumentType,
  type StaffDocumentsView,
} from "@/lib/hr-documents";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);

function notFound(what = "Staff record"): Error {
  return Object.assign(new Error(`${what} not found`), { status: 404 });
}

const DOC_SELECT = {
  id: true,
  recordId: true,
  type: true,
  title: true,
  status: true,
  visibility: true,
  filename: true,
  size: true,
  link: true,
  storageKey: true,
  expiresOn: true,
  note: true,
  uploadedBySelf: true,
  createdAt: true,
  driveFileId: true,
  driveError: true,
} as const satisfies Prisma.StaffDocumentSelect;

type DocRow = {
  id: string;
  recordId: string;
  type: string;
  title: string;
  status: string;
  visibility: string;
  filename: string | null;
  size: number | null;
  link: string | null;
  storageKey: string | null;
  expiresOn: Date | null;
  note: string | null;
  uploadedBySelf: boolean;
  createdAt: Date;
  driveFileId: string | null;
  driveError: string | null;
};

function toRecord(r: DocRow, hr: boolean, driveOn: boolean): StaffDocumentRecord {
  return {
    id: r.id,
    type: (isStaffDocumentType(r.type) ? r.type : "OTHER") as StaffDocumentType,
    title: r.title,
    status: r.status as DocumentStatus,
    visibility: r.visibility as DocumentVisibility,
    filename: r.filename,
    size: r.size,
    link: r.link,
    hasFile: Boolean(r.filename),
    expiresOn: day(r.expiresOn),
    note: r.note,
    uploadedBySelf: r.uploadedBySelf,
    createdAt: r.createdAt.toISOString(),
    drive: hr && r.filename ? { state: r.driveFileId ? "copied" : r.driveError ? "failed" : driveOn ? "failed" : "off", error: r.driveError } : null,
  };
}

async function settingsOf(workspaceId: string): Promise<HrDocumentSettings> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { hrDocumentSettings: true } });
  return parseHrDocumentSettings(ws?.hrDocumentSettings);
}

/** The record, the viewer's relation to it, and whether they can see it at all. */
async function context(user: EffectiveUser, recordId: string) {
  const record = await prisma.candidate.findFirst({
    where: { id: recordId, workspaceId: user.workspaceId },
    select: { id: true, memberId: true, managerId: true, employmentType: true },
  });
  if (!record) throw notFound();
  const relation = await relationTo(user, record);
  // Documents are personal: Staff access alone is not enough, but it is needed to know the
  // record exists. Someone without it gets the same 404 as a record that isn't there.
  if (relation !== "self" && !canViewStaff(user) && !canManageHr(user)) throw notFound();
  return { record, relation, hr: canManageHr(user) };
}

export async function listDocuments(user: EffectiveUser, recordId: string, today = day(new Date())!): Promise<StaffDocumentsView> {
  const { record, relation, hr } = await context(user, recordId);
  const [rows, settings] = await Promise.all([
    prisma.staffDocument.findMany({
      where: { workspaceId: user.workspaceId, recordId: record.id },
      orderBy: { createdAt: "desc" },
      select: DOC_SELECT,
    }),
    settingsOf(user.workspaceId),
  ]);
  const visible = rows.filter((r) => canSeeDocument({ relation, canManageHr: hr, visibility: r.visibility }));
  const openRequestTypes = visible.filter((r) => r.status === "REQUESTED").map((r) => r.type);
  // The required checklist is HR's and the person's: a manager only sees what's shared with them.
  const showRequired = hr || relation === "self";
  return {
    documents: visible.map((r) => toRecord(r, hr, settings.driveEnabled)),
    required: showRequired
      ? requirementsFor(
          record.employmentType,
          visible.map((r) => ({ type: r.type, status: r.status, expiresOn: day(r.expiresOn), createdAt: r.createdAt.toISOString() })),
          today,
        )
      : [],
    uploadTypes: STAFF_DOCUMENT_TYPES.filter((type) =>
      canUploadType({ relation, canManageHr: hr, type, settings, openRequestTypes }),
    ),
    canManage: hr,
    settings: hr ? settings : null,
  };
}

/**
 * Add a file. HR adds any type, on file at once. The person adds a type HR allows or has
 * asked for, and it waits as TO_CHECK; if HR asked for it, the request row is filled.
 */
export async function addDocumentFile(
  user: EffectiveUser,
  recordId: string,
  file: { name: string; size: number; bytes: Uint8Array },
  meta: DocumentMetaInput,
): Promise<StaffDocumentRecord> {
  const { record, relation, hr } = await context(user, recordId);
  const m = normaliseDocumentMeta(meta);
  if (!m.ok) throw new StaffInputError(m.error);
  const settings = await settingsOf(user.workspaceId);
  const openRequest = await prisma.staffDocument.findFirst({
    where: { workspaceId: user.workspaceId, recordId: record.id, type: m.value.type, status: "REQUESTED" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!canUploadType({ relation, canManageHr: hr, type: m.value.type, settings, openRequestTypes: openRequest ? [m.value.type] : [] })) {
    throw new ForbiddenError(`You can't add a ${STAFF_DOCUMENT_LABEL[m.value.type].toLowerCase()} here. HR can ask you for one.`);
  }
  const verdict = classifyLaunchpadUpload({ filename: file.name, size: file.size, head: file.bytes.subarray(0, LAUNCHPAD_SNIFF_BYTES) });
  if (!verdict.ok) throw new StaffInputError(verdict.error);

  const placed = await placeUpload(`hr/${user.workspaceId}/${record.id}`, { bytes: file.bytes, contentType: verdict.mime });
  const self = !hr;
  const data = {
    type: m.value.type,
    title: m.value.title,
    visibility: hr ? m.value.visibility : "PERSON_HR",
    filename: verdict.filename,
    mime: verdict.mime,
    size: file.size,
    bytes: placed.bytes ? Buffer.from(placed.bytes) : null,
    storageKey: placed.storageKey,
    link: null,
    expiresOn: toDate(m.value.expiresOn),
    status: self ? "TO_CHECK" : "ON_FILE",
    uploadedById: user.id,
    uploadedBySelf: self,
  };
  const row = openRequest && self
    ? await prisma.staffDocument.update({ where: { id: openRequest.id }, data, select: DOC_SELECT })
    : await prisma.staffDocument.create({ data: { workspaceId: user.workspaceId, recordId: record.id, ...data }, select: DOC_SELECT });
  await writeLog(user, record.id, "ADD_DOCUMENT", STAFF_DOCUMENT_LABEL[m.value.type]);
  if (settings.driveEnabled) {
    try {
      after(() => copyDocumentToDrive(row.id));
    } catch {
      // Outside a request (tests, scripts) there is no after(); copy inline instead.
      await copyDocumentToDrive(row.id);
    }
  }
  return toRecord(row, hr, settings.driveEnabled);
}

/** Attach a file already in Google Drive, by its link. HR only: it is shown to people as a link. */
export async function addDocumentLink(
  user: EffectiveUser,
  recordId: string,
  input: DocumentMetaInput & { link?: unknown },
): Promise<StaffDocumentRecord> {
  const { record, hr } = await context(user, recordId);
  if (!hr) throw new ForbiddenError("Only HR can attach a Drive file");
  const m = normaliseDocumentMeta(input);
  if (!m.ok) throw new StaffInputError(m.error);
  const link = safeDriveLink(input.link);
  if (!link) throw new StaffInputError("Paste a Google Drive or Google Docs link (https://drive.google.com/…)");
  const row = await prisma.staffDocument.create({
    data: {
      workspaceId: user.workspaceId,
      recordId: record.id,
      type: m.value.type,
      title: m.value.title,
      visibility: m.value.visibility,
      link,
      expiresOn: toDate(m.value.expiresOn),
      status: "ON_FILE",
      uploadedById: user.id,
    },
    select: DOC_SELECT,
  });
  await writeLog(user, record.id, "ADD_DOCUMENT", `${STAFF_DOCUMENT_LABEL[m.value.type]} (Drive link)`);
  return toRecord(row, true, false);
}

/** Ask someone for a document. It shows on their profile and in Backstage → Me until they add it. */
export async function requestDocument(
  user: EffectiveUser,
  recordId: string,
  input: { type?: unknown; note?: unknown },
): Promise<StaffDocumentRecord> {
  const { record, hr } = await context(user, recordId);
  if (!hr) throw new ForbiddenError("Only HR can ask for documents");
  if (!isStaffDocumentType(input.type)) throw new StaffInputError("Choose what kind of document to ask for");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 300) || null : null;
  const existing = await prisma.staffDocument.findFirst({
    where: { workspaceId: user.workspaceId, recordId: record.id, type: input.type, status: "REQUESTED" },
    select: DOC_SELECT,
  });
  if (existing) return toRecord(existing, true, false);
  const row = await prisma.staffDocument.create({
    data: {
      workspaceId: user.workspaceId,
      recordId: record.id,
      type: input.type,
      title: STAFF_DOCUMENT_LABEL[input.type],
      status: "REQUESTED",
      note,
      uploadedById: user.id,
    },
    select: DOC_SELECT,
  });
  return toRecord(row, true, false);
}

async function loadDocument(user: EffectiveUser, documentId: string) {
  const row = await prisma.staffDocument.findFirst({
    where: { id: documentId, workspaceId: user.workspaceId },
    select: { ...DOC_SELECT, mime: true, bytes: true },
  });
  if (!row) throw notFound("Document");
  const { relation, hr } = await context(user, row.recordId);
  if (!canSeeDocument({ relation, canManageHr: hr, visibility: row.visibility })) throw notFound("Document");
  return { row, relation, hr };
}

/** The file, for download. A download by anyone but the person is logged. */
export async function openDocument(
  user: EffectiveUser,
  documentId: string,
): Promise<{ bytes: Buffer; mime: string; filename: string }> {
  const { row, relation } = await loadDocument(user, documentId);
  if (!row.filename) throw new StaffInputError("This document is a Drive link or a request, not a file");
  const bytes = await readStoredUpload({ storageKey: row.storageKey, bytes: row.bytes });
  if (!bytes) throw notFound("File");
  if (relation !== "self") await writeLog(user, row.recordId, "DOWNLOAD_DOCUMENT", STAFF_DOCUMENT_LABEL[row.type as StaffDocumentType] ?? row.type);
  return { bytes, mime: row.mime ?? "application/octet-stream", filename: row.filename };
}

/**
 * HR's changes to a document: accept or send back someone's upload, or change its title,
 * expiry or who can see it.
 */
export async function updateDocument(
  user: EffectiveUser,
  documentId: string,
  input: { review?: "accept" | "reject"; note?: unknown; title?: unknown; expiresOn?: unknown; visibility?: unknown },
): Promise<StaffDocumentRecord> {
  const { row, hr } = await loadDocument(user, documentId);
  if (!hr) throw new ForbiddenError("Only HR can change documents");
  const data: Record<string, unknown> = {};
  if (input.review) {
    if (row.status !== "TO_CHECK") throw new StaffInputError("Only an upload waiting to be checked can be accepted or sent back");
    data.status = input.review === "accept" ? "ON_FILE" : "REJECTED";
    data.reviewedById = user.id;
    data.reviewedAt = new Date();
    data.note = input.review === "reject" && typeof input.note === "string" ? input.note.trim().slice(0, 300) || null : row.note;
  }
  if (input.title !== undefined || input.expiresOn !== undefined || input.visibility !== undefined) {
    const m = normaliseDocumentMeta({
      type: row.type,
      title: input.title ?? row.title,
      expiresOn: input.expiresOn === undefined ? day(row.expiresOn) : input.expiresOn,
      visibility: input.visibility ?? row.visibility,
    });
    if (!m.ok) throw new StaffInputError(m.error);
    data.title = m.value.title;
    data.expiresOn = toDate(m.value.expiresOn);
    data.visibility = m.value.visibility;
  }
  const updated = await prisma.staffDocument.update({ where: { id: row.id }, data, select: DOC_SELECT });
  if (input.review) await writeLog(user, row.recordId, "REVIEW_DOCUMENT", `${STAFF_DOCUMENT_LABEL[row.type as StaffDocumentType] ?? row.type}: ${input.review === "accept" ? "accepted" : "sent back"}`);
  const settings = await settingsOf(user.workspaceId);
  return toRecord(updated, true, settings.driveEnabled);
}

/** Delete a document and its file. HR only. The Drive copy goes to Drive's bin. */
export async function deleteDocument(user: EffectiveUser, documentId: string): Promise<void> {
  const { row, hr } = await loadDocument(user, documentId);
  if (!hr) throw new ForbiddenError("Only HR can delete documents");
  await prisma.staffDocument.delete({ where: { id: row.id } });
  await deleteStoredUpload(row.storageKey);
  await trashDriveCopy(user.workspaceId, row.driveFileId);
  await writeLog(user, row.recordId, "DELETE_DOCUMENT", STAFF_DOCUMENT_LABEL[row.type as StaffDocumentType] ?? row.type);
}

/** Retry a failed Drive copy. HR only. */
export async function retryDriveCopy(user: EffectiveUser, documentId: string): Promise<void> {
  const { row, hr } = await loadDocument(user, documentId);
  if (!hr) throw new ForbiddenError("Only HR can retry a Drive copy");
  await prisma.staffDocument.update({ where: { id: row.id }, data: { driveError: null } });
  await copyDocumentToDrive(row.id);
}

export async function getDocumentSettings(user: EffectiveUser): Promise<HrDocumentSettings> {
  if (!canManageHr(user)) throw new ForbiddenError("Only HR can see document settings");
  return settingsOf(user.workspaceId);
}

export async function updateDocumentSettings(user: EffectiveUser, input: unknown): Promise<HrDocumentSettings> {
  if (!canManageHr(user)) throw new ForbiddenError("Only HR can change document settings");
  const next = parseHrDocumentSettings(input);
  await prisma.workspace.update({ where: { id: user.workspaceId }, data: { hrDocumentSettings: { ...next } } });
  return next;
}
