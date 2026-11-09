import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { docsWorkspaceId } from "@/server/documents-scope";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getEffectiveUserOrNull(request);
    assertCan(actor, canManageDocs, "manage documents");
    const { id } = await context.params;
    const workspaceId = await docsWorkspaceId(actor);

    const owned = await prisma.document.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!owned) return apiError("Proposal not found", 404);

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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError("Proposal not found", 404);
    }

    return fromError(error);
  }
}
