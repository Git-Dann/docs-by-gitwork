/**
 * The client's share page reads Code Handover's files here: the wiki carries only a light copy
 * without file contents (CLAUDE.md §155). Access: src/server/wiki-code-access.ts.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { loadWikiCodeHandover } from "@/server/wiki-code";
import { assertCodeReadRate, resolveCodeAccess } from "@/server/wiki-code-access";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    await assertCodeReadRate(req);
    const access = await resolveCodeAccess(req, token);
    if (!access.ok) return apiError(access.message, access.status);
    return apiOk(await loadWikiCodeHandover(access.clientId));
  } catch (err) {
    return fromError(err);
  }
}
