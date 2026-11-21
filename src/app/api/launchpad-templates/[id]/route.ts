import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  deleteLaunchpadTemplate,
  getLaunchpadTemplate,
  updateLaunchpadTemplate,
} from "@/server/launchpad-templates";
import { launchpadTemplateUpdateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(_request), canManageClients, "read a Launchpad template");
    const { id } = await params;
    const template = await getLaunchpadTemplate(await workspaceIdForRequest(_request), id);
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
    const template = await updateLaunchpadTemplate(await workspaceIdForRequest(request), id, body);
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
    const result = await deleteLaunchpadTemplate(await workspaceIdForRequest(request), id);
    if (!result) return apiError("Template not found", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
