import { NextRequest } from "next/server";
import { assertCan, canViewDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { originFrom } from "@/lib/request-origin";
import {
  createProofAccessToken,
  createProofSlug,
  createProofUrls,
  proofDocumentInclude,
  serializeProofDocument,
} from "@/server/proof";
import { proofCreateSchema } from "@/server/validators";
import { requestActor, workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canViewDocs, "list proof documents");
    const workspace = { id: await workspaceIdForRequest(request) };
    const proposalId = request.nextUrl.searchParams.get("proposalId")?.trim();

    const documents = await prisma.proofDocument.findMany({
      where: {
        workspaceId: workspace.id,
        archivedAt: null,
        ...(proposalId ? { proposalId } : {}),
      },
      orderBy: {
        lastOpenedAt: "desc",
      },
      include: proofDocumentInclude,
    });

    return apiOk({
      documents: documents.map((document) => serializeProofDocument(document)),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = proofCreateSchema.parse(await request.json());
    const { workspace, user } = await requestActor(request);
    const slug = createProofSlug(body.title);
    const accessToken = createProofAccessToken();
    const { shareUrl, tokenUrl } = createProofUrls(originFrom(request), slug, accessToken);

    const document = await prisma.proofDocument.create({
      data: {
        workspaceId: workspace.id,
        ownerId: user.id,
        proposalId: body.proposalId ?? null,
        title: body.title,
        markdown: body.markdown ?? null,
        slug,
        shareUrl,
        tokenUrl,
        accessToken,
      },
      include: proofDocumentInclude,
    });

    return apiOk({ document: serializeProofDocument(document) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
