/**
 * POST /api/dev/backfill-footer-preparedby — one-shot, admin-only. Migration-only; safe to delete
 * after running.
 *
 * The sign-off footer now inherits the cover's "Prepared by" (`Document.metadata.owner`) when its
 * own field is blank (PR #121). Existing docs that stored one of the old *team-name* template
 * defaults in the footer's person field still show that instead of inheriting. This blanks those
 * stale values so the footer falls back to the cover owner — one voice, top to bottom.
 *
 * Defaults to `dryRun: true` (reports what WOULD change, writes nothing). POST `{ "dryRun": false }`
 * to commit. Idempotent and non-destructive: only touches `signoff_footer` sections whose
 * `preparedBy` exactly equals a known stale default; never clears a value a user actually chose.
 */

import { Prisma } from "@prisma/client";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertSuperAdmin, getEffectiveUserOrNull, requireAuthedUser } from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";

export const dynamic = "force-dynamic";

// Old template defaults that were team names misplaced in the footer's "person" field.
const STALE_PREPARED_BY = ["Foundry Delivery Team", "Gitwork Delivery Team"];

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(req: Request) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(req));
    const user = await requireAuthedUser(req);
    // Admins AND Super Admins (Dan) — isAtLeast, not strict equality.
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);

    let dryRun = true;
    try {
      const body = (await req.json()) as { dryRun?: boolean } | null;
      if (body && body.dryRun === false) dryRun = false;
    } catch {
      // No/!JSON body → keep the safe default (dry run).
    }

    const footers = await prisma.documentSection.findMany({
      where: { key: "signoff_footer" },
      select: {
        id: true,
        documentId: true,
        data: true,
        document: { select: { title: true } },
      },
    });

    const matches = footers.filter((section) => {
      const preparedBy = asObject(section.data).preparedBy;
      return typeof preparedBy === "string" && STALE_PREPARED_BY.includes(preparedBy.trim());
    });

    let updated = 0;
    if (!dryRun) {
      for (const section of matches) {
        const next = { ...asObject(section.data), preparedBy: "" };
        await prisma.documentSection.update({
          where: { id: section.id },
          data: { data: next as unknown as Prisma.InputJsonValue },
        });
        updated += 1;
      }
    }

    return apiOk({
      dryRun,
      scanned: footers.length,
      matched: matches.length,
      updated,
      samples: matches.slice(0, 25).map((section) => ({
        documentId: section.documentId,
        title: section.document.title,
        was: asObject(section.data).preparedBy,
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}
