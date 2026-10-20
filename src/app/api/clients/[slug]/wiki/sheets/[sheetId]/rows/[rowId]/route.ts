import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { updateSheetRowCells } from "@/server/wiki-sheets";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetCellPatchSchema } from "@/server/validators";

type Ctx = { params: Promise<{ slug: string; sheetId: string; rowId: string }> };

/** Change some cells: `{ cells: { [columnId]: value | null } }`. Merged per cell, never whole-row. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId, rowId } = await params;
    const { clientId, actor } = await resolveInternalSheets(req, slug, "edit a row");
    if (!clientId) return apiError("Client not found", 404);
    const { cells } = sheetCellPatchSchema.parse(await req.json());
    await updateSheetRowCells(clientId, sheetId, rowId, cells, actor);
    return apiOk({ saved: true });
  } catch (err) {
    return fromError(err);
  }
}
