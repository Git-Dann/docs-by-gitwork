import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const archived = await prisma.document.update({
      where: {
        id,
      },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });

    return apiOk({ proposal: archived });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update not found")) {
      return apiError("Proposal not found", 404);
    }

    return fromError(error);
  }
}
