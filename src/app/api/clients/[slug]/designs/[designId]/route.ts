import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteClientDesign, updateClientDesign } from "@/server/clients";
import { clientDesignUpdateSchema } from "@/server/validators";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; designId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, designId } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    const body = clientDesignUpdateSchema.parse(await request.json());
    const design = await updateClientDesign(designId, body);

    if (!design) {
      return Response.json({ error: "Design not found" }, { status: 404 });
    }

    return apiOk({ design });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { slug, designId } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    await deleteClientDesign(designId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
