import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { syncConnection } from "@/server/support-sync";
import type { SyncResult } from "@/server/support-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return apiError("Unauthorized", 401);
      }
    }

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: { id: true, googleServiceAccountJson: true, googleSubjectEmail: true },
    });

    if (!workspace) return apiError("Workspace not found", 404);

    const connections = await prisma.accountConnection.findMany({
      where: { health: "CONNECTED", client: { workspaceId: workspace.id } },
      include: {
        channelTokens: true,
        client: { select: { id: true, name: true, slug: true } },
      },
    });

    let totalCreated = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        const ctx = {
          connection: conn,
          client: conn.client,
          workspace,
        };
        const result: SyncResult = await syncConnection(ctx);
        return { connId: conn.id, source: conn.source, result };
      }),
    );

    for (const res of results) {
      if (res.status === "fulfilled") {
        totalCreated += res.value.result.created;
        totalSkipped += res.value.result.skipped;
        if (res.value.result.errors.length > 0) {
          allErrors.push(
            ...res.value.result.errors.map((e) => `[${res.value.source}:${res.value.connId.slice(-6)}] ${e}`),
          );
        }
      } else {
        allErrors.push(String(res.reason));
      }
    }

    return apiOk({
      total: connections.length,
      created: totalCreated,
      skipped: totalSkipped,
      errors: allErrors,
    });
  } catch (error) {
    return fromError(error);
  }
}
