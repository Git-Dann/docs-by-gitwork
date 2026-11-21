import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { candidateBulkImportSchema } from "@/server/validators";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

// ⚠️ Admin is read from the DATABASE, not from `session.user.role`. A session carries the
// role it was minted with, so a just-archived or just-demoted admin kept these three
// routes — which delete demo data, rewrite dev groups and bulk-import candidates — until
// their token turned over. §88 replaced that pattern everywhere else; three byte-identical
// copies of the local helper were left behind here.

/**
 * POST /api/codeclear/admin/bulk-import-candidates
 *
 * Accepts up to 500 candidate rows per call. Validates each row, dedupes
 * by (workspaceId, githubHandle), creates records with origin defaulting
 * to EXTERNAL (the marketplace use case). Returns a per-row summary.
 *
 * Admin only — same gating as the demo data cleanup endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    assertAtLeastAdmin(await requireAuthedUser(request));

    const workspace = { id: await workspaceIdForRequest(request) };
    const body = candidateBulkImportSchema.parse(await request.json());

    // Pre-fetch all existing handles in the workspace so we can dedupe in one
    // round trip rather than per-row.
    const existing = await prisma.candidate.findMany({
      where: {
        workspaceId: workspace.id,
        githubHandle: { in: body.candidates.map((c) => c.githubHandle) },
      },
      select: { githubHandle: true },
    });
    const existingHandles = new Set(existing.map((c) => c.githubHandle));

    const created: Array<{ id: string; name: string; githubHandle: string }> = [];
    const skipped: Array<{ githubHandle: string; reason: string }> = [];
    const errors: Array<{ githubHandle: string; error: string }> = [];

    for (const row of body.candidates) {
      if (existingHandles.has(row.githubHandle)) {
        skipped.push({
          githubHandle: row.githubHandle,
          reason: "Already exists in this workspace",
        });
        continue;
      }

      try {
        const candidate = await prisma.candidate.create({
          data: {
            workspaceId: workspace.id,
            name: row.name,
            githubHandle: row.githubHandle,
            primaryStack: row.primaryStack,
            techStacks: row.techStacks?.length ? row.techStacks : [row.primaryStack],
            email: row.email ?? null,
            linkedinUrl: row.linkedinUrl ?? null,
            cvUrl: row.cvUrl ?? null,
            portfolioUrl: row.portfolioUrl ?? null,
            yearsExperience: row.yearsExperience ?? null,
            hourlyRate: row.hourlyRate ?? null,
            currency: row.currency ?? null,
            timezone: row.timezone ?? null,
            location: row.location ?? null,
            bio: row.bio ?? null,
            origin: body.origin,
            status: "SOURCED",
            tier: "TIER_3", // Unscored → derived tier is T3 until a scan runs.
            signalSources: ["GITHUB"],
          },
          select: { id: true, name: true, githubHandle: true },
        });
        created.push({ ...candidate, githubHandle: candidate.githubHandle ?? row.githubHandle });
        // Track new handles so a duplicate within the same import is caught.
        existingHandles.add(row.githubHandle);
      } catch (error) {
        errors.push({
          githubHandle: row.githubHandle,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return apiOk({
      total: body.candidates.length,
      created,
      skipped,
      errors,
    });
  } catch (error) {
    return fromError(error);
  }
}
