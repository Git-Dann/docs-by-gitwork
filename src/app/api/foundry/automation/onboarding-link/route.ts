import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { createAutomationOnboardingLink } from "@/server/foundry-automation";

export const dynamic = "force-dynamic";

const onboardingLinkSchema = z.object({
  clientId: z.string().cuid(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = onboardingLinkSchema.parse(await req.json());
    return apiOk({ result: await createAutomationOnboardingLink(user, body) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
