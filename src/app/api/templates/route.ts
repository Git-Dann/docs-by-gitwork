import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

/**
 * GET /api/templates
 *
 * Lists every DocumentTemplate the workspace has access to (own templates + Foundry stock
 * templates with workspaceId = null). Includes a `documentCount` field so the Templates tab
 * can show how many documents have been spun out of each.
 *
 * Filterable by `?documentType=PROPOSAL` for the legacy proposal-only callers.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureBaseRecords();

    const typeFilter = request.nextUrl.searchParams.get("documentType");

    const templates = await prisma.documentTemplate.findMany({
      where: typeFilter
        ? { documentType: typeFilter as never }
        : undefined,
      orderBy: [{ documentType: "asc" }, { isDefault: "desc" }, { updatedAt: "desc" }],
      include: {
        _count: { select: { documents: true } },
      },
    });

    return apiOk({
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        slug: template.slug,
        description: template.description,
        documentType: template.documentType,
        isDefault: template.isDefault,
        sections: template.sections,
        metadata: template.metadata,
        workspaceId: template.workspaceId,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
        documentCount: template._count.documents,
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}
