import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { applyClientNameToSections } from "@/lib/apply-client-name";
import { resolveDocumentOwnerName } from "@/lib/document-owner";
import { prisma } from "@/lib/prisma";
import {
  allowedDocTypesForUser,
  assertCan,
  canManageDocs,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
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

    // A duplicate IS a create — it mints a new Document row the caller then owns and can read
    // in full. So it takes the same gate as `POST /api/proposals`: `canManageDocs`, plus the
    // per-doc-type role gate below. `assertCan(null, …)` is a deliberate no-op for trusted
    // API-key-only callers with no per-user identity (see effective-user.ts), so unattended
    // integrations keep working exactly as before.
    const actor = await getEffectiveUserOrNull(request);
    assertCan(actor, canManageDocs, "create documents");

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
    //
    // Scoped to the caller's workspace (the `where: { id, workspaceId }` convention used across
    // the server layer — feature-blocks, milestones, backstage, absences). Without it a bare id
    // was enough to clone ANY document in the database: the clone copies the source's sections,
    // costing, parties and signature blocks into a row the caller then owns and can read in full.
    // An out-of-workspace id now 404s. Identity-less API-key callers have no workspace to scope
    // to, so they stay unscoped — same position as `POST /api/proposals`, which writes into the
    // bootstrap/default workspace for exactly that case.
    const existing = await prisma.document.findFirst({
      where: { id, ...(actor ? { workspaceId: actor.workspaceId } : {}) },
      include: proposalInclude,
    });

    if (!existing) {
      return apiError("Document not found", 404);
    }

    // Type gate: a developer must never clone an admin doc type — that would launder the
    // `POST /api/proposals` type check ("You don't have permission to create that document
    // type") into a copy they own. 404 rather than 403, mirroring the GET/PATCH/favorite reads,
    // so the document's existence isn't leaked.
    if (actor && !allowedDocTypesForUser(actor).includes(existing.documentType)) {
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

    // Carry the section payload from the original, sanitizing any signature payload
    // and signed status so the duplicate copy always starts in a clean, unsigned state.
    const carriedSections = existing.sections.map((section, index) => {
      let data = section.data;
      if (section.key === "signatures" && data && typeof data === "object") {
        const sigData = data as { blocks?: Array<Record<string, unknown>> };
        if (Array.isArray(sigData.blocks)) {
          data = {
            ...sigData,
            blocks: sigData.blocks.map((b) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { signed, signaturePayload, signedName, signatureDate, ...rest } = b;
              return {
                ...rest,
                signed: false,
                signaturePayload: undefined,
                signedName: undefined,
                signatureDate: "",
              };
            }),
          };
        }
      }
      return {
        key: section.key,
        title: section.title,
        description: section.description,
        sortOrder: index,
        isVisible: section.isVisible,
        data,
      };
    });
    const sectionsForClone = renameClient
      ? applyClientNameToSections(carriedSections, effectiveClientName)
      : carriedSections;

    // Build the clone title: keep the original's name when carrying over the same client, but
    // for a fresh-client clone use a more useful default that surfaces the new client name.
    const cloneTitle = renameClient
      ? `${existing.title.replace(/ \(Copy\)$/, "")} — ${effectiveClientName}`
      : `${existing.title} (Copy)`;

    // A duplicate is a NEW document, so it's "prepared by" whoever cloned it — not the author
    // of the original and never the default workspace owner. `actor` was resolved at the top of
    // the handler; `getEffectiveUserOrNull` (not the throwing variant) keeps unattended API-key
    // callers working: with no per-user identity we carry the original's owner across exactly as
    // before. Editable afterwards.
    const carriedMetadata = (existing.metadata ?? null) as Record<string, unknown> | null;
    const clonedOwner = resolveDocumentOwnerName(
      actor,
      typeof carriedMetadata?.owner === "string" ? carriedMetadata.owner : null,
    );
    const cleanedMetadata = carriedMetadata
      ? ({
          ...carriedMetadata,
          owner: clonedOwner,
          productSignOff: false,
          techSignOff: false,
          approvalChecked: false,
        } as unknown as Prisma.InputJsonValue)
      : clonedOwner
        ? ({ owner: clonedOwner } as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    const duplicate = await prisma.document.create({
      data: {
        workspaceId: existing.workspaceId,
        ownerId: actor?.id ?? existing.ownerId,
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
        metadata: cleanedMetadata,
        // A DECK's content is its slides, not its sections — without this the copy
        // arrives empty and, because metadata.deckTemplate came along, the Deck app
        // would helpfully rebuild it FROM THE TEMPLATE on first open. "Duplicate"
        // would silently hand back a blank starter instead of a copy of the work.
        deckDoc: (existing.deckDoc as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
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
