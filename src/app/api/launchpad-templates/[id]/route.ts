import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  deleteLaunchpadTemplate,
  getLaunchpadTemplate,
  updateLaunchpadTemplate,
} from "@/server/launchpad-templates";
import { launchpadTemplateUpdateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const template = await getLaunchpadTemplate(id);
    if (!template) return apiError("Template not found", 404);
    return apiOk({ template });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(
      await getEffectiveUserOrNull(request),
      canManageClients,
      "manage Launchpad templates",
    );
    const { id } = await params;
    const body = launchpadTemplateUpdateSchema.parse(await request.json());
    const template = await updateLaunchpadTemplate(id, body);
    if (!template) return apiError("Template not found", 404);
    return apiOk({ template });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCan(
      await getEffectiveUserOrNull(request),
      canManageClients,
      "manage Launchpad templates",
    );
    const { id } = await params;
    const result = await deleteLaunchpadTemplate(id);
    if (!result) return apiError("Template not found", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
