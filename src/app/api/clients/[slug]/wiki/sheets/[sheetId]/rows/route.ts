import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  addSheetRows,
  getWikiSheet,
  reorderSheetRows,
  sendSheetRowsToBoard,
  setSheetRowsDeleted,
} from "@/server/wiki-sheets";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetAddRowsSchema, sheetOrderSchema, sheetRowsBulkSchema } from "@/server/validators";

type Ctx = { params: Promise<{ slug: string; sheetId: string }> };

/** Add rows (cells keyed by column id). All or nothing. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId, actor } = await resolveInternalSheets(req, slug, "add rows", "rows");
    if (!clientId) return apiError("Client not found", 404);
    const { rows } = sheetAddRowsSchema.parse(await req.json());
    return apiOk(await addSheetRows(clientId, sheetId, rows, actor), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

/** Bulk: delete (soft), restore, or send to the task board. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId, actor } = await resolveInternalSheets(req, slug, "change rows", "rows");
    if (!clientId) return apiError("Client not found", 404);
    const { action, rowIds, featureBlockId } = sheetRowsBulkSchema.parse(await req.json());
    if (action === "send") {
      const results = await sendSheetRowsToBoard({ clientId }, sheetId, rowIds, actor, {
        featureBlockId,
        sheetUrl: `/app/portal/${slug}/wiki#sheets`,
      });
      return apiOk({ results, sheet: await getWikiSheet({ clientId }, sheetId) });
    }
    const count = await setSheetRowsDeleted(clientId, sheetId, rowIds, action === "delete");
    return apiOk({ count, sheet: await getWikiSheet({ clientId }, sheetId) });
  } catch (err) {
    return fromError(err);
  }
}

/** Reorder rows: `{ order: [rowId, …] }`. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, sheetId } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "reorder rows", "rows");
    if (!clientId) return apiError("Client not found", 404);
    const { order } = sheetOrderSchema.parse(await req.json());
    await reorderSheetRows(clientId, sheetId, order);
    return apiOk(await getWikiSheet({ clientId }, sheetId));
  } catch (err) {
    return fromError(err);
  }
}
