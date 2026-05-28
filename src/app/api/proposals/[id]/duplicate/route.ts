import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { allocateDocumentNumber } from "@/server/documents";
import { proposalInclude, serializeProposal } from "@/server/proposals";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await prisma.document.findFirst({
      where: {
        id,
        documentType: "PROPOSAL",
      },
      include: proposalInclude,
    });

    if (!existing) {
      return apiError("Proposal not found", 404);
    }

    // Duplicate gets its own fresh number — sharing the original's number would break the
    // unique constraint and confuse anyone tracing the audit trail.
    const documentNumber = await allocateDocumentNumber(
      existing.workspaceId,
      existing.documentType,
    );

    const duplicate = await prisma.document.create({
      data: {
        workspaceId: existing.workspaceId,
        ownerId: existing.ownerId,
        templateId: existing.templateId,
        documentType: existing.documentType,
        documentNumber,
        status: "DRAFT",
        title: `${existing.title} (Copy)`,
        productName: existing.productName,
        clientName: existing.clientName,
        summary: existing.summary,
        version: existing.version,
        expiresAt: existing.expiresAt,
        metadata: (existing.metadata as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        exportSettings:
          (existing.exportSettings as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        sections: {
          create: existing.sections.map((section, index) => ({
            key: section.key,
            title: section.title,
            description: section.description,
            sortOrder: index,
            isVisible: section.isVisible,
            data: section.data as unknown as Prisma.InputJsonValue,
          })),
        },
        costLineItems: {
          create: existing.costLineItems.map((item, index) => ({
            category: item.category,
            itemName: item.itemName,
            description: item.description,
            quantity: item.quantity,
            unitCost: item.unitCost,
            subtotal: item.subtotal,
            costKind: item.costKind,
            sortOrder: index,
          })),
        },
        timelinePhases: {
          create: existing.timelinePhases.map((phase, index) => ({
            name: phase.name,
            duration: phase.duration,
            summary: phase.summary,
            deliverables: phase.deliverables as unknown as Prisma.InputJsonValue,
            sortOrder: index,
            viewMode: phase.viewMode,
          })),
        },
        assets: {
          create: existing.assets.map((asset, index) => ({
            type: asset.type,
            title: asset.title,
            url: asset.url,
            altText: asset.altText,
            placement: asset.placement,
            caption: asset.caption,
            size: asset.size,
            alignment: asset.alignment,
            sortOrder: index,
          })),
        },
        links: {
          create: existing.links.map((link, index) => ({
            label: link.label,
            url: link.url,
            type: link.type,
            notes: link.notes,
            sortOrder: index,
          })),
        },
        ctas: {
          create: existing.ctas.map((cta, index) => ({
            role: cta.role,
            label: cta.label,
            destination: cta.destination,
            destinationType: cta.destinationType,
            sortOrder: index,
          })),
        },
      },
      include: proposalInclude,
    });

    return apiOk({ proposal: serializeProposal(duplicate) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
