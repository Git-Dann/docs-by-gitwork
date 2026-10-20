import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { setSheetRowHeight, updateSheetRowCells } from "@/server/wiki-sheets";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetRowPatchSchema } from "@/server/validators";

type Ctx = { params: Promise<{ slug: string; sheetId: string; rowId: string }> };

/**
 * Change some cells — `{ cells: { [columnId]: value | null } }`, merged per cell, never
 * whole-row — and/or the row's height, `{ height: px | null }` (null = auto). Team only;
 * the client's route takes cells and nothing else (§73.1).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId, rowId } = await params;
    const { clientId, actor } = await resolveInternalSheets(req, slug, "edit a row");
    if (!clientId) return apiError("Client not found", 404);
    const { cells, height } = sheetRowPatchSchema.parse(await req.json());
    if (cells && Object.keys(cells).length > 0) {
      await updateSheetRowCells(clientId, sheetId, rowId, cells, actor);
    }
    const saved =
      height !== undefined ? { height: await setSheetRowHeight(clientId, sheetId, rowId, height) } : {};
    return apiOk({ saved: true, ...saved });
  } catch (err) {
    return fromError(err);
  }
}
