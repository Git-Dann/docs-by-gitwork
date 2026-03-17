import { DocumentType, Prisma } from "@prisma/client";
import { DEFAULT_PROPOSAL_METADATA, getDefaultProposalSections } from "@/lib/default-template";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TEMPLATE_SLUG,
  DEFAULT_USER_EMAIL,
  DEFAULT_WORKSPACE_SLUG,
} from "@/server/proposals";

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

  return {
    user,
    workspace,
    template,
  };
}
