/**
 * GET    /api/templates/[id]   → single template, full sections array
 * PATCH  /api/templates/[id]   → set-default (the only field we mutate from the UI in v1)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  isDefault: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!template) return apiError("Template not found", 404);
    return apiOk({
      template: {
        ...template,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
        documentCount: template._count.documents,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) return apiError("Template not found", 404);

    // "Default for this type" must be unique per (workspace, documentType). When the caller
    // promotes one template, demote any other defaults for the same type in the same workspace.
    if (body.isDefault === true) {
      await prisma.documentTemplate.updateMany({
        where: {
          documentType: existing.documentType,
          workspaceId: existing.workspaceId,
          id: { not: id },
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.name ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });

    return apiOk({ template: updated });
  } catch (error) {
    return fromError(error);
  }
}
