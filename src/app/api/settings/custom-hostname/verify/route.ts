/**
 * POST /api/settings/custom-hostname/verify
 *
 * Trigger a DNS TXT lookup for the workspace's pending hostname. If the TXT record matches
 * `foundry-verify={token}`, flip `customHostnameVerified` to true. Otherwise return a clear
 * "not yet" so the operator can retry after DNS propagates.
 *
 * Verification is idempotent — re-running on an already-verified hostname is a no-op.
 */

import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { verifyHostnameDns } from "@/server/custom-hostname";

export async function POST() {
  try {
    const { workspace } = await ensureBaseRecords();
    const ws = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: {
        customHostname: true,
        customHostnameToken: true,
        customHostnameVerified: true,
      },
    });

    if (!ws?.customHostname || !ws.customHostnameToken) {
      return apiError("Set a hostname first.", 400);
    }
    if (ws.customHostnameVerified) {
      return apiOk({ verified: true, hostname: ws.customHostname });
    }

    const ok = await verifyHostnameDns(ws.customHostname, ws.customHostnameToken);
    if (!ok) {
      return apiError(
        "TXT record not found. DNS can take 1–60 minutes to propagate — try again shortly.",
        424,
      );
    }

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { customHostnameVerified: true },
    });

    return apiOk({ verified: true, hostname: ws.customHostname });
  } catch (error) {
    return fromError(error);
  }
}
