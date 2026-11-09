import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import {
  createLaunchpadTemplate,
  listLaunchpadTemplates,
} from "@/server/launchpad-templates";
import { launchpadTemplateCreateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    return apiOk(await listLaunchpadTemplates(await workspaceIdForRequest(request), { includeArchived }));
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(
      await getEffectiveUserOrNull(request),
      canManageClients,
      "manage Launchpad templates",
    );
    const body = launchpadTemplateCreateSchema.parse(await request.json());
    const template = await createLaunchpadTemplate(await workspaceIdForRequest(request), body);
    return apiOk({ template }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
