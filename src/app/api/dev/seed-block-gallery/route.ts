import { Prisma } from "@prisma/client";
import { apiOk, fromError } from "@/lib/api-response";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { prisma } from "@/lib/prisma";
import { assertSuperAdminOrApiKey, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { ensureBaseRecords } from "@/server/bootstrap";
import { allocateDocumentNumber } from "@/server/documents";
import {
  BLOCK_GALLERY_COSTS,
  BLOCK_GALLERY_PHASES,
  BLOCK_GALLERY_TITLE,
  buildBlockGallery,
} from "@/server/documents/block-gallery";
import { proposalInclude, serializeProposal } from "@/server/proposals";

export const dynamic = "force-dynamic";

/**
 * Create the block gallery — one real document containing every block Docs can render.
 *
 * It is a NORMAL document, not a special view: same table, same editor, same PDF, same public
 * share. That is the whole point. A gallery rendered by a bespoke page would prove the blocks
 * work on that page and nothing about the one clients actually receive.
 *
 * Idempotent — it deletes its own previous copy first (matched on the title), so it can be
 * re-run after a block changes without collecting duplicates in the Docs list.
 */
export async function POST(request: Request) {
  try {
    const actor = await getEffectiveUserOrNull(request);
    assertSuperAdminOrApiKey(actor);

    const { workspace, user: workspaceOwner } = await ensureBaseRecords();

    await prisma.document.deleteMany({
      where: { workspaceId: workspace.id, title: BLOCK_GALLERY_TITLE },
    });

    const sections = buildBlockGallery();
    const documentNumber = await allocateDocumentNumber(workspace.id, "PROPOSAL");

    const document = await prisma.document.create({
      data: {
        workspaceId: workspace.id,
        ownerId: actor?.id ?? workspaceOwner.id,
        documentType: "PROPOSAL",
        documentNumber,
        status: "DRAFT",
        title: BLOCK_GALLERY_TITLE,
        productName: "Foundry Docs",
        clientName: "Northwind Labs",
        summary: "Every block Docs can render, with sample content.",
        version: "v1.0",
        metadata: { ...DEFAULT_PROPOSAL_METADATA, client: "Northwind Labs" },
        sections: {
          create: sections.map((section) => ({
            key: section.key,
            title: section.title,
            description: section.description ?? null,
            sortOrder: section.sortOrder,
            isVisible: section.isVisible,
            data: section.data as unknown as Prisma.InputJsonValue,
          })),
        },
        // `costing` and `timeline` render THESE, not their own data — without them both blocks
        // would be in the gallery and blank on the page.
        costLineItems: {
          create: BLOCK_GALLERY_COSTS.map((item) => ({
            category: item.category,
            itemName: item.itemName,
            description: item.description,
            quantity: new Prisma.Decimal(item.quantity),
            unitCost: new Prisma.Decimal(item.unitCost),
            subtotal: new Prisma.Decimal(item.subtotal),
            costKind: item.costKind,
            sortOrder: item.sortOrder,
          })),
        },
        timelinePhases: {
          create: BLOCK_GALLERY_PHASES.map((phase) => ({
            name: phase.name,
            duration: phase.duration,
            summary: phase.summary,
            deliverables: phase.deliverables,
            sortOrder: phase.sortOrder,
            viewMode: phase.viewMode,
          })),
        },
      },
      include: proposalInclude,
    });

    return apiOk(
      {
        proposal: serializeProposal(document),
        blockCount: sections.length,
        href: `/app/docs/${document.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return fromError(error);
  }
}
