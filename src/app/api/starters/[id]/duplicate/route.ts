import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { duplicateStarter } from "@/server/starters";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

// Fork a starter (typically a Gitwork built-in) into the workspace so it can be edited.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "duplicate starters");
    const { id } = await params;
    const starter = await duplicateStarter(id);
    if (!starter) return apiError("Starter not found", 404);
    return apiOk({ starter }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
