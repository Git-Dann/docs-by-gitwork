/** PATCH /api/staff/suppliers/[id] — edit a supplier, or archive / restore it ({ archived }). Needs `hr.manage`. */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageHr, requireAuthedUser } from "@/server/auth/effective-user";
import { updateSupplier } from "@/server/hr/suppliers";

export const dynamic = "force-dynamic";

const text = z.string().max(4000).nullable().optional();
const schema = z
  .object({
    name: z.string().max(400).optional(),
    companyNumber: text,
    vatNumber: text,
    country: text,
    contactName: text,
    contactEmail: text,
    agreementRenewsOn: text,
    notes: text,
    archived: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManageHr, "manage suppliers");
    const { id } = await params;
    await updateSupplier(user.workspaceId, id, schema.parse(await request.json()));
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
