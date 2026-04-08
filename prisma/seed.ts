import { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_PROPOSAL_METADATA,
  defaultAssets,
  defaultCostLineItems,
  defaultCtas,
  defaultLinks,
  defaultTimelinePhases,
  getDefaultProposalSections,
} from "../src/lib/default-template";
import { getDefaultRateCardPeoplePayload } from "../src/server/rate-card";
import { getDefaultCodeClearCandidatePayloads } from "../src/server/codeclear";

const prisma = new PrismaClient();

const DEFAULT_USER_EMAIL = "owner@gitwork.io";
const DEFAULT_WORKSPACE_SLUG = "gitwork";
const DEFAULT_TEMPLATE_SLUG = "gitwork-proposal-template";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: {
      email: DEFAULT_USER_EMAIL,
      name: "Gitwork Owner",
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    update: {},
    create: {
      name: "Gitwork",
      slug: DEFAULT_WORKSPACE_SLUG,
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  await prisma.rateCardPerson.createMany({
    data: getDefaultRateCardPeoplePayload(workspace.id),
    skipDuplicates: true,
  });

  const rateCardPeople = await prisma.rateCardPerson.findMany({
    where: {
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      seedIdentifier: true,
      name: true,
      area: true,
    },
  });

  const candidates = getDefaultCodeClearCandidatePayloads(workspace.id, rateCardPeople);
  const existingHandles = new Set(
    (
      await prisma.candidate.findMany({
        where: {
          workspaceId: workspace.id,
          githubHandle: {
            in: candidates.map((candidate) => candidate.githubHandle),
          },
        },
        select: {
          githubHandle: true,
        },
      })
    ).map((candidate) => candidate.githubHandle),
  );

  for (const candidate of candidates) {
    if (existingHandles.has(candidate.githubHandle)) {
      continue;
    }

    await prisma.candidate.create({
      data: candidate,
    });
  }

  const template = await prisma.documentTemplate.upsert({
    where: {
      slug: DEFAULT_TEMPLATE_SLUG,
    },
    update: {
      sections: getDefaultProposalSections() as unknown as Prisma.InputJsonValue,
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
    create: {
      workspaceId: workspace.id,
      name: "Gitwork Proposal Template",
      slug: DEFAULT_TEMPLATE_SLUG,
      description: "Default proposal template for Docs by Gitwork.",
      documentType: "PROPOSAL",
      sections: getDefaultProposalSections() as unknown as Prisma.InputJsonValue,
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
  });

  const existing = await prisma.document.findFirst({
    where: {
      workspaceId: workspace.id,
      title: "Docs by Gitwork - Proposal Builder MVP",
      status: {
        not: "ARCHIVED",
      },
    },
  });

  if (existing) {
    return;
  }

  await prisma.document.create({
    data: {
      workspaceId: workspace.id,
      ownerId: user.id,
      templateId: template.id,
      documentType: "PROPOSAL",
      status: "DRAFT",
      title: "Docs by Gitwork - Proposal Builder MVP",
      productName: "Docs by Gitwork",
      clientName: "Acme Health",
      summary:
        "Structured proposal builder with live preview, costing, timeline, and export-ready output.",
      version: "v1.0",
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      sections: {
        create: getDefaultProposalSections().map((section, index) => ({
          key: section.key,
          title: section.title,
          description: section.description,
          sortOrder: section.sortOrder ?? index,
          isVisible: section.isVisible,
          data: section.data as unknown as Prisma.InputJsonValue,
        })),
      },
      costLineItems: {
        create: defaultCostLineItems.map((item, index) => ({
          category: item.category,
          itemName: item.itemName,
          description: item.description,
          quantity: new Prisma.Decimal(item.quantity),
          unitCost: new Prisma.Decimal(item.unitCost),
          subtotal: new Prisma.Decimal(item.subtotal),
          costKind: item.costKind,
          sortOrder: item.sortOrder ?? index,
        })),
      },
      timelinePhases: {
        create: defaultTimelinePhases.map((phase, index) => ({
          name: phase.name,
          duration: phase.duration,
          summary: phase.summary,
          deliverables: phase.deliverables as unknown as Prisma.InputJsonValue,
          sortOrder: phase.sortOrder ?? index,
          viewMode: phase.viewMode,
        })),
      },
      links: {
        create: defaultLinks.map((link, index) => ({
          label: link.label,
          url: link.url,
          type: link.type,
          notes: link.notes,
          sortOrder: link.sortOrder ?? index,
        })),
      },
      ctas: {
        create: defaultCtas.map((cta, index) => ({
          role: cta.role,
          label: cta.label,
          destination: cta.destination,
          destinationType: cta.destinationType,
          sortOrder: cta.sortOrder ?? index,
        })),
      },
      assets: {
        create: defaultAssets.map((asset, index) => ({
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
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
