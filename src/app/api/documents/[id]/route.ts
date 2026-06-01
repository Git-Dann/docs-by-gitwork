import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { proposalUpdateSchema } from "@/server/validators";

/**
 * Generic, type-agnostic document read/write.
 *
 * `/api/proposals/[id]` is hardcoded to `documentType: "PROPOSAL"`, so it can't
 * serve SLA / SOW / MSA / NDA / CO / DSA documents. These endpoints work for ANY
 * document type — used by the iOS native document editor (read + write parity
 * with the web). The serialization + section/child upsert logic mirrors the
 * proposals route exactly; only the PROPOSAL filter is dropped.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const document = await prisma.document.findFirst({
      where: { id },
      include: proposalInclude,
    });

    if (!document) {
      return apiError("Document not found", 404);
    }

    return apiOk({ proposal: serializeProposal(document) });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = proposalUpdateSchema.parse(await request.json());

    const existing = await prisma.document.findFirst({
      where: { id },
      include: { sections: true },
    });

    if (!existing) {
      return apiError("Document not found", 404);
    }

    // Edit lock when out for signature — matches the proposals route. A SENT
    // document is mid-signature; only allow a status flip (e.g. revoke).
    if (existing.status === "SENT") {
      const flippingStatusOnly =
        payload.status &&
        payload.status !== "SENT" &&
        Object.keys(payload).every((k) => k === "status");
      if (!flippingStatusOnly) {
        return apiError(
          "This document is out for signature. Revoke the signature request before editing.",
          423,
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: {
          title: payload.title,
          status: payload.status,
          productName: payload.productName,
          clientName: payload.clientName,
          summary: payload.summary,
          version: payload.version,
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : payload.expiresAt,
          // Only touch metadata when the client actually sends it. An omitted
          // metadata must NOT clobber saved values (notes / sign-off flags / client
          // / version) with template defaults — clients like iOS PATCH only
          // {title, status, sections}. Defaults are base-only; existing + payload win.
          ...(payload.metadata !== undefined
            ? {
                metadata: {
                  ...DEFAULT_PROPOSAL_METADATA,
                  ...(existing.metadata as Record<string, unknown> | null),
                  ...payload.metadata,
                },
              }
            : {}),
          exportSettings: payload.exportSettings as unknown as Prisma.InputJsonValue | undefined,
          labels:
            payload.labels !== undefined
              ? (payload.labels as unknown as Prisma.InputJsonValue)
              : undefined,
          parentId: payload.parentId === undefined ? undefined : payload.parentId,
        },
      });

      if (payload.sections) {
        await tx.documentSection.deleteMany({ where: { documentId: id } });
        await tx.documentSection.createMany({
          data: payload.sections.map((section, index) => ({
            documentId: id,
            key: section.key,
            title: section.title,
            description: section.description,
            sortOrder: section.sortOrder ?? index,
            isVisible: section.isVisible,
            data: section.data as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      if (payload.costLineItems) {
        await tx.costLineItem.deleteMany({ where: { documentId: id } });
        await tx.costLineItem.createMany({
          data: payload.costLineItems.map((item, index) => ({
            id: item.id,
            documentId: id,
            category: item.category,
            itemName: item.itemName,
            description: item.description,
            quantity: new Prisma.Decimal(item.quantity),
            unitCost: new Prisma.Decimal(item.unitCost),
            subtotal: new Prisma.Decimal(item.subtotal ?? item.quantity * item.unitCost),
            costKind: item.costKind,
            sortOrder: item.sortOrder ?? index,
          })),
        });
      }

      if (payload.timelinePhases) {
        await tx.timelinePhase.deleteMany({ where: { documentId: id } });
        await tx.timelinePhase.createMany({
          data: payload.timelinePhases.map((phase, index) => ({
            documentId: id,
            name: phase.name,
            duration: phase.duration,
            summary: phase.summary,
            deliverables: phase.deliverables as unknown as Prisma.InputJsonValue,
            sortOrder: phase.sortOrder ?? index,
            viewMode: phase.viewMode,
          })),
        });
      }

      if (payload.links) {
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
      }

      if (payload.ctas) {
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
      }

      if (payload.assets) {
        await tx.asset.deleteMany({ where: { documentId: id } });
        await tx.asset.createMany({
          data: payload.assets.map((asset, index) => ({
            documentId: id,
            sectionId: asset.sectionId,
            type: asset.type,
            title: asset.title,
            url: asset.url,
            altText: asset.altText,
            placement: asset.placement,
            caption: asset.caption,
            size: asset.size,
            alignment: asset.alignment,
            sortOrder: asset.sortOrder ?? index,
          })),
        });
      }
    });

    const updated = await prisma.document.findFirst({
      where: { id },
      include: proposalInclude,
    });

    if (!updated) {
      return apiError("Document not found after update", 404);
    }

    return apiOk({ proposal: serializeProposal(updated) });
  } catch (error) {
    return fromError(error);
  }
}
