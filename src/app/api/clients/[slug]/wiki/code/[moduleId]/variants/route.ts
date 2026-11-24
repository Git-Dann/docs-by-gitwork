import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { createCodeVariant } from "@/server/wiki-code";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientWriter } from "@/server/client-write-access";
import { codeActorFor } from "@/server/wiki-code-actor";

const variantSchema = z.object({
  name: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** The Master-line version it starts as a copy of. */
  baseVersionId: z.string().trim().min(1).max(40),
});

// Make a variant (e.g. one venue's code) from a Master-line version.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  try {
    const { slug, moduleId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const variant = await createCodeVariant(clientId, moduleId, variantSchema.parse(await req.json()), await codeActorFor(req));
    if (!variant) return apiError("Module not found", 404);
    return apiOk(variant, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
