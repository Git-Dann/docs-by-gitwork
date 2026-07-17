import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getStarter, updateStarter, deleteStarter } from "@/server/starters";
import { starterUpdateSchema } from "@/server/validators";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

// Starters is an admin-only tool (gated by the `starters` feature perm) — view == manage, so all
// verbs assert the same gate.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view starters");
    const { id } = await params;
    const starter = await getStarter(id);
    if (!starter) return apiError("Starter not found", 404);
    return apiOk({ starter });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageStarters, "update starters");
    const { id } = await params;
    const body = await request.json();
    const data = starterUpdateSchema.parse(body);
    const starter = await updateStarter(
      id,
      {
        ...data,
        description: data.description === undefined ? undefined : data.description ?? null,
        content: data.content === undefined ? undefined : data.content ?? null,
      },
      user?.id ?? null,
    );
    if (!starter) return apiError("Starter not found", 404);
    return apiOk({ starter });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "delete starters");
    const { id } = await params;
    const ok = await deleteStarter(id);
    if (!ok) return apiError("Starter not found", 404);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
