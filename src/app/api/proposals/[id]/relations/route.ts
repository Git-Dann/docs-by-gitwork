/**
 * GET /api/proposals/[id]/relations
 *
 * Returns the doc's parent (if any) and direct children for the linked-documents widget. Each
 * record is the minimum subset needed to render a list row — id, title, documentType, status,
 * updatedAt — to keep the payload small.
 *
 * The relation graph is one-level: a doc has at most one parent, and its children are docs
 * that point back at it via `parentId`. The UI doesn't render the full tree because in
 * practice it's shallow (MSA → SOW → CO is the deepest chain we see).
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await ensureBaseRecords();
    const { id } = await context.params;

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        parent: {
          select: {
            id: true,
            title: true,
            documentType: true,
            status: true,
            documentNumber: true,
            updatedAt: true,
          },
        },
        children: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            documentType: true,
            status: true,
            documentNumber: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!document) return apiError("Document not found", 404);

    const serialize = (d: NonNullable<typeof document.parent>) => ({
      id: d.id,
      title: d.title,
      documentType: d.documentType,
      documentNumber: d.documentNumber,
      status: d.status,
      updatedAt: d.updatedAt.toISOString(),
    });

    return apiOk({
      parent: document.parent ? serialize(document.parent) : null,
      children: document.children.map(serialize),
    });
  } catch (error) {
    return fromError(error);
  }
}
