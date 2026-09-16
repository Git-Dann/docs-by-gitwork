import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { duplicateLaunchpadTemplate } from "@/server/launchpad-templates";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(
      await getEffectiveUserOrNull(request),
      canManageClients,
      "manage Launchpad templates",
    );
    const { id } = await params;
    const template = await duplicateLaunchpadTemplate(id);
    if (!template) return apiError("Template not found", 404);
    return apiOk({ template }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
