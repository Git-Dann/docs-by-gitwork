import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { previewProposalDraftFromMeeting } from "@/server/foundry-automation";

export const dynamic = "force-dynamic";

const previewProposalSchema = z.object({
  clientId: z.string().cuid(),
  meetingId: z.string().cuid().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = previewProposalSchema.parse(await req.json());
    return apiOk({ preview: await previewProposalDraftFromMeeting(user, body) });
  } catch (error) {
    return fromError(error);
  }
}
