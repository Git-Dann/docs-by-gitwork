import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertSuperAdminOrApiKey, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { ensureBaseRecords } from "@/server/bootstrap";
import { issueCountermark, revokeCountermark } from "@/server/provenance/issue";
import { SAS_1 } from "@/server/provenance/standard";
import { DEMO_NAMES, SCENARIOS } from "@/server/provenance/demo-scenarios";

export const dynamic = "force-dynamic";
// Six scans, each examined by the real engine, plus a revoke and a supersede.
export const maxDuration = 120;

/**
 * Seed Provenance demo data — four real countermarks covering every grade, plus a revoked one
 * and a superseded pair.
 *
 * ── The one design rule here ────────────────────────────────────────────────────
 * It does NOT fabricate countermark rows. It builds realistic PulseScan + PulseScanCheck
 * records and then runs the REAL `issueCountermark`, so every clause verdict, blind spot,
 * grade, digest and seal on screen is genuine engine output. Two reasons that matters:
 *
 *   1. A demo whose certificate was hand-written proves nothing about the product, and
 *      would drift the moment the standard changed. This one breaks loudly if the engine
 *      regresses — the grades below are asserted in the response.
 *   2. It is the only end-to-end exercise of the issue path that exists, because there is
 *      no staging environment and `/app/provenance` cannot be self-screenshotted (§ build
 *      checklist "Verification honesty"). Running this IS the integration test.
 *
 * Idempotent: it deletes anything it previously created (matched on the demo project
 * names) before re-seeding, so it can be run repeatedly while demoing.
 */

export async function POST(request: Request) {
  try {
    assertSuperAdminOrApiKey(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();

    // Idempotent re-seed. Countermarks are deleted explicitly because `scanId` is a loose
    // id by design (the attestation must survive its scan), so no cascade reaches them.
    await prisma.countermark.deleteMany({
      where: { workspaceId: workspace.id, subjectName: { in: DEMO_NAMES } },
    });
    await prisma.pulseScan.deleteMany({
      where: { workspaceId: workspace.id, projectName: { in: DEMO_NAMES } },
    });

    const issued: Array<Record<string, unknown>> = [];
    const mismatches: string[] = [];

    for (const scenario of SCENARIOS) {
      const scan = await prisma.pulseScan.create({
        data: {
          workspaceId: workspace.id,
          projectName: scenario.projectName,
          inputType: scenario.repo ? "GITHUB_REPO" : "URL",
          inputUrl: scenario.url,
          inputGithubRepo: scenario.repo,
          status: "COMPLETED",
          scanVersion: "demo-2026.07",
          healthScore: null,
          completedAt: new Date(),
          checksCompletedAt: new Date(),
          checks: {
            create: scenario.checks.map((c, i) => ({
              category: c.category,
              checkKey: c.checkKey,
              label: c.label,
              status: c.status,
              detail: c.detail,
              sortOrder: i,
              confidence: c.confidence,
              confidenceReason: "Seeded demo evidence.",
            })),
          },
        },
      });

      let mark = await issueCountermark({
        workspaceId: workspace.id,
        scanId: scan.id,
        issuerName: "Gitwork (demo)",
      });

      // Assert the engine agreed. A demo that quietly shows the wrong grade is worse than
      // no demo, because it would be believed.
      if (mark.grade !== scenario.expectGrade) {
        mismatches.push(`${scenario.projectName}: expected ${scenario.expectGrade}, engine returned ${mark.grade}`);
      }

      if (scenario.issueTwice) {
        // Second mark for the same subject → the first flips to SUPERSEDED.
        mark = await issueCountermark({
          workspaceId: workspace.id,
          scanId: scan.id,
          issuerName: "Gitwork (demo)",
        });
      }

      if (scenario.revokeReason) {
        mark = await revokeCountermark({
          workspaceId: workspace.id,
          id: mark.id,
          reason: scenario.revokeReason,
          byName: "Gitwork (demo)",
        });
      }

      issued.push({
        subject: mark.subjectName,
        grade: mark.grade,
        status: mark.status,
        clauses: `${mark.coverage.measured}/${mark.coverage.total} assessed`,
        blindSpots: mark.blindSpots.length,
        sealed: mark.seal !== null,
        certificate: `/countermark/${mark.token}`,
      });
    }

    return apiOk({
      ok: mismatches.length === 0,
      seeded: issued.length,
      standard: `${SAS_1.id} v${SAS_1.version}`,
      countermarks: issued,
      // Surfaced rather than thrown: the rows are still useful for a demo, but a mismatch
      // means the engine no longer behaves as this fixture expects and wants looking at.
      gradeMismatches: mismatches,
      note:
        mismatches.length === 0
          ? "Every grade matched the engine's own output. Open any certificate path above — no auth required."
          : "SEEDED, BUT the engine returned unexpected grades — see gradeMismatches.",
    });
  } catch (error) {
    return fromError(error);
  }
}
