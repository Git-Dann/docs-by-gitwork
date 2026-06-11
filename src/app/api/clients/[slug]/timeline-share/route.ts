import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canShareClientTimeline, requireAuthedUser } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { getTimelineShare, setTimelineShare } from "@/server/client-timeline";
import { timelineShareSchema } from "@/server/validators";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveClientId(workspaceId: string, slug: string): Promise<string | null> {
  const client = await prisma.workspaceClient.findFirst({
    where: { slug, workspaceId },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { slug } = await params;
    await assertClientAccessBySlug(user, slug);
    const clientId = await resolveClientId(user.workspaceId, slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await getTimelineShare(user, clientId));
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    // High-risk: publishes a public, no-login client timeline. Gate on clients.shareTimeline.
    assertCan(user, canShareClientTimeline, "share client timelines");
    const { slug } = await params;
    await assertClientAccessBySlug(user, slug);
    const clientId = await resolveClientId(user.workspaceId, slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = timelineShareSchema.parse(await req.json());
    return apiOk(await setTimelineShare(user, clientId, body.enabled));
  } catch (e) {
    return fromError(e);
  }
}
