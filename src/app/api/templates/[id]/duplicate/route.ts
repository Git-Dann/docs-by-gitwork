/**
 * POST /api/templates/[id]/duplicate
 *
 * Creates a workspace-owned copy of an existing template. Default → not default (the original
 * stays default for the type so existing flows are unaffected). Slug is suffixed with a short
 * random tail to avoid the @unique collision.
 */

import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspace } = await ensureBaseRecords();

    const source = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!source) return apiError("Template not found", 404);

    const slugSuffix = randomBytes(3).toString("hex"); // 6-char ASCII
    const newSlug = `${source.slug}-copy-${slugSuffix}`;

    // Prisma's create input for a required Json field expects `InputJsonValue` (anything
    // non-null). The Json type system can't infer that `source.sections as Prisma.JsonValue`
    // is safe to round-trip, so we cast through unknown.
    const duplicate = await prisma.documentTemplate.create({
      data: {
        workspaceId: workspace.id,
        name: `${source.name} (copy)`,
        slug: newSlug,
        description: source.description,
        documentType: source.documentType,
        sections: source.sections as unknown as object,
        metadata:
          source.metadata === null
            ? undefined
            : (source.metadata as unknown as object),
        isDefault: false,
      },
    });

    return apiOk({ template: duplicate }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
