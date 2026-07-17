import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { restoreStarterVersion } from "@/server/starter-versions";
import { getStarter } from "@/server/starters";

export const dynamic = "force-dynamic";

// Restore a starter to a past version. Snapshots the current state first, so restore is reversible.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageStarters, "restore starter versions");
    const { id, versionId } = await params;
    const ok = await restoreStarterVersion(id, versionId, user?.id ?? null);
    if (!ok) return apiError("Starter or version not found", 404);
    return apiOk({ starter: await getStarter(id) });
  } catch (error) {
    return fromError(error);
  }
}
