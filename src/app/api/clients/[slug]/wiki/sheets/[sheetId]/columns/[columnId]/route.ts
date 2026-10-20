import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { removeSheetColumn, updateSheetColumn } from "@/server/wiki-sheets";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetColumnPatchSchema } from "@/server/validators";

type Ctx = { params: Promise<{ slug: string; sheetId: string; columnId: string }> };

/** Rename / retype / options / width / client-editable / move. Returns how many values were cleared. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId, columnId } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "edit a column");
    if (!clientId) return apiError("Client not found", 404);
    const patch = sheetColumnPatchSchema.parse(await req.json());
    return apiOk(await updateSheetColumn(clientId, sheetId, columnId, patch));
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId, columnId } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "remove a column");
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await removeSheetColumn(clientId, sheetId, columnId));
  } catch (err) {
    return fromError(err);
  }
}
