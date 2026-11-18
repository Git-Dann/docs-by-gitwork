/**
 * Images that were uploaded into the retired Sheets' media cells (CLAUDE.md §73.2, §127).
 *
 * Only the read side is left: old links to `/api/wiki/files/<key>/<name>` keep working, and
 * the move of sheet rows onto the Board (src/server/sheets-to-board.ts) copies these bytes onto
 * the new cards. Storage follows `blob-storage.ts` (Postgres or the bucket). The key is a
 * 160-bit random capability.
 */

import { prisma } from "@/lib/prisma";
import { isSheetFileKey } from "@/lib/table/files";
import { readStoredUpload } from "@/server/blob-storage";

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
