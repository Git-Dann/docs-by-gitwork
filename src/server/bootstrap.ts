import { DocumentType, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
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
import { getDefaultCodeClearCandidatePayloads } from "@/server/codeclear";

export async function ensureBaseRecords() {
  const user = await prisma.user.upsert({
    where: {
      email: DEFAULT_USER_EMAIL,
    },
    update: {},
    create: {
      email: DEFAULT_USER_EMAIL,
      name: "Foundry Owner",
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      slug: DEFAULT_WORKSPACE_SLUG,
    },
    update: {},
    create: {
      slug: DEFAULT_WORKSPACE_SLUG,
      name: "Foundry by Gitwork",
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
      role: "ADMIN",
      permissions: [],
    },
  });

  // Create the initial admin account from env vars on first run
  await ensureInitialAdmin(workspace.id);

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
      name: "Foundry Proposal Template",
      description: "Default structured proposal template for Foundry by Gitwork.",
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
  await ensureSampleCodeClearCandidates({ workspace });

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
      title: "Foundry by Gitwork — Sample Proposal",
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

async function ensureSampleCodeClearCandidates({
  workspace,
}: {
  workspace: { id: string };
}) {
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
}

// Creates (or patches) the admin user from INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD.
// Runs on every bootstrap call — idempotent. If the user exists but has no passwordHash
// (e.g. created as a placeholder before auth was added), the hash is set from env vars.
export async function ensureInitialAdmin(workspaceId?: string) {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) return;

  // Resolve workspaceId if not provided
  let wsId = workspaceId;
  if (!wsId) {
    const ws = await prisma.workspace.findFirst({ where: { slug: DEFAULT_WORKSPACE_SLUG } });
    if (!ws) return;
    wsId = ws.id;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Patch passwordHash if it was never set
    if (!existing.passwordHash) {
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.update({ where: { email }, data: { passwordHash } });
    }
    // Ensure membership exists
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: wsId, userId: existing.id } },
      update: {},
      create: { workspaceId: wsId, userId: existing.id, role: "ADMIN", permissions: [] },
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: { email, name: email.split("@")[0], passwordHash },
  });

  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, userId: admin.id, role: "ADMIN", permissions: [] },
  });
}
