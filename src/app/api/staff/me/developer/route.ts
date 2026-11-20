/**
 * GET   /api/staff/me/developer — the signed-in person's own developer details, or null.
 * PATCH /api/staff/me/developer — fill them in (GitHub handle, stack, location, links). Only
 *       their own record, and only once it's marked as a developer (src/server/staff.ts).
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getOwnDeveloperDetails, updateOwnDeveloperDetails } from "@/server/staff";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    githubHandle: z.string().max(200).nullable().optional(),
    primaryStack: z.string().max(200).nullable().optional(),
    techStacks: z.array(z.string().max(200)).max(50).optional(),
    location: z.string().max(200).nullable().optional(),
    timezone: z.string().max(200).nullable().optional(),
    linkedinUrl: z.string().max(500).nullable().optional(),
    portfolioUrl: z.string().max(500).nullable().optional(),
    removeGithubHandle: z.literal(true).optional(),
    notDeveloper: z.literal(true).optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await getOwnDeveloperDetails(user.workspaceId, user.membershipId));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await updateOwnDeveloperDetails(user.workspaceId, user.membershipId, schema.parse(await request.json())));
  } catch (error) {
    return fromError(error);
  }
}
