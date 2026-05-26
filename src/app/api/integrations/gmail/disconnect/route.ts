import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await prisma.workspace.updateMany({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      data: { googleOAuthRefreshToken: null },
    });
    return apiOk({ disconnected: true });
  } catch (error) {
    return fromError(error);
  }
}
