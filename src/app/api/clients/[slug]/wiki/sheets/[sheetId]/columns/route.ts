import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addSheetColumns } from "@/server/wiki-sheets";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetAddColumnsSchema } from "@/server/validators";

type Ctx = { params: Promise<{ slug: string; sheetId: string }> };

/** Add columns. Team only — a client never changes a sheet's structure. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "add a column");
    if (!clientId) return apiError("Client not found", 404);
    const { columns } = sheetAddColumnsSchema.parse(await req.json());
    return apiOk(await addSheetColumns(clientId, sheetId, columns), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
