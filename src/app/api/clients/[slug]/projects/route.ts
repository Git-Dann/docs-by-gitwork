import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, canViewClientFinancials, requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientReader, assertClientWriter } from "@/server/client-write-access";
import { requireClientIdForSlug } from "@/server/clients-scope";
import { createProject, getClientProject, linkableDocuments, listClientProjects } from "@/server/projects";
import { projectCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/clients/{slug}/projects — the client's live projects (CLAUDE.md §150).
 * `?documents=1` adds the accepted documents a project can be linked to.
 * Budget and spend come back only for Super Admins and `clients.viewFinancials` holders.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await requireAuthedUser(request);
    await assertClientReader(request, slug);
    const clientId = await requireClientIdForSlug(slug, request);
    const financials = canViewClientFinancials(user);
    const [projects, documents] = await Promise.all([
      listClientProjects(user.workspaceId, clientId, { financials }),
      request.nextUrl.searchParams.get("documents") === "1" ? linkableDocuments(user.workspaceId, clientId, { financials }) : null,
    ]);
    return apiOk({ projects, documents, canSeeMoney: financials });
  } catch (error) {
    return fromError(error);
  }
}

/** POST /api/clients/{slug}/projects — a new project. Needs 'Manage clients' and access to the client. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await requireAuthedUser(request);
    assertCan(user, canManageClients, "add projects");
    await assertClientWriter(request, slug);
    const clientId = await requireClientIdForSlug(slug, request);
    const body = projectCreateSchema.parse(await request.json());
    const id = await createProject(user.workspaceId, clientId, user.id, body);
    const project = await getClientProject(user.workspaceId, clientId, id, { financials: canViewClientFinancials(user) });
    return apiOk({ project }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
