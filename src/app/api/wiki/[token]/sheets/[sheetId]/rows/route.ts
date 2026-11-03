/**
 * Client-facing Sheets writes, via the public wiki share token — HARDENED posture
 * (`wiki-sheets-access.ts`): token → section on + right section → wiki-access cookie or a
 * Gitwork session → the sheet is scoped through this wiki → per-IP rate limit.
 *
 *   POST  → add rows (if the sheet allows), cells only in client-editable columns
 *   PATCH → { action: "delete" } own rows only; { action: "send" } only if the sheet allows
 *
 * Reads are not here: the client's copy rides down in the wiki DTO (`forPublic`).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { SHEET_LIMITS } from "@/lib/wiki-sheets";
import { clientAddRows, clientDeleteRows, sendSheetRowsToBoard } from "@/server/wiki-sheets";
import {
  assertSheetsWriteRate,
  resolveSheetsWriter,
  sheetsAccessError,
} from "@/server/wiki-sheets-access";
import { sheetAddRowsSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; sheetId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { token, sheetId } = await params;
    const access = await resolveSheetsWriter(req, token);
    if (!access.ok) {
      const { message, status } = sheetsAccessError(access.reason);
      return apiError(message, status);
    }
    await assertSheetsWriteRate(req);
    const { rows } = sheetAddRowsSchema.parse(await req.json());
    const rowIds = await clientAddRows(access.writer, sheetId, rows);
    return apiOk({ rowIds }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

const bulkSchema = z.object({
  action: z.enum(["delete", "send"]),
  rowIds: z.array(z.string().min(1).max(64)).min(1).max(SHEET_LIMITS.maxBatch),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { token, sheetId } = await params;
    const access = await resolveSheetsWriter(req, token);
    if (!access.ok) {
      const { message, status } = sheetsAccessError(access.reason);
      return apiError(message, status);
    }
    await assertSheetsWriteRate(req);
    const { action, rowIds } = bulkSchema.parse(await req.json());
    if (action === "delete") {
      return apiOk({ count: await clientDeleteRows(access.writer, sheetId, rowIds) });
    }
    const results = await sendSheetRowsToBoard(
      { wikiId: access.writer.wikiId },
      sheetId,
      rowIds,
      { kind: "CLIENT", name: access.writer.name, wikiUserId: access.writer.wikiUserId },
      { sheetUrl: `/app/portal/${access.clientSlug}/wiki#sheets` },
    );
    return apiOk({ results });
  } catch (err) {
    return fromError(err);
  }
}
