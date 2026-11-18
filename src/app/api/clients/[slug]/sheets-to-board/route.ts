/**
 * Move this client's wiki Sheets onto their Board as product cards (CLAUDE.md §127).
 * `{ apply?: boolean }` — without `apply: true` it is a dry run and writes nothing.
 * 'Manage clients' and access to this client. src/server/sheets-to-board.ts.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { applySheetsToBoard, planSheetsToBoard, SheetsToBoardError } from "@/server/sheets-to-board";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { requestWorkspaceId } from "@/server/workspaces/scope";

export const maxDuration = 300;

const bodySchema = z.object({ apply: z.boolean().optional() }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { clientId, user } = await resolveInternalSheets(req, slug, "move this client's sheets onto the board");
    if (!clientId) return apiError("Client not found", 404);
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const workspaceId = await requestWorkspaceId(user);
    if (!body.apply) return apiOk({ applied: false, plan: await planSheetsToBoard({ workspaceId, clientId }) });
    const result = await applySheetsToBoard({ workspaceId, clientId, actorId: user?.id ?? null });
    return apiOk({ applied: true, result });
  } catch (err) {
    if (err instanceof SheetsToBoardError) return apiError(err.message, err.status);
    return fromError(err);
  }
}
