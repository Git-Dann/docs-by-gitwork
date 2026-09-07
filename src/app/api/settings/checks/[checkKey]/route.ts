import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { resetCheckConfig } from "@/server/check-config";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ checkKey: string }> },
) {
  try {
    // Same gate as POST on the sibling route, and for the same reason: this is a
    // write to the workspace's scan policy. It had none, so any signed-in member —
    // including a developer scoped to no Pulse access at all — could delete an
    // admin's deliberate disable or severity override, which POST requires admin
    // to set. Undoing a decision needs the authority that made it.
    assertAtLeastAdmin(await getEffectiveUserOrNull(req));
    const { checkKey } = await params;
    await resetCheckConfig(decodeURIComponent(checkKey));
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
