import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ForbiddenError, canViewClientFinancials, requireAuthedUser } from "@/server/auth/effective-user";
import { DealError, recordDeal } from "@/server/money-deals";
import { DEAL_LIMITS } from "@/lib/money-deals";

export const dynamic = "force-dynamic";

const lineSchema = z
  .object({
    label: z.string().max(DEAL_LIMITS.label),
    kind: z.enum(["monthly", "once", "ongoing"]),
    amount: z.number(),
    months: z.number().int().nullable(),
    foundInFile: z.boolean().optional(),
  })
  .strict();

const dealSchema = z
  .object({
    clientId: z.string().min(1),
    title: z.string().max(DEAL_LIMITS.title),
    wonOn: z.string(),
    currency: z.string(),
    lines: z.array(lineSchema).max(DEAL_LIMITS.lines),
    source: z.union([z.object({ kind: z.literal("manual") }).strict(), z.object({ kind: z.literal("file"), fileName: z.string().max(200) }).strict()]),
  })
  .strict();

/** POST — record a deal that didn't come from Docs. Money viewers only. */
export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!canViewClientFinancials(user)) throw new ForbiddenError("You don't have access to Money.");
    const parsed = dealSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("That deal isn't complete.", 400);
    return apiOk(await recordDeal(user, parsed.data), { status: 201 });
  } catch (err) {
    if (err instanceof DealError) return apiError(err.message, 400);
    return fromError(err);
  }
}
