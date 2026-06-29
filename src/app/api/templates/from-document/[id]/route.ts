/**
 * POST /api/templates/from-document/[id]
 *
 * Capture a document's current sections + metadata into a new workspace-owned DocumentTemplate.
 * The new template is non-default for its type — promoting it to default is a separate action
 * in the Templates tab.
 *
 * Body: { name: string, description?: string }
 */

import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "manage templates");
    const { id } = await context.params;
    const body = schema.parse(await request.json());

    const doc = await prisma.document.findUnique({
      where: { id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!doc) return apiError("Document not found", 404);

    // Build the sections payload — same shape as bootstrap's seeded templates.
    const sections = doc.sections.map((s, index) => ({
      key: s.key,
      title: s.title,
      description: s.description,
      sortOrder: index,
      isVisible: s.isVisible,
      data: s.data,
    }));

    const slug = `from-doc-${id.slice(0, 6)}-${randomBytes(3).toString("hex")}`;

    const template = await prisma.documentTemplate.create({
      data: {
        workspaceId: doc.workspaceId,
        name: body.name.trim(),
        slug,
        description: body.description?.trim() || `Saved from ${doc.title}`,
        documentType: doc.documentType,
        sections: sections as unknown as Prisma.InputJsonValue,
        metadata: (doc.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        isDefault: false,
      },
    });

    return apiOk({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
