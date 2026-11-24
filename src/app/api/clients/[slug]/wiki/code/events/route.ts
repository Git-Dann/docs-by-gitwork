import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { listCodeEvents } from "@/server/wiki-code";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientReader } from "@/server/client-write-access";

// Code Handover's history, every module: uploads, edits, Live and Master, locks, unlocks,
// variants and deletions.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientReader(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk({ events: await listCodeEvents(clientId) });
  } catch (err) {
    return fromError(err);
  }
}
