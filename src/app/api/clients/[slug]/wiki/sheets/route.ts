import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  createWikiSheet,
  loadWikiSheets,
  reorderWikiSheets,
  setWikiSheetsEnabled,
} from "@/server/wiki-sheets";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";
import { sheetCreateSchema, sheetOrderSchema } from "@/server/validators";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "view sheets");
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiSheets(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const { clientId, actor } = await resolveInternalSheets(req, slug, "add a sheet");
    if (!clientId) return apiError("Client not found", 404);
    const body = sheetCreateSchema.parse(await req.json());
    const sheet = await createWikiSheet(clientId, body, actor);
    return apiOk({ sheet, section: await loadWikiSheets(clientId) }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

const toggleSchema = z.object({ enabled: z.boolean() });

/** Toggle the section — the sidebar's Add New and delete. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "manage sheets");
    if (!clientId) return apiError("Client not found", 404);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiSheetsEnabled(clientId, enabled);
    return apiOk(await loadWikiSheets(clientId));
  } catch (err) {
    return fromError(err);
  }
}

/** Reorder the sheets: `{ order: [id, …] }`. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { slug } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "reorder sheets");
    if (!clientId) return apiError("Client not found", 404);
    const { order } = sheetOrderSchema.parse(await req.json());
    await reorderWikiSheets(clientId, order);
    return apiOk(await loadWikiSheets(clientId));
  } catch (err) {
    return fromError(err);
  }
}
