import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalExportSchema } from "@/server/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = proposalExportSchema.parse(await request.json());

    const proposal = await prisma.document.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!proposal) {
      return apiError("Proposal not found", 404);
    }

    const pathByFormat: Record<typeof payload.format, string> = {
      PRINT: `/app/proposals/${id}/print`,
      PDF: `/app/proposals/${id}/print`,
      SHARE_LINK: `/preview/${id}`,
    };

    const exportRecord = await prisma.export.create({
      data: {
        documentId: id,
        format: payload.format,
        status: payload.format === "PDF" ? "PENDING" : "READY",
        url: pathByFormat[payload.format],
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
