import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createClientDesign, getClientIdBySlug } from "@/server/clients";
import { ensureBaseRecords } from "@/server/bootstrap";
import { clientDesignCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const { workspace } = await ensureBaseRecords();
    const clientId = await getClientIdBySlug(workspace.id, slug);

    if (!clientId) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }

    const body = clientDesignCreateSchema.parse(await request.json());
    const design = await createClientDesign(clientId, body);

    return apiOk({ design }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
