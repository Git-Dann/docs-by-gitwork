/**
 * Dry run of importing the client's plan from their planning tool (Forge). Writes nothing:
 * returns what an import WOULD create, link and leave for review. src/server/forge-import.ts.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { forgePlanBodySchema } from "@/lib/forge-import/schemas";
import { ForgeImportError, planForgeImport } from "@/server/forge-import";
import { requireForgeImporter } from "@/server/forge-import-access";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { user, clientId } = await requireForgeImporter(req, slug);
    const body = forgePlanBodySchema.parse(await req.json().catch(() => ({})));
    const plan = await planForgeImport({ workspaceId: user.workspaceId, clientId, feedUrl: body.feedUrl, decisions: body.decisions });
    return apiOk({ plan });
  } catch (err) {
    if (err instanceof ForgeImportError) return apiError(err.message, err.status);
    return fromError(err);
  }
}
