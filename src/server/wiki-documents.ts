/**
 * wiki-documents.ts — the wiki Documents section: a clean list of a client's docs.
 *
 * Three kinds: FOUNDRY (a link to a Foundry doc), LINK (Google Docs / any URL),
 * FILE (an uploaded file stored inline as bytea, served via a token-gated route).
 * The DTO deliberately exposes a display `host`/`fileName`, never the raw URL, so
 * the public board shows tidy titled cards. Figma lives in the Designs card, not here.
 */

import type { WikiDocumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enableDocumentShare } from "@/server/documents";

export interface WikiDocumentDTO {
  id: string;
  title: string;
  kind: WikiDocumentKind;
  /** External/Foundry URL (LINK/FOUNDRY). Null for FILE — the UI builds a download path. */
  url: string | null;
  /** Display domain for LINK cards (e.g. "docs.google.com"). Null otherwise. */
  host: string | null;
  fileName: string | null;
  fileSize: number | null;
  addedAt: string;
}

export interface WikiDocumentsSection {
  enabled: boolean;
  documents: WikiDocumentDTO[];
}

/** Max upload size kept inline in the DB. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Foundry doc share links are labelled distinctly from generic external links. */
function deriveLinkKind(url: string): WikiDocumentKind {
  try {
    const u = new URL(url);
    if (u.host.toLowerCase().endsWith("gitwork.co.uk") && u.pathname.includes("/docs/")) {
      return "FOUNDRY";
    }
  } catch {
    /* fall through */
  }
  return "LINK";
}

function toDTO(d: {
  id: string;
  title: string;
  kind: WikiDocumentKind;
  url: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: Date;
}): WikiDocumentDTO {
  return {
    id: d.id,
    title: d.title,
    kind: d.kind,
    url: d.kind === "FILE" ? null : d.url,
    host: d.kind === "FILE" ? null : d.url ? hostOf(d.url) : null,
    fileName: d.fileName,
    fileSize: d.fileSize,
    addedAt: d.createdAt.toISOString(),
  };
}

const LIST_SELECT = {
  id: true,
  title: true,
  kind: true,
  url: true,
  fileName: true,
  fileSize: true,
  createdAt: true,
} as const;

export async function loadWikiDocuments(clientId: string): Promise<WikiDocumentsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      documentsEnabled: true,
      documents: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: LIST_SELECT,
      },
    },
  });
  if (!wiki) return { enabled: false, documents: [] };
  return { enabled: wiki.documentsEnabled, documents: wiki.documents.map(toDTO) };
}

async function ensureWiki(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
  return wiki.id;
}

export async function setWikiDocumentsEnabled(clientId: string, enabled: boolean): Promise<void> {
  const id = await ensureWiki(clientId);
  await prisma.clientWiki.update({ where: { id }, data: { documentsEnabled: enabled } });
}

export interface CreateLinkInput {
  title: string;
  url: string;
}
export interface CreateFileInput {
  title: string;
  data: Buffer;
  fileName: string;
  fileMime: string;
}

