import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { createCodeModule, loadWikiCodeHandover, setWikiCodeHandoverEnabled } from "@/server/wiki-code";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientReader, assertClientWriter } from "@/server/client-write-access";
import { codeActorFor } from "@/server/wiki-code-actor";

const toggleSchema = z.object({ enabled: z.boolean() });
const moduleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientReader(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiCodeHandover(clientId));
  } catch (err) {
    return fromError(err);
  }
}

// Toggle the Code Handover section on/off (sidebar Add New / delete).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiCodeHandoverEnabled(clientId, enabled);
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await createCodeModule(clientId, moduleSchema.parse(await req.json()), await codeActorFor(req)), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
