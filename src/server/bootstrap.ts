import { DocumentType, Prisma } from "@prisma/client";
import { DEFAULT_PROPOSAL_METADATA, getDefaultProposalSections } from "@/lib/default-template";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TEMPLATE_SLUG,
  DEFAULT_USER_EMAIL,
  DEFAULT_WORKSPACE_SLUG,
  getDefaultAssetPayload,
  getDefaultCostsPayload,
  getDefaultCtaPayload,
  getDefaultLinkPayload,
  getDefaultSectionPayload,
  getDefaultTimelinePayload,
} from "@/server/proposals";
import { getDefaultRateCardPeoplePayload } from "@/server/rate-card";

export async function ensureBaseRecords() {
  const user = await prisma.user.upsert({
    where: {
      email: DEFAULT_USER_EMAIL,
    },
    update: {},
    create: {
      email: DEFAULT_USER_EMAIL,
      name: "Gitwork Owner",
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      slug: DEFAULT_WORKSPACE_SLUG,
    },
    update: {},
    create: {
      slug: DEFAULT_WORKSPACE_SLUG,
      name: "Gitwork",
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
      slug: DEFAULT_TEMPLATE_SLUG,
      name: "Gitwork Proposal Template",
      description: "Default structured proposal template for Docs by Gitwork.",
      documentType: DocumentType.PROPOSAL,
      sections: getDefaultProposalSections() as unknown as Prisma.InputJsonValue,
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
  });

  await prisma.rateCardPerson.createMany({
    data: getDefaultRateCardPeoplePayload(workspace.id),
    skipDuplicates: true,
  });

  await ensureSampleProposal({ workspace, user, template });

  return {
    user,
    workspace,
    template,
  };
}

async function ensureSampleProposal({
  workspace,
  user,
  template,
}: {
  workspace: { id: string };
  user: { id: string; name: string | null };
  template: { id: string };
}) {
  const count = await prisma.document.count({
    where: { workspaceId: workspace.id, documentType: "PROPOSAL" },
  });

  if (count > 0) {
    return;
  }

  await prisma.document.create({
    data: {
      workspaceId: workspace.id,
      ownerId: user.id,
      templateId: template.id,
      documentType: "PROPOSAL",
      status: "DRAFT",
      title: "Docs by Gitwork — Sample Proposal",
      productName: "Proposal Builder",
      clientName: "Acme Health",
      summary: "",
      version: "v1.0",
      metadata: {
        ...DEFAULT_PROPOSAL_METADATA,
        client: "Acme Health",
        owner: user.name ?? DEFAULT_PROPOSAL_METADATA.owner,
      } as unknown as Prisma.InputJsonValue,
      sections: { create: getDefaultSectionPayload() },
      costLineItems: { create: getDefaultCostsPayload() },
      timelinePhases: { create: getDefaultTimelinePayload() },
      links: { create: getDefaultLinkPayload() },
      ctas: { create: getDefaultCtaPayload() },
      assets: { create: getDefaultAssetPayload() },
    },
  });
}
