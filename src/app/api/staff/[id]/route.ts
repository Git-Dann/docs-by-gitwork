/**
 * GET   /api/staff/[id] — a person's profile (src/server/hr/profile.ts): the directory tier,
 *       plus the employment tier when the viewer may see it. Personal details are a separate,
 *       logged request (./personal).
 * PATCH /api/staff/[id] — a Staff record's directory details (job title, department, type,
 *       start, manager, preferred name, pronouns). Needs `code.manage`.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageCode, requireAuthedUser } from "@/server/auth/effective-user";
import { updateStaffDetails } from "@/server/staff";
import { getStaffProfile } from "@/server/hr/profile";
import { EMPLOYMENT_TYPES } from "@/lib/staff";

export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    preferredName: z.string().max(200).nullable().optional(),
    pronouns: z.string().max(100).nullable().optional(),
    jobTitle: z.string().max(200).nullable().optional(),
    department: z.string().max(200).nullable().optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
    startDate: z.string().max(20).nullable().optional(),
    managerRecordId: z.string().max(64).nullable().optional(),
  })
  .strict();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await getStaffProfile(user, id));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManageCode, "manage Staff");
    const { id } = await params;
    await updateStaffDetails(user.workspaceId, id, updateSchema.parse(await request.json()));
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
