/**
 * Images uploaded into Sheet media cells (CLAUDE.md §73.2).
 *
 * One save path for all three ways in — the team's grid, the client's share page and
 * Claude over MCP — so the same checks run whichever door the bytes came through:
 * the sheet is addressed through its wiki (an id from another client's wiki 404s), the
 * client may only upload where they may edit, and the bytes must be a real image
 * (`checkSheetImage`). Storage follows `blob-storage.ts` (Postgres or the bucket).
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkSheetImage, isSheetFileKey, sheetFileUrl, SHEET_IMAGE_MAX_BYTES } from "@/lib/wiki-sheet-files";
import { placeUpload, readStoredUpload } from "@/server/blob-storage";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { SheetError, type ClientWriter, type SheetActor, type SheetScope } from "@/server/wiki-sheets";
import type { SheetMediaItem } from "@/types/wiki-sheets";

async function sheetFor(scope: SheetScope, sheetId: string) {
  const sheet = await prisma.wikiSheet.findFirst({
    where: {
      id: sheetId,
      ...("clientId" in scope ? { wiki: { clientId: scope.clientId } } : { wikiId: scope.wikiId }),
    },
    select: { id: true, wikiId: true, clientCanEdit: true, columns: true },
  });
  if (!sheet) throw new SheetError("Sheet not found", 404);
  return sheet;
}

/** Store one image against a sheet and return the media item a cell holds. */
export async function saveSheetImage(
  scope: SheetScope,
  sheetId: string,
  file: { bytes: Uint8Array; filename: string },
  actor: SheetActor,
): Promise<SheetMediaItem & { size: number }> {
  const sheet = await sheetFor(scope, sheetId);
  const check = checkSheetImage(file.bytes, file.filename);
  if (!check.ok) throw new SheetError(check.error, 400);
  const placed = await placeUpload("wiki-sheet-files", { bytes: file.bytes, contentType: check.mime });
  const key = randomBytes(20).toString("hex");
  await prisma.wikiSheetFile.create({
    data: {
      key,
      wikiId: sheet.wikiId,
      sheetId: sheet.id,
      filename: check.filename,
      mime: check.mime,
      size: file.bytes.length,
      bytes: placed.bytes ? Buffer.from(placed.bytes) : null,
      storageKey: placed.storageKey,
      uploadedByKind: actor.kind,
      uploadedByName: actor.name,
    },
  });
  const title = check.filename.replace(/\.[a-z]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 120);
  return { url: sheetFileUrl(key, check.filename), title, size: file.bytes.length };
}

/** Client upload: only where the client may edit. */
export async function clientSaveSheetImage(
  writer: ClientWriter,
  sheetId: string,
  file: { bytes: Uint8Array; filename: string },
): Promise<SheetMediaItem & { size: number }> {
  const sheet = await sheetFor({ wikiId: writer.wikiId }, sheetId);
  if (!sheet.clientCanEdit) throw new SheetError("This sheet is read-only for you.", 403);
  return saveSheetImage({ wikiId: writer.wikiId }, sheetId, file, {
    kind: "CLIENT",
    name: writer.name,
    wikiUserId: writer.wikiUserId,
  });
}

/** Read the `file` part of a multipart upload. */
export async function readImageForm(req: Request): Promise<{ bytes: Uint8Array; filename: string }> {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new SheetError("Attach an image as `file`.", 400);
  if (file.size > SHEET_IMAGE_MAX_BYTES) throw new SheetError("Images can be up to 10 MB.", 400);
  return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name || "image" };
}

/**
 * Fetch an image from a public URL for Claude (MCP). The SSRF guard approves every hop and
 * pins the connection; the body is read with a hard cap rather than trusting Content-Length.
 */
export async function fetchImageFromUrl(url: string): Promise<{ bytes: Uint8Array; filename: string }> {
  let res: Response;
  try {
    res = await fetchScannableUrl(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new SheetError(`Couldn't fetch that image: ${err instanceof Error ? err.message : "request failed"}.`, 400);
  }
  if (!res.ok || !res.body) throw new SheetError(`Couldn't fetch that image (HTTP ${res.status}).`, 400);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > SHEET_IMAGE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new SheetError("Images can be up to 10 MB.", 400);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  const filename = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "image");
  return { bytes, filename };
}

/** Serve: the key is the capability. Unknown or malformed → null. */
export async function readSheetFile(key: string): Promise<{ bytes: Buffer; mime: string; filename: string } | null> {
  if (!isSheetFileKey(key)) return null;
  const row = await prisma.wikiSheetFile.findUnique({
    where: { key },
    select: { bytes: true, storageKey: true, mime: true, filename: true },
  });
  if (!row) return null;
  const bytes = await readStoredUpload({ storageKey: row.storageKey, bytes: row.bytes });
  return bytes ? { bytes, mime: row.mime, filename: row.filename } : null;
}
