import { DocumentStatus, DocumentType, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { applyClientNameToSections } from "@/lib/apply-client-name";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { TEMPLATE_SLUG_BY_TYPE, getTemplateBlueprintsForType } from "@/lib/templates";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { allocateDocumentNumber } from "@/server/documents";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  getDefaultAssetPayload,
  getDefaultCostsPayload,
  getDefaultCtaPayload,
  getDefaultLinkPayload,
  getDefaultSectionPayload,
  getDefaultTimelinePayload,
  proposalInclude,
  proposalListSelect,
  serializeProposal,
  serializeProposalListItem,
} from "@/server/proposals";
import { proposalCreateSchema } from "@/server/validators";

export async function GET(request: NextRequest) {
  try {
    await ensureBaseRecords();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status")?.trim();
    const sort = searchParams.get("sort")?.trim() ?? "updatedAt:desc";
    // documentType: absent/"PROPOSAL" → proposals only (default; web unchanged),
    // "ALL" → every type, a specific type → just that type. iOS passes ALL to
    // populate the cross-type Docs library.
    const typeParam = searchParams.get("documentType")?.trim().toUpperCase();
    const allowedTypes = new Set<string>(Object.values(DocumentType));
    const typeFilter =
      !typeParam || typeParam === "PROPOSAL"
        ? "PROPOSAL"
        : typeParam === "ALL"
          ? undefined
          : allowedTypes.has(typeParam)
            ? (typeParam as DocumentType)
            : null;
    // Unknown type → 400 (not a leaked Prisma 500).
    if (typeFilter === null) return apiError("Invalid documentType.", 400);

    const [sortField, sortDirectionRaw] = sort.split(":");
    const sortDirection = sortDirectionRaw === "asc" ? "asc" : "desc";

    const where: Prisma.DocumentWhereInput = {
      ...(typeFilter ? { documentType: typeFilter } : {}),
      ...(status && status !== "ALL" ? { status: status as DocumentStatus } : {}),
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                clientName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                productName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.DocumentOrderByWithRelationInput =
      sortField === "title"
        ? {
            title: sortDirection,
          }
        : {
            updatedAt: sortDirection,
          };

    const documents = await prisma.document.findMany({
      where,
      orderBy,
      select: proposalListSelect,
    });

    return apiOk({
      proposals: documents.map((document) => serializeProposalListItem(document)),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "create documents");
    const body = proposalCreateSchema.parse(await request.json());
    const { workspace, user, template } = await ensureBaseRecords();

    // Resolve the document type for this new record. Defaults to PROPOSAL so existing callers
    // (the legacy "New document" flow that only knew about proposals) keep working unchanged.
    const documentType: DocumentType = (body.documentType as DocumentType) ?? "PROPOSAL";

    // Pick the template: if the caller passed an explicit templateId, honour it; otherwise look
    // up the default template for this doc type (seeded by bootstrap), falling back to the
    // proposal template if the per-type seed is missing.
    let selectedTemplate = body.templateId
      ? await prisma.documentTemplate.findFirst({
          where: { id: body.templateId, workspaceId: workspace.id },
        })
      : await prisma.documentTemplate.findFirst({
          where: { slug: TEMPLATE_SLUG_BY_TYPE[documentType] },
        });

    if (!selectedTemplate) {
      // Fall back to the (always-present) proposal template if we couldn't find a doc-type
      // specific one. Keeps the API call non-throwing even before bootstrap runs.
      selectedTemplate = template;
    }

    // Build the section + child-row payloads. Priority order:
    //   1. If the picked template has a non-empty `sections` Json (e.g. workspace-owned templates
    //      edited via Settings → Templates), use those — that's the user's hand-curated content.
    //   2. Otherwise fall back to the hardcoded blueprint for this doc type. For PROPOSAL that
    //      means `getDefaultSectionPayload()`; for the contract types it's the blueprint module
    //      in `src/lib/templates/{type}.ts`.
    const templateSections =
      selectedTemplate?.sections && Array.isArray(selectedTemplate.sections)
        ? (selectedTemplate.sections as Array<{
            key: string;
            title: string;
            description?: string | null;
            sortOrder?: number;
            isVisible?: boolean;
            data: unknown;
          }>)
        : null;

    let sectionsCreate: Prisma.DocumentSectionCreateWithoutDocumentInput[];

    if (templateSections && templateSections.length > 0) {
      sectionsCreate = templateSections.map((section, index) => ({
        key: section.key,
        title: section.title,
        description: section.description ?? null,
        sortOrder: section.sortOrder ?? index,
        isVisible: section.isVisible ?? true,
        data: (section.data ?? {}) as Prisma.InputJsonValue,
      }));
    } else if (documentType === "PROPOSAL") {
      sectionsCreate = getDefaultSectionPayload();
    } else {
      const blueprints = getTemplateBlueprintsForType(documentType);
      sectionsCreate = blueprints.map((blueprint, index) => ({
        key: blueprint.key,
        title: blueprint.title,
        description: blueprint.description,
        sortOrder: index,
        isVisible: blueprint.visible ?? true,
        data: blueprint.data as unknown as Prisma.InputJsonValue,
      }));
    }

    // Propagate the client name through every section that references it (cover, parties,
    // signatures). Without this the operator would have to retype the same name 3-4 times per
    // clone. No-op when clientName is empty.
    sectionsCreate = applyClientNameToSections(sectionsCreate, body.clientName) as typeof sectionsCreate;

    // Only proposals start with stocked timeline phases / cost line items / CTAs / links / assets.
    // For SLA/SOW the cover + section blueprints carry everything; we leave the child collections
    // empty so the editor doesn't show inherited proposal junk.
    const isProposal = documentType === "PROPOSAL";

    // Allocate a workspace-scoped, year-scoped, type-prefixed document number
    // (e.g. PROP-2026-014, SLA-2026-003, SOW-2026-007) before creating the row.
    const documentNumber = await allocateDocumentNumber(workspace.id, documentType);

    const document = await prisma.document.create({
      data: {
        workspaceId: workspace.id,
        ownerId: user.id,
        templateId: selectedTemplate?.id,
        documentType,
        documentNumber,
        status: "DRAFT",
        title: body.title,
        productName: body.productName,
        clientName: body.clientName,
        clientId: body.clientId ?? null,
        summary: "",
        version: "v1.0",
        metadata: {
          ...DEFAULT_PROPOSAL_METADATA,
          client: body.clientName ?? DEFAULT_PROPOSAL_METADATA.client,
          owner: user.name ?? DEFAULT_PROPOSAL_METADATA.owner,
        },
        sections: { create: sectionsCreate },
        costLineItems: isProposal ? { create: getDefaultCostsPayload() } : undefined,
        timelinePhases: isProposal ? { create: getDefaultTimelinePayload() } : undefined,
        links: isProposal ? { create: getDefaultLinkPayload() } : undefined,
        ctas: isProposal ? { create: getDefaultCtaPayload() } : undefined,
        assets: isProposal ? { create: getDefaultAssetPayload() } : undefined,
      },
      include: proposalInclude,
    });

    return apiOk({ proposal: serializeProposal(document) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
