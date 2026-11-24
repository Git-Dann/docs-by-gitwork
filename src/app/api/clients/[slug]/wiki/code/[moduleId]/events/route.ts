import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { listCodeEvents } from "@/server/wiki-code";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientReader } from "@/server/client-write-access";

// A module's history: uploads, edits, Live and Master, locks, unlocks, variants, deletions.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  try {
    const { slug, moduleId } = await params;
    await assertClientReader(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const events = await listCodeEvents(clientId, moduleId);
    if (!events) return apiError("Module not found", 404);
    return apiOk({ events });
  } catch (err) {
    return fromError(err);
  }
}
