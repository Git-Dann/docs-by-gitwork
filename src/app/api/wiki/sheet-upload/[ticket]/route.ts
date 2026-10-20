/**
 * Upload images into a Sheet with a signed link from MCP's `get_sheet_upload_link` (§73.4).
 * Public path (under `/api/wiki`); the signed ticket is the only credential. Multipart, one or
 * more `file` fields. When the ticket names a row + media column, the images are appended to
 * that cell; either way the stored `{ url, title }` items are returned.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { isMediaList } from "@/lib/wiki-sheet-media";
import { SHEET_IMAGE_INPUT_MAX_BYTES } from "@/lib/wiki-sheet-files";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { saveSheetImage } from "@/server/wiki-sheet-files";
import { readUploadTicket } from "@/server/wiki-sheet-upload-ticket";
import { SheetError, updateSheetRowCells, type SheetActor } from "@/server/wiki-sheets";
import type { SheetMediaItem } from "@/types/wiki-sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILES = 10;

type Ctx = { params: Promise<{ ticket: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { ticket: raw } = await params;
    const check = readUploadTicket(raw);
    if (!check.ok) {
      return apiError(
        check.reason === "expired" ? "This upload link has expired — ask for a new one." : "This upload link isn't valid.",
        check.reason === "expired" ? 410 : 401,
      );
    }
    const t = check.ticket;
    await assertWithinRateLimit({
      bucket: `sheets:upload-link:${clientIpFrom(req.headers) ?? "unknown"}`,
      max: 120,
      windowMs: 60 * 60 * 1000,
    });

    const form = await req.formData().catch(() => null);
    const files = (form?.getAll("file") ?? []).filter((f): f is File => typeof f !== "string");
    if (files.length === 0) return apiError('Attach one or more images as "file" (multipart).', 400);
    if (files.length > MAX_FILES) return apiError(`At most ${MAX_FILES} images per request.`, 400);
    const big = files.find((f) => f.size > SHEET_IMAGE_INPUT_MAX_BYTES);
    if (big) return apiError(`"${big.name}" is over 24 MB.`, 400);

    const actor: SheetActor = { kind: "TEAM", name: t.n || "Claude", userId: t.u };
    const stored: (SheetMediaItem & { size: number })[] = [];
    for (const f of files) {
      stored.push(
        await saveSheetImage({ clientId: t.c }, t.s, { bytes: new Uint8Array(await f.arrayBuffer()), filename: f.name || "image" }, actor),
      );
    }

    let attached = false;
    if (t.r && t.k) {
      // Read the cell now, not when the link was issued, so a batch never overwrites images
      // added since. The usual coercion (10 per cell, etc.) still applies.
      const row = await prisma.wikiSheetRow.findFirst({ where: { id: t.r, sheetId: t.s }, select: { cells: true } });
      if (!row) throw new SheetError("That row no longer exists.", 404);
      const current = (row.cells as Record<string, unknown> | null)?.[t.k];
      const items = [...(isMediaList(current) ? current : []), ...stored.map(({ url, title }) => ({ url, title }))];
      await updateSheetRowCells(t.c, t.s, t.r, { [t.k]: items }, actor);
      attached = true;
    }
    return apiOk({ items: stored, attached }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
