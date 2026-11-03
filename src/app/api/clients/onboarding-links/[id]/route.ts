import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  deleteOnboardingLink,
  getOnboardingAdmin,
  revealOnboardingBank,
} from "@/server/onboarding";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { requestWorkspaceId, workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await workspaceIdForRequest(request);
    const link = await getOnboardingAdmin(workspaceId, id);
    if (!link) return apiError("Onboarding link not found", 404);
    // Optional ?reveal=bank query returns decrypted bank fields. Server-side
    // only — middleware has already authenticated this request.
    const reveal = request.nextUrl.searchParams.get("reveal");
    if (reveal === "bank") {
      assertCan(await getEffectiveUserOrNull(request), canManageClients, "reveal bank details");
      const bank = await revealOnboardingBank(workspaceId, id);
      return apiOk({ link, bank });
    }
    return apiOk({ link });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "manage onboarding links");
    const { id } = await params;
    const ok = await deleteOnboardingLink(await requestWorkspaceId(user), id);
    if (!ok) return apiError("Onboarding link not found", 404);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
