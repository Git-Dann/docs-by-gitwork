/**
 * Import requests from a spreadsheet — staff-side, by client slug.
 *
 * The parsing, the column mapping and the vocabulary coercion all happen in the BROWSER
 * (`request-import-modal.tsx` + `src/lib/delimited.ts`), so what arrives here is already
 * a list of well-formed items and this route is the same shape as any other bulk write.
 * That split is deliberate: a person needs to SEE what a file mapped to before it lands
 * in a client's wiki, and a server that parsed the file itself could only report the
 * result afterwards.
 *
 * ⚠️ Gated on `canManageClients`, unlike the sibling single-item POST. This writes up to
 * 500 rows into a client-facing page in one call; the launchpad routes are the posture to
 * copy here, not the older intake routes that resolve a client by slug and write.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { importWikiIntakeItems } from "@/server/wiki";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { intakeCommonFields } from "@/server/wiki-intake-vocab";
import { IMPORT_MAX_ROWS, IMPORT_MAX_TITLE } from "@/lib/wiki-intake-import-limits";


const itemSchema = z.object({
  ...intakeCommonFields,
  title: z.string().trim().min(1).max(IMPORT_MAX_TITLE),
  type: intakeCommonFields.type.default("FEEDBACK"),
  priority: intakeCommonFields.priority.default("MEDIUM"),
  externalRef: z.string().trim().max(180).optional().nullable(),
  requestedBy: z.string().trim().max(120).optional().nullable(),
  categoryId: z.string().trim().max(64).optional().nullable(),
});

const bodySchema = z.object({
  // Shared with the browser so the modal can stop you BEFORE the mapping work —
  // see src/lib/wiki-intake-import-limits.ts.
  items: z.array(itemSchema).min(1).max(IMPORT_MAX_ROWS),
  /** Parse and dedupe without writing, so the preview can report what WOULD happen. */
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(req);
    assertCan(user, canManageClients, "import requests");

    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const body = bodySchema.parse(await req.json());
    const result = await importWikiIntakeItems(
      client.id,
      body.items.map((item) => ({
        ...item,
        // ⚠️ The SHEET's name wins, which is the opposite of every other intake path —
        // and deliberately NOT `resolveRequestedBy`, which orders `staffName` ahead of a
        // typed one. There the typed name is someone claiming to be somebody; here the
        // column is usually the client's own requester, and overwriting it with the
        // importer's name would erase the only attribution the sheet actually carried.
        // A row with no name falls back to whoever ran the import.
        requestedBy: item.requestedBy?.trim() || user?.name || user?.email || null,
      })),
      { dryRun: body.dryRun },
    );
    if (!result) {
      return apiError(
        "This client's Requests section is switched off, so there is nowhere to import to.",
        409,
      );
    }
    return apiOk({ created: result.created.length, skipped: result.skipped, count: result.count });
  } catch (err) {
    return fromError(err);
  }
}
