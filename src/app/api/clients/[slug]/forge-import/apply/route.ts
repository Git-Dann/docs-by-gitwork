/**
 * Run the import of the client's plan from their planning tool (Forge), after its dry run has
 * been read. Only creates cards and releases, links dev tasks to cards and fills empty fields;
 * never deletes, archives or moves a task. Re-running does only what's left.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { forgeApplyBodySchema } from "@/lib/forge-import/schemas";
import { applyForgeImport, ForgeImportError } from "@/server/forge-import";
import { requireForgeImporter } from "@/server/forge-import-access";

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { user, clientId } = await requireForgeImporter(req, slug);
    const body = forgeApplyBodySchema.parse(await req.json());
    const result = await applyForgeImport({
      workspaceId: user.workspaceId,
      clientId,
      actorId: user.id,
      feedUrl: body.feedUrl,
      approvedReviewLinks: body.approvedReviewLinks,
    });
    return apiOk({ result });
  } catch (err) {
    if (err instanceof ForgeImportError) return apiError(err.message, err.status);
    return fromError(err);
  }
}
