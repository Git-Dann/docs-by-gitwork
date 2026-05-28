import { prisma } from "@/lib/prisma";

/**
 * One-shot demo data cleanup. Used by:
 *   - GET/POST /api/codeclear/admin/cleanup-demo (admin button in Settings → Developer)
 *   - scripts/prune-non-gitwork-devs.ts (terminal fallback)
 *
 * This is a DENYLIST, not an allowlist. It only removes the specific records
 * the old seed inserted — never anything the user added themselves. Safe to
 * re-run; idempotent (deletes nothing on the second call).
 */

// Demo candidates seeded by the old src/server/codeclear.ts.
export const DEMO_CANDIDATE_NAMES = [
  "Sindre Sorhus",
  "Dan Abramov",
  "Addy Osmani",
  "Evan You",
  "TJ Holowaychuk",
  "Linus Torvalds",
];

export const DEMO_CANDIDATE_HANDLES = [
  "sindresorhus",
  "gaearon",
  "addyosmani",
  "yyx990803",
  "tj",
  "torvalds",
];

// Rate-card seed identifiers from the old roster that aren't in the current
// 21-dev list. Match on seedIdentifier (not name) so we don't accidentally
// touch a manually added person who shares a first name.
export const LEGACY_RATE_CARD_SEED_IDS = [
  "gitwork.usman-ali",
  "gitwork.zain-ali",
  "gitwork.kashan",
  "gitwork.aashir-awan",
  "gitwork.sibghatullah",
  "gitwork.m-shoaib",
  "gitwork.m-tayyab",
];

export interface DemoCleanupPreview {
  candidates: Array<{ id: string; name: string; githubHandle: string }>;
  ratePeople: Array<{ id: string; name: string; seedIdentifier: string | null }>;
}

export async function previewDemoCleanup(workspaceId: string): Promise<DemoCleanupPreview> {
  const [candidates, ratePeople] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        workspaceId,
        OR: [
          { name: { in: DEMO_CANDIDATE_NAMES } },
          { githubHandle: { in: DEMO_CANDIDATE_HANDLES } },
        ],
      },
      select: { id: true, name: true, githubHandle: true },
      orderBy: { name: "asc" },
    }),
    prisma.rateCardPerson.findMany({
      where: { workspaceId, seedIdentifier: { in: LEGACY_RATE_CARD_SEED_IDS } },
      select: { id: true, name: true, seedIdentifier: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { candidates, ratePeople };
}

export interface DemoCleanupResult extends DemoCleanupPreview {
  deletedCandidates: number;
  deletedRatePeople: number;
}

export async function applyDemoCleanup(workspaceId: string): Promise<DemoCleanupResult> {
  const preview = await previewDemoCleanup(workspaceId);

  // Candidate cascades to scores, drafts, placements, notes, activity, and
  // analysis runs (see prisma/schema.prisma — Cascade on each child).
  const deletedCandidates =
    preview.candidates.length > 0
      ? (
          await prisma.candidate.deleteMany({
            where: { id: { in: preview.candidates.map((c) => c.id) } },
          })
        ).count
      : 0;

  const deletedRatePeople =
    preview.ratePeople.length > 0
      ? (
          await prisma.rateCardPerson.deleteMany({
            where: { id: { in: preview.ratePeople.map((p) => p.id) } },
          })
        ).count
      : 0;

  return { ...preview, deletedCandidates, deletedRatePeople };
}