/** Add a link/Foundry-doc document. Kind is auto-derived from the URL. */
export async function createLinkDocument(
  clientId: string,
  input: CreateLinkInput,
): Promise<WikiDocumentDTO> {
  const wikiId = await ensureWiki(clientId);
  const url = input.url.trim();
  const max = await prisma.wikiDocument.aggregate({ where: { wikiId }, _max: { sortOrder: true } });
  const doc = await prisma.wikiDocument.create({
    data: {
      wikiId,
      title: input.title.trim(),
      kind: deriveLinkKind(url),
      url,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    select: LIST_SELECT,
  });
  await prisma.clientWiki.update({ where: { id: wikiId }, data: { documentsEnabled: true } });
  return toDTO(doc);
}

/** Add an uploaded file document (stored inline). */
export async function createFileDocument(
  clientId: string,
  input: CreateFileInput,
): Promise<WikiDocumentDTO> {
  const wikiId = await ensureWiki(clientId);
  const max = await prisma.wikiDocument.aggregate({ where: { wikiId }, _max: { sortOrder: true } });
  const doc = await prisma.wikiDocument.create({
    data: {
      wikiId,
      title: input.title.trim() || input.fileName,
      kind: "FILE",
      fileData: input.data,
      fileName: input.fileName,
      fileMime: input.fileMime,
      fileSize: input.data.byteLength,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    select: LIST_SELECT,
  });
  await prisma.clientWiki.update({ where: { id: wikiId }, data: { documentsEnabled: true } });
  return toDTO(doc);
}

export async function updateDocument(
  clientId: string,
  docId: string,
  input: { title?: string; url?: string },
): Promise<WikiDocumentDTO | null> {
  const existing = await prisma.wikiDocument.findFirst({
    where: { id: docId, wiki: { clientId } },
    select: { id: true, kind: true },
  });
  if (!existing) return null;
  const updated = await prisma.wikiDocument.update({
    where: { id: docId },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      // URL is only meaningful for link/Foundry docs; re-derive the kind.
      ...(input.url !== undefined && existing.kind !== "FILE"
        ? { url: input.url.trim(), kind: deriveLinkKind(input.url.trim()) }
        : {}),
    },
    select: LIST_SELECT,
  });
  return toDTO(updated);
}

/**
 * Add a Foundry Document to this client's wiki Documents section (the Portal "Add to wiki"
 * action). The wiki entry links to the doc's public `/docs/[token]` page, so the doc is shared
 * (token minted if needed) — that's the view-only surface the client opens. Idempotent: a doc
 * already in this wiki is updated in place (deduped by `documentId`), never duplicated. Enabling
 * a doc also flips the Documents section on so it shows.
 *
 * Only a document that belongs to this client resolves. A doc not yet FK-linked (matched to the
 * client by name only in the Portal list) is linked here, since adding it is an explicit
 * association. Returns null if the document doesn't exist / isn't this client's.
 */
export async function addDocumentToWiki(
  clientId: string,
  documentId: string,
): Promise<WikiDocumentDTO | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, OR: [{ clientId }, { clientId: null }] },
    select: { id: true, title: true, clientId: true },
  });
  if (!doc) return null;

  if (doc.clientId !== clientId) {
    await prisma.document.update({ where: { id: doc.id }, data: { clientId } });
  }

  // The wiki card opens the public share page; ensure the doc is shared (idempotent — keeps any
  // existing token so previously-distributed links keep working).
  const { url } = await enableDocumentShare(documentId);

  const wikiId = await ensureWiki(clientId);
  const existing = await prisma.wikiDocument.findFirst({
    where: { wikiId, documentId },
    select: { id: true },
  });
  const data = { title: doc.title, kind: "FOUNDRY" as const, url, documentId };
  let saved;
  if (existing) {
    saved = await prisma.wikiDocument.update({
      where: { id: existing.id },
      data,
      select: LIST_SELECT,
    });
  } else {
    const max = await prisma.wikiDocument.aggregate({
      where: { wikiId },
      _max: { sortOrder: true },
    });
    saved = await prisma.wikiDocument.create({
      data: { wikiId, ...data, sortOrder: (max._max.sortOrder ?? 0) + 1 },
      select: LIST_SELECT,
    });
  }
  await prisma.clientWiki.update({ where: { id: wikiId }, data: { documentsEnabled: true } });
  return toDTO(saved);
}

/** Remove the wiki entry that mirrors a given Foundry Document (Portal "Remove from wiki"). */
export async function removeDocumentFromWiki(
  clientId: string,
  documentId: string,
): Promise<boolean> {
  const res = await prisma.wikiDocument.deleteMany({
    where: { documentId, wiki: { clientId } },
  });
  return res.count > 0;
}

export async function deleteDocument(clientId: string, docId: string): Promise<boolean> {
  const res = await prisma.wikiDocument.deleteMany({ where: { id: docId, wiki: { clientId } } });
  return res.count > 0;
}

/** Fetch an uploaded file's bytes, scoped to the client (internal download). */
export async function getDocumentFileByClient(
  clientId: string,
  docId: string,
): Promise<{ data: Buffer; mime: string; fileName: string } | null> {
  const doc = await prisma.wikiDocument.findFirst({
    where: { id: docId, wiki: { clientId }, kind: "FILE" },
    select: { fileData: true, fileMime: true, fileName: true },
  });
  if (!doc?.fileData) return null;
  return {
    data: Buffer.from(doc.fileData),
    mime: doc.fileMime ?? "application/octet-stream",
    fileName: doc.fileName ?? "download",
  };
}

/** Fetch an uploaded file by public wiki share token (public download). */
export async function getDocumentFileByToken(
  token: string,
  docId: string,
): Promise<{ data: Buffer; mime: string; fileName: string } | null> {
  const wiki =
    (await prisma.clientWiki.findFirst({ where: { shareToken: token }, select: { id: true } })) ??
    (await prisma.clientWiki.findFirst({
      where: { pageShareTokens: { has: token } },
      select: { id: true },
    }));
  if (!wiki) return null;
  const doc = await prisma.wikiDocument.findFirst({
    where: { id: docId, wikiId: wiki.id, kind: "FILE" },
    select: { fileData: true, fileMime: true, fileName: true },
  });
  if (!doc?.fileData) return null;
  return {
    data: Buffer.from(doc.fileData),
    mime: doc.fileMime ?? "application/octet-stream",
    fileName: doc.fileName ?? "download",
  };
}
