import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { updateAutomationNudge } from "@/server/foundry-automation";

export const dynamic = "force-dynamic";

const nudgeSchema = z.object({
  clientId: z.string().cuid(),
  kind: z.enum(["signature_stale", "onboarding_stale", "active_plan_gap"]),
  assignedToName: z.string().trim().min(1).nullable().optional(),
  snoozedUntil: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = nudgeSchema.parse(await req.json());
    return apiOk({ result: await updateAutomationNudge(user, body) });
  } catch (error) {
    return fromError(error);
  }
}
