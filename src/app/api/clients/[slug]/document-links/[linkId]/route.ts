import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteClientDocumentLink, updateClientDocumentLink } from "@/server/clients";
import { clientDocumentLinkUpdateSchema } from "@/server/validators";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; linkId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, linkId } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    const body = clientDocumentLinkUpdateSchema.parse(await request.json());
    const link = await updateClientDocumentLink(linkId, body);

    if (!link) {
      return Response.json({ error: "Document link not found" }, { status: 404 });
    }

    return apiOk({ link });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { slug, linkId } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    await deleteClientDocumentLink(linkId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
