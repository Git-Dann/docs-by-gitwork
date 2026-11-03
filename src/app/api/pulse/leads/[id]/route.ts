import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, assertInternal, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { deletePulseLead, updatePulseLead } from "@/server/pulse-lite/leads-admin";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().max(200).optional(),
  business: z.string().max(200).optional(),
  email: z.string().max(300).optional(),
});

/** PATCH /api/pulse/leads/[id] — correct a lead's name, business or email. Internal, Manage Pulse. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertInternal(user);
    assertCan(user, canManagePulse, "edit Pulse leads");
    const { id } = await params;
    await updatePulseLead(id, patchSchema.parse(await request.json()));
    return apiOk({ updated: true });
  } catch (error) {
    return fromError(error);
  }
}

/** DELETE /api/pulse/leads/[id] — remove a lead, freeing its email to unlock again. Internal, Manage Pulse. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertInternal(user);
    assertCan(user, canManagePulse, "delete Pulse leads");
    const { id } = await params;
    await deletePulseLead(id);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
