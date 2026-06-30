import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  allowedDocTypesForUser,
  assertCan,
  canManageDocs,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Toggle a document's workspace-level favourite flag (the Docs dashboard star + Favorites
 * collection). Dedicated route — kept off the main PATCH so it sidesteps the SENT/terminal
 * edit-locks (you can star a sent doc). Body: `{ isFavorite: boolean }`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getEffectiveUserOrNull(request);
    assertCan(actor, canManageDocs, "manage documents");
    const { id } = await context.params;

    const body = (await request.json().catch(() => ({}))) as { isFavorite?: unknown };
    const isFavorite = body.isFavorite === true;

    const existing = await prisma.document.findFirst({
      where: { id },
      select: { id: true, documentType: true },
    });
    if (!existing) {
      return apiError("Document not found", 404);
    }
    // Type gate: a developer must never touch an admin doc type (mirrors GET/PATCH 404).
    if (actor && !allowedDocTypesForUser(actor).includes(existing.documentType)) {
      return apiError("Document not found", 404);
    }

    const updated = await prisma.document.update({
      where: { id },
      data: { isFavorite },
      select: { id: true, isFavorite: true },
    });

    return apiOk({ proposal: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return apiError("Document not found", 404);
    }
    return fromError(error);
  }
}
