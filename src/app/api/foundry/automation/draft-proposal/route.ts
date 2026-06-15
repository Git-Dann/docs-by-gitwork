import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { draftProposalFromMeeting } from "@/server/foundry-automation";

export const dynamic = "force-dynamic";

const draftProposalSchema = z.object({
  clientId: z.string().cuid(),
  meetingId: z.string().cuid().optional(),
  draft: z.object({
    title: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).optional(),
    objectives: z.array(z.string().trim().min(1)).optional(),
    touchpoints: z.array(z.string().trim().min(1)).optional(),
    assumptions: z.array(z.string().trim().min(1)).optional(),
    outOfScope: z.array(z.string().trim().min(1)).optional(),
    nextSteps: z.string().trim().min(1).optional(),
  }).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = draftProposalSchema.parse(await req.json());
    return apiOk({ result: await draftProposalFromMeeting(user, body) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
