/**
 * GET    /api/templates/[id]   → single template, full sections array
 * PATCH  /api/templates/[id]   → rename / set-default / replace sections (workspace-owned only
 *                                for sections — Foundry stock templates are immutable)
 * DELETE /api/templates/[id]   → delete a workspace-owned template
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * One template section. We deliberately keep `data` as a passthrough Json blob — block-specific
 * validation happens at document save time via SECTION_REGISTRY's validator. Letting the schema
 * round-trip arbitrary block data means template editing doesn't need to know every block shape.
 */
const templateSectionSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().max(200).optional(),
  data: z.unknown().optional(),
});

const patchSchema = z.object({
  isDefault: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  sections: z.array(templateSectionSchema).min(1).max(40).optional(),
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
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "manage templates");
    await ensureBaseRecords();
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) return apiError("Template not found", 404);

    // Editing sections / name / description on a Foundry stock template is blocked. Workspaces
    // duplicate first, then edit the workspace-owned copy. (Set-default is allowed on any
    // template — it's a per-workspace flag, not a stock template mutation.)
    const isWorkspaceOwned = existing.workspaceId !== null;
    const wantsContentEdit =
      body.sections !== undefined || body.name !== undefined || body.description !== undefined;
    if (wantsContentEdit && !isWorkspaceOwned) {
      return apiError("Foundry stock templates are read-only. Duplicate first to edit.", 403);
    }

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
        ...(body.sections !== undefined ? { sections: body.sections as never } : {}),
      },
    });

    return apiOk({ template: updated });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "manage templates");
    await ensureBaseRecords();
    const { id } = await context.params;

    const existing = await prisma.documentTemplate.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!existing) return apiError("Template not found", 404);

    if (existing.workspaceId === null) {
      return apiError("Foundry stock templates cannot be deleted.", 403);
    }

    // Safety: if any documents reference this template, refuse — those docs still need it for
    // any future "create from this template" follow-ups.
    if (existing._count.documents > 0) {
      return apiError(
        `This template is referenced by ${existing._count.documents} document${existing._count.documents === 1 ? "" : "s"}. Delete those first.`,
        409,
      );
    }

    // If this is the default for its type, demote it before deleting so the workspace doesn't
    // end up without a default. The next document of this type will fall back to the Foundry
    // stock default (which is what we want — that's why it exists).
    await prisma.documentTemplate.delete({ where: { id } });

    return apiOk({ deletedId: id });
  } catch (error) {
    return fromError(error);
  }
}
