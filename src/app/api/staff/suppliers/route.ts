/**
 * GET  /api/staff/suppliers — the companies that supply people (docs/hr-platform.md).
 *      `?archived=1` includes archived ones. Needs `hr.manage`.
 * POST /api/staff/suppliers — add one. Needs `hr.manage`.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageHr, requireAuthedUser } from "@/server/auth/effective-user";
import { createSupplier, listSuppliers } from "@/server/hr/suppliers";

export const dynamic = "force-dynamic";

const text = z.string().max(4000).nullable().optional();
const supplierSchema = z
  .object({
    name: z.string().max(400).optional(),
    companyNumber: text,
    vatNumber: text,
    country: text,
    contactName: text,
    contactEmail: text,
    agreementRenewsOn: text,
    notes: text,
  })
  .strict();

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManageHr, "manage suppliers");
    const archived = new URL(request.url).searchParams.get("archived") === "1";
    return apiOk({ suppliers: await listSuppliers(user.workspaceId, archived) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManageHr, "manage suppliers");
    return apiOk(await createSupplier(user.workspaceId, supplierSchema.parse(await request.json())), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
