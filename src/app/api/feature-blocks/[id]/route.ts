import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { updateFeatureBlock, deleteFeatureBlock } from "@/server/feature-blocks";
import { featureBlockUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = featureBlockUpdateSchema.parse(await req.json());
    const block = await updateFeatureBlock(user, id, body);
    return apiOk(block);
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteFeatureBlock(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
