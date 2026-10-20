/**
 * Client: upload an image into a sheet from the share page (§73.2). Same hardened posture
 * as the client's row writes (`wiki-sheets-access.ts`); only where the client may edit.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { clientSaveSheetImage, readImageForm } from "@/server/wiki-sheet-files";
import { assertSheetsWriteRate, resolveSheetsWriter, sheetsAccessError } from "@/server/wiki-sheets-access";

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
    const file = await readImageForm(req);
    return apiOk(await clientSaveSheetImage(access.writer, sheetId, file), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
