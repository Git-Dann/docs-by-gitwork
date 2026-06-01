import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listFeatureBlocks, createFeatureBlock } from "@/server/feature-blocks";
import { featureBlockInputSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) return apiError("Missing clientId", 400);
    const blocks = await listFeatureBlocks(user, clientId);
    return apiOk(blocks);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = featureBlockInputSchema.parse(await req.json());
    const block = await createFeatureBlock(user, body);
    return apiOk(block, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
