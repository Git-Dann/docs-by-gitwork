import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { proposalEngagementSchema } from "@/server/validators";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "edit documents");
    const { id } = await context.params;
    const payload = proposalEngagementSchema.parse(await request.json());

    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Proposal not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.link.deleteMany({ where: { documentId: id } });
      await tx.link.createMany({
        data: payload.links.map((link, index) => ({
          documentId: id,
          label: link.label,
          url: link.url,
          type: link.type,
          notes: link.notes,
          sortOrder: link.sortOrder ?? index,
        })),
      });

      await tx.cTA.deleteMany({ where: { documentId: id } });
      await tx.cTA.createMany({
        data: payload.ctas.map((cta, index) => ({
          documentId: id,
          role: cta.role,
          label: cta.label,
          destination: cta.destination,
          destinationType: cta.destinationType,
          sortOrder: cta.sortOrder ?? index,
        })),
      });
    });

    const updated = await prisma.document.findFirst({
      where: {
        id,
      },
      include: proposalInclude,
    });

    if (!updated) {
      return apiError("Proposal not found", 404);
    }

    return apiOk({ proposal: serializeProposal(updated) });
  } catch (error) {
    return fromError(error);
  }
}
