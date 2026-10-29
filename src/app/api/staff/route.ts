/**
 * GET  /api/staff — the people roster: every active member plus Staff records with no
 *      account behind them (src/server/staff.ts). `?view=archived` lists who has left.
 *      Needs the Staff module permission.
 * POST /api/staff — create a Staff record, for a member ({ memberId }) or for someone who
 *      doesn't sign in ({ name, email? }). Needs `code.manage`.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageCode, canViewStaff, requireAuthedUser } from "@/server/auth/effective-user";
import { createStaffRecord, listStaff } from "@/server/staff";
import { EMPLOYMENT_TYPES } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canViewStaff, "view Staff");
    const view = new URL(request.url).searchParams.get("view") === "archived" ? "archived" : "active";
    return apiOk(await listStaff(user.workspaceId, view));
  } catch (error) {
    return fromError(error);
  }
}

const createSchema = z
  .object({
    memberId: z.string().min(1).max(64).optional(),
    name: z.string().max(200).optional(),
    email: z.string().email().max(200).nullable().optional(),
    preferredName: z.string().max(200).nullable().optional(),
    pronouns: z.string().max(100).nullable().optional(),
    jobTitle: z.string().max(200).nullable().optional(),
    department: z.string().max(200).nullable().optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
    startDate: z.string().max(20).nullable().optional(),
    managerRecordId: z.string().max(64).nullable().optional(),
  })
  .strict()
  .refine((v) => v.memberId || v.name?.trim(), { message: "Choose a member or enter a name" });

export async function POST(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManageCode, "manage Staff");
    const input = createSchema.parse(await request.json());
    return apiOk(await createStaffRecord(user.workspaceId, input), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
