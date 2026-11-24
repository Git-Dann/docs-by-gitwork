import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { restoreCodeVersion } from "@/server/wiki-code";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientWriter } from "@/server/client-write-access";
import { codeActorFor } from "@/server/wiki-code-actor";

const restoreSchema = z.object({ eventId: z.string().trim().min(1).max(40) });

// Put a version back to how it was before an edit (the event that kept the earlier copy).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; versionId: string }> }) {
  try {
    const { slug, versionId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const { eventId } = restoreSchema.parse(await req.json());
    const version = await restoreCodeVersion(clientId, versionId, eventId, await codeActorFor(req));
    if (!version) return apiError("Version not found", 404);
    return apiOk(version);
  } catch (err) {
    return fromError(err);
  }
}
