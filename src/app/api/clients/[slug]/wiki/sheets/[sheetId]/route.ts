import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteWikiSheet, getWikiSheet, updateWikiSheet } from "@/server/wiki-sheets";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetUpdateSchema } from "@/server/validators";

type Ctx = { params: Promise<{ slug: string; sheetId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "view a sheet");
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await getWikiSheet({ clientId }, sheetId));
  } catch (err) {
    return fromError(err);
  }
}

/** Title, description, title column and the client's permissions. Never columns or rows. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "edit a sheet");
    if (!clientId) return apiError("Client not found", 404);
    const body = sheetUpdateSchema.parse(await req.json());
    return apiOk(await updateWikiSheet(clientId, sheetId, body));
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "delete a sheet");
    if (!clientId) return apiError("Client not found", 404);
    await deleteWikiSheet(clientId, sheetId);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
