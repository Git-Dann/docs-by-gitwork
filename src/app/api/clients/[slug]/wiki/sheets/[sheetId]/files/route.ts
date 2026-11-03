/** Team: upload an image into a sheet (§73.2). Multipart `file`. Returns the media item. */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { readImageForm, saveSheetImage } from "@/server/wiki-sheet-files";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; sheetId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId, actor } = await resolveInternalSheets(req, slug, "upload images", "rows");
    if (!clientId) return apiError("Client not found", 404);
    const file = await readImageForm(req);
    return apiOk(await saveSheetImage({ clientId }, sheetId, file, actor), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
