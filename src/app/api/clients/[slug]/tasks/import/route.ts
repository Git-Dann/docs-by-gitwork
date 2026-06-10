import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { importTasks } from "@/server/tasks";
import { taskImportSchema } from "@/server/validators";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Bulk insert — allow headroom for large CSVs.
export const maxDuration = 300;

async function resolveClientId(workspaceId: string, slug: string): Promise<string | null> {
  const client = await prisma.workspaceClient.findFirst({
    where: { slug, workspaceId },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { slug } = await params;
    const clientId = await resolveClientId(user.workspaceId, slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = taskImportSchema.parse(await req.json());
    return apiOk(await importTasks(user, clientId, body.tasks));
  } catch (e) {
    return fromError(e);
  }
}
