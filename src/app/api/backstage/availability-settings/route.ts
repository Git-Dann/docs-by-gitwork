import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser, assertAtLeastAdmin } from "@/server/auth/effective-user";
import { getAvailabilitySettings, setAvailabilityDigestChannel } from "@/server/availability-settings";

export const dynamic = "force-dynamic";

// GET /api/backstage/availability-settings — current digest channel (any member).
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk(await getAvailabilitySettings(user));
  } catch (e) {
    return fromError(e);
  }
}

const bodySchema = z.object({
  channelId: z.string().min(1).max(64).nullable(),
  channelName: z.string().max(200).nullable().optional(),
});

// PATCH — set/clear the digest channel. Admin / super-admin only.
export async function PATCH(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertAtLeastAdmin(user);
    const body = bodySchema.parse(await req.json());
    return apiOk(await setAvailabilityDigestChannel(user, body.channelId, body.channelName ?? null));
  } catch (e) {
    return fromError(e);
  }
}
