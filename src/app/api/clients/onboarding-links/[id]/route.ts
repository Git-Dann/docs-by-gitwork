import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  deleteOnboardingLink,
  getOnboardingAdmin,
  revealOnboardingBank,
} from "@/server/onboarding";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const link = await getOnboardingAdmin(id);
    if (!link) return apiError("Onboarding link not found", 404);
    // Optional ?reveal=bank query returns decrypted bank fields. Server-side
    // only — middleware has already authenticated this request.
    const reveal = request.nextUrl.searchParams.get("reveal");
    if (reveal === "bank") {
      const bank = await revealOnboardingBank(id);
      return apiOk({ link, bank });
    }
    return apiOk({ link });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ok = await deleteOnboardingLink(id);
    if (!ok) return apiError("Onboarding link not found", 404);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
