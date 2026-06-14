import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { draftProposalFromMeeting } from "@/server/foundry-automation";

export const dynamic = "force-dynamic";

const draftProposalSchema = z.object({
  clientId: z.string().cuid(),
  meetingId: z.string().cuid().optional(),
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
