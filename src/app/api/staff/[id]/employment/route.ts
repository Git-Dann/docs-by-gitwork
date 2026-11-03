/**
 * PATCH /api/staff/[id]/employment — a person's employment tier: supplier, contract end,
 * probation end, notice period, days per week (docs/hr-platform.md). Needs `hr.manage`;
 * the check is in src/server/hr/profile.ts so the page and the API share one rule. Every
 * change is written to the HR access log.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { updateEmployment } from "@/server/hr/profile";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    supplierId: z.string().max(64).nullable().optional(),
    endDate: z.string().max(20).nullable().optional(),
    probationEndsOn: z.string().max(20).nullable().optional(),
    noticePeriodWeeks: z.number().nullable().optional(),
    daysPerWeek: z.number().nullable().optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    await updateEmployment(user, id, schema.parse(await request.json()));
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
