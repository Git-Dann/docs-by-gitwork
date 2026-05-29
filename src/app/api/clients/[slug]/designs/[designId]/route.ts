import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteClientDesign, updateClientDesign } from "@/server/clients";
import { clientDesignUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; designId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { designId } = await context.params;
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { designId } = await context.params;
    await deleteClientDesign(designId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
