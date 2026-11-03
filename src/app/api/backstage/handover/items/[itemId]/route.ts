import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { deleteHandoverItem, updateHandoverItem } from "@/server/handover";
import { handoverItemPatchSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// PATCH /api/backstage/handover/items/[itemId] — edit, or tick it off.
//
// Addressed by ITEM id rather than nested under the handover: an item is ticked
// from the page while the reader is standing in a section, and a route that
// needed both ids would make every tick carry state the component does not have.
export async function PATCH(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { itemId } = await params;
    const body = handoverItemPatchSchema.parse(await req.json());
    return apiOk(await updateHandoverItem(user, itemId, body));
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { itemId } = await params;
    await deleteHandoverItem(user, itemId);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
