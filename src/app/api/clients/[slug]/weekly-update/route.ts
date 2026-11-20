import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { requireClientIdForSlug } from "@/server/clients-scope";
import { draftWeeklyUpdate } from "@/server/weekly-update";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ slug: string }> };

const body = z.object({ week: z.enum(["this", "last"]).default("this"), regenerate: z.boolean().optional() }).strict();

/**
 * POST /api/clients/{slug}/weekly-update { week, regenerate? }: a draft of the weekly update email.
 * Drafts only. Nothing is sent or stored except the cached AI wording.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await requireAuthedUser(request);
    await assertClientAccessBySlug(user, slug);
    const clientId = await requireClientIdForSlug(slug, request);
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return apiError("week must be \"this\" or \"last\"", 400);
    const result = await draftWeeklyUpdate(user, clientId, parsed.data);
    if (!result) return apiError("Client not found", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
