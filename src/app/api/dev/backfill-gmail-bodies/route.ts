/**
 * POST /api/dev/backfill-gmail-bodies — admin-only repair.
 *
 * The old Gmail ingest parser returned the first text/plain part unconditionally,
 * so HTML-only emails (e.g. Wedge "New Feedback from …") stored just the stub
 * "Please view this email in HTML format." instead of the real message. This
 * re-fetches those stub-bodied GMAIL messages and rewrites them with the fixed
 * parser (which now reads the HTML alternative).
 *
 * Body (all optional):
 *   { "dryRun": true, "clientSlug": "big-wedge" }   // or { "connectionId": "…" }
 *
 * dryRun DEFAULTS TO TRUE — reports how many messages would be repaired (+ samples)
 * without writing. Re-POST { "dryRun": false } to commit. Idempotent: only touches
 * stub bodies, so re-running after a successful repair is a no-op.
 *
 * With no connectionId/clientSlug it resolves the GMAIL connection of the first
 * SupportClient whose name contains "wedge".
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { backfillGmailBodies } from "@/server/support-channels/gmail";
import { isAtLeast } from "@/types/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      connectionId?: string;
      clientSlug?: string;
    };
    const dryRun = body.dryRun ?? true;

    let connectionId = body.connectionId;
    if (!connectionId) {
      const sc = body.clientSlug
        ? await prisma.supportClient.findFirst({ where: { slug: body.clientSlug }, select: { id: true } })
        : await prisma.supportClient.findFirst({
            where: { name: { contains: "wedge", mode: "insensitive" } },
            select: { id: true },
          });
      if (!sc) return apiError("Support client not found", 404);
      const conn = await prisma.accountConnection.findFirst({
        where: { clientId: sc.id, source: "GMAIL" },
        select: { id: true },
      });
      if (!conn) return apiError("No GMAIL connection found for that client", 404);
      connectionId = conn.id;
    }

    const result = await backfillGmailBodies({ connectionId, dryRun });
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
