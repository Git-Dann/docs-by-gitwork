import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { applyClientNameToSections } from "@/lib/apply-client-name";
import { prisma } from "@/lib/prisma";
import { allocateDocumentNumber } from "@/server/documents";
import { proposalInclude, serializeProposal } from "@/server/proposals";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Optional body. The duplicate endpoint takes nothing by default (carries every field over
 * from the original except status + number + isShared). When `clientName` is supplied, the
 * new doc is renamed for that client AND every customer-side section field (cover, parties,
 * signatures) is patched accordingly — turning a one-click duplicate into a real
 * spin-up-a-clone-for-Bravo flow.
 */
const duplicateBodySchema = z
  .object({
    clientName: z.string().min(1).max(200).optional(),
  })
  .optional();

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Accept an optional body. Empty body → exact clone. Body with clientName → rename + patch.
    let body: z.infer<typeof duplicateBodySchema> = undefined;
    try {
      const raw = await request.json();
      body = duplicateBodySchema.parse(raw);
    } catch {
      // No body or unparseable body: treat as a plain duplicate. The downstream code defaults
      // to inheriting the original's clientName.
    }

    // Doc-type-agnostic lookup — the endpoint sits under /api/proposals/ for legacy reasons
    // but supports every contract type (SLA / SOW / MSA / NDA / CO / DSA / OTHER) too.
    const existing = await prisma.document.findFirst({
      where: { id },
      include: proposalInclude,
    });

    if (!existing) {
      return apiError("Document not found", 404);
    }

    // Resolve the effective client name for the clone:
    //   - explicit override in the body, OR
    //   - carry forward from the original.
    const effectiveClientName = body?.clientName?.trim() || existing.clientName || null;
    const renameClient = Boolean(
      body?.clientName && body.clientName.trim() && body.clientName.trim() !== existing.clientName,
    );

    // Duplicate gets its own fresh number — sharing the original's number would break the
    // unique constraint and confuse anyone tracing the audit trail.
    const documentNumber = await allocateDocumentNumber(
      existing.workspaceId,
      existing.documentType,
    );

    // Carry the section payload from the original, then — if the operator asked to swap the
    // client — propagate the new name into cover / parties / signatures.
    const carriedSections = existing.sections.map((section, index) => ({
      key: section.key,
      title: section.title,
      description: section.description,
      sortOrder: index,
      isVisible: section.isVisible,
      data: section.data,
    }));
    const sectionsForClone = renameClient
      ? applyClientNameToSections(carriedSections, effectiveClientName)
      : carriedSections;

    // Build the clone title: keep the original's name when carrying over the same client, but
    // for a fresh-client clone use a more useful default that surfaces the new client name.
    const cloneTitle = renameClient
      ? `${existing.title.replace(/ \(Copy\)$/, "")} — ${effectiveClientName}`
      : `${existing.title} (Copy)`;

    const duplicate = await prisma.document.create({
      data: {
        workspaceId: existing.workspaceId,
        ownerId: existing.ownerId,
        templateId: existing.templateId,
        documentType: existing.documentType,
        documentNumber,
        status: "DRAFT",
        title: cloneTitle,
        productName: existing.productName,
        clientName: effectiveClientName,
        summary: existing.summary,
        version: existing.version,
        expiresAt: existing.expiresAt,
        metadata: (existing.metadata as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        exportSettings:
          (existing.exportSettings as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        sections: {
          create: sectionsForClone.map((section, index) => ({
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
