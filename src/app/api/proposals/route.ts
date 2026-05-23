import { DocumentStatus, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  getDefaultAssetPayload,
  getDefaultCostsPayload,
  getDefaultCtaPayload,
  getDefaultLinkPayload,
  getDefaultSectionPayload,
  getDefaultTimelinePayload,
  proposalInclude,
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

    const [sortField, sortDirectionRaw] = sort.split(":");
    const sortDirection = sortDirectionRaw === "asc" ? "asc" : "desc";

    const where: Prisma.DocumentWhereInput = {
      documentType: "PROPOSAL",
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
      include: {
        template: {
          select: {
            name: true,
          },
        },
        owner: {
          select: {
            name: true,
          },
        },
      },
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
    const body = proposalCreateSchema.parse(await request.json());
    const { workspace, user, template } = await ensureBaseRecords();

    const selectedTemplate = body.templateId
      ? await prisma.documentTemplate.findFirst({
          where: {
            id: body.templateId,
            workspaceId: workspace.id,
          },
        })
      : template;

    const document = await prisma.document.create({
      data: {
        workspaceId: workspace.id,
        ownerId: user.id,
        templateId: selectedTemplate?.id,
        documentType: "PROPOSAL",
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
        sections: {
          create: getDefaultSectionPayload(),
        },
        costLineItems: {
          create: getDefaultCostsPayload(),
        },
        timelinePhases: {
          create: getDefaultTimelinePayload(),
        },
        links: {
          create: getDefaultLinkPayload(),
        },
        ctas: {
          create: getDefaultCtaPayload(),
        },
        assets: {
          create: getDefaultAssetPayload(),
        },
      },
      include: proposalInclude,
    });

    return apiOk({ proposal: serializeProposal(document) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
