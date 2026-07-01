import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import {
  backupDocument,
  driveFor,
  ensureBackupFolder,
  resolveBackupAuth,
} from "@/server/google-drive-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hard cap on documents backed up per run so one invocation stays within maxDuration (each backup
// is one Drive HTML→Google-Doc import). Never-backed-up docs go first; a backlog drains over
// subsequent daily runs (oldest first). Anything deferred is logged in the result.
const MAX_PER_RUN = 15;
// How many recently-changed already-backed-up docs to scan for staleness per run. Prisma can't
// compare two columns in a `where`, so we pull the most-recently-updated backed-up docs and filter
// `updatedAt > gdriveBackedUpAt` in JS. Daily cadence keeps the changed-set small.
const STALE_SCAN_LIMIT = 200;

/**
 * GET /api/cron/docs-gdrive-backup  (Vercel cron)
 *
 * Mirrors documents into the backup account's Drive as native Google Docs. Idempotent: each doc
 * maps to one Google Doc (Document.gdriveFileId), created once then updated in place. Picks up
 * never-backed-up docs first, then docs changed since their last backup. Best-effort — a single
 * doc's failure is logged and doesn't abort the run.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) return apiError("Unauthorized", 401);
    }

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: { id: true, docsBackupEnabled: true, docsBackupFolderId: true },
    });
    if (!workspace) return apiError("Workspace not found", 404);

    const backupAuth = await resolveBackupAuth(workspace);
    if (!backupAuth) {
      return apiOk({
        reason: workspace.docsBackupEnabled ? "no_connected_backup_account" : "backup_disabled",
        processed: 0,
      });
    }

    const drive = driveFor(backupAuth.client);
    const folderId = await ensureBackupFolder(drive, workspace.id, workspace.docsBackupFolderId);

    // 1) Never backed up (oldest first). 2) If room remains, docs changed since their last backup.
    const never = await prisma.document.findMany({
      where: { workspaceId: workspace.id, archivedAt: null, gdriveBackedUpAt: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: MAX_PER_RUN,
    });
    const ids = never.map((d) => d.id);

    if (ids.length < MAX_PER_RUN) {
      const backed = await prisma.document.findMany({
        where: { workspaceId: workspace.id, archivedAt: null, gdriveBackedUpAt: { not: null } },
        select: { id: true, updatedAt: true, gdriveBackedUpAt: true },
        orderBy: { updatedAt: "desc" },
        take: STALE_SCAN_LIMIT,
      });
      const stale = backed
        .filter((d) => d.gdriveBackedUpAt && d.updatedAt.getTime() > d.gdriveBackedUpAt.getTime())
        .slice(0, MAX_PER_RUN - ids.length)
        .map((d) => d.id);
      ids.push(...stale);
    }

    if (ids.length === 0) {
      return apiOk({ account: backupAuth.ownerEmail, folderId, processed: 0, created: 0, updated: 0 });
    }

    // Process concurrently — each backup is an independent Drive upload, so wall-time is bounded by
    // the slowest single import, not the sum.
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const results = await Promise.allSettled(ids.map((id) => backupDocument(drive, folderId, id)));
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        if (r.value?.action === "created") created += 1;
        else if (r.value?.action === "updated") updated += 1;
      } else {
        errors.push(`${ids[i]}: ${String(r.reason).slice(0, 160)}`);
      }
    });

    if (errors.length > 0) {
      console.warn(`[docs-gdrive-backup] ${errors.length} document(s) failed to back up: ${errors.slice(0, 5).join("; ")}`);
    }

    return apiOk({
      account: backupAuth.ownerEmail,
      folderId,
      processed: ids.length,
      created,
      updated,
      errors,
    });
  } catch (error) {
    return fromError(error);
  }
}
