import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getStarterVersion } from "@/server/starter-versions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view starter history");
    const { id, versionId } = await params;
    const version = await getStarterVersion(id, versionId);
    if (!version) return apiError("Version not found", 404);
    return apiOk({ version });
  } catch (error) {
    return fromError(error);
  }
}
