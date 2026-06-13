import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { seedProjectPlanFromProposal } from "@/server/foundry-automation";

export const dynamic = "force-dynamic";

const seedProjectPlanSchema = z.object({
  clientId: z.string().cuid(),
  documentId: z.string().cuid().optional(),
  startDate: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = seedProjectPlanSchema.parse(await req.json());
    return apiOk({ result: await seedProjectPlanFromProposal(user, body) });
  } catch (error) {
    return fromError(error);
  }
}
