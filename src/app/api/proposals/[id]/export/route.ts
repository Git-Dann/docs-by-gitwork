import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalExportSchema } from "@/server/validators";
import { enableDocumentShare } from "@/server/documents";
import {
  assertCan,
  canManageDocs,
  canShareDocs,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getEffectiveUserOrNull(request);
    assertCan(actor, canManageDocs, "export documents");
    const { id } = await context.params;
    const payload = proposalExportSchema.parse(await request.json());

    const proposal = await prisma.document.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!proposal) {
      return apiError("Proposal not found", 404);
    }

    // SHARE_LINK mints (or reuses) the canonical tokenised public link at /docs/[token] —
    // the same path the editor's Share button uses. The old code pointed this at the
    // deprecated /preview/[id] "link expired" page, handing clients a dead URL. Minting a
    // public link is high-risk, so it additionally requires docs.share.
    let resolvedUrl: string;
    if (payload.format === "SHARE_LINK") {
      assertCan(actor, canShareDocs, "share documents");
      const { url } = await enableDocumentShare(id);
      resolvedUrl = url;
    } else {
      resolvedUrl = `/app/docs/${id}/print`;
    }

    const exportRecord = await prisma.export.create({
      data: {
        documentId: id,
        format: payload.format,
        status: payload.format === "PDF" ? "PENDING" : "READY",
        url: resolvedUrl,
        settings: payload.settings as unknown as Prisma.InputJsonValue | undefined,
        completedAt: payload.format === "PDF" ? null : new Date(),
      },
      select: {
        id: true,
        format: true,
        status: true,
        url: true,
        requestedAt: true,
      },
    });

    return apiOk({
      export: {
        ...exportRecord,
        requestedAt: exportRecord.requestedAt.toISOString(),
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
