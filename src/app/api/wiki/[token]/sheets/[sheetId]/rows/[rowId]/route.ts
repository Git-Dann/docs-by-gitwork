/**
 * Client edits one row's cells: `{ cells: { [columnId]: value | null } }`. Only columns the
 * team marked client-editable, on a sheet the client may edit. Merged per cell.
 * Posture: see ../route.ts.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { clientUpdateCells } from "@/server/wiki-sheets";
import {
  assertSheetsWriteRate,
  resolveSheetsWriter,
  sheetsAccessError,
} from "@/server/wiki-sheets-access";
import { sheetCellPatchSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; sheetId: string; rowId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { token, sheetId, rowId } = await params;
    const access = await resolveSheetsWriter(req, token);
    if (!access.ok) {
      const { message, status } = sheetsAccessError(access.reason);
      return apiError(message, status);
    }
    await assertSheetsWriteRate(req);
    const { cells } = sheetCellPatchSchema.parse(await req.json());
    await clientUpdateCells(access.writer, sheetId, rowId, cells);
    return apiOk({ saved: true });
  } catch (err) {
    return fromError(err);
  }
}
