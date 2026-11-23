import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, canViewClientFinancials, requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientReader, assertClientWriter } from "@/server/client-write-access";
import { requireClientIdForSlug } from "@/server/clients-scope";
import { archiveProject, getClientProject, updateProject } from "@/server/projects";
import { projectUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

/** GET — one project with its tasks. Another client's project, or an archived one, is a 404. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const user = await requireAuthedUser(request);
    await assertClientReader(request, slug);
    const clientId = await requireClientIdForSlug(slug, request);
    const project = await getClientProject(user.workspaceId, clientId, id, { financials: canViewClientFinancials(user) });
    return apiOk({ project });
  } catch (error) {
    return fromError(error);
  }
}

/** PATCH — change a project. Needs 'Manage clients' and access to the client. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const user = await requireAuthedUser(request);
    assertCan(user, canManageClients, "change projects");
    await assertClientWriter(request, slug);
    const clientId = await requireClientIdForSlug(slug, request);
    const body = projectUpdateSchema.parse(await request.json());
    await updateProject(user.workspaceId, clientId, id, body);
    const project = await getClientProject(user.workspaceId, clientId, id, { financials: canViewClientFinancials(user) });
    return apiOk({ project });
  } catch (error) {
    return fromError(error);
  }
}

/** DELETE — archives the project (never deletes it). Its tasks, releases and categories stay. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const user = await requireAuthedUser(request);
    assertCan(user, canManageClients, "archive projects");
    await assertClientWriter(request, slug);
    const clientId = await requireClientIdForSlug(slug, request);
    await archiveProject(user.workspaceId, clientId, id);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
