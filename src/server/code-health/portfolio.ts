import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { summariseRepo, workItemsFor, type PortfolioRepo, type WorkItem } from "@/lib/code-portfolio";
import type { CodeHealthReport } from "@/types/code-health";

/**
 * Every GitHub repository this workspace has measured, latest measure first, plus the
 * work items the planner ranks. The scope rule is the scan list's (src/server/pulse.ts
 * listPulseScans): a scoped viewer sees their clients' repositories and the ones they
 * scanned themselves, nothing else.
 */

export interface PortfolioScope {
  /** null = unscoped (admin, or trusted API caller). */
  clientIds: string[] | null;
  triggeredByUserId: string | null;
}

export interface CodePortfolio {
  repos: PortfolioRepo[];
  items: WorkItem[];
  /** Repository scans whose code could not be measured, so they are named rather than missing. */
  unmeasured: { repo: string; scanId: string; reason: string }[];
}

/** How many scans to read the score history from. Enough for a year of weekly monitors on a few dozen repos. */
const HISTORY_SCANS = 2_000;

export async function loadCodePortfolio(scope: PortfolioScope): Promise<CodePortfolio> {
  const workspace = await prisma.workspace.findFirst({ where: { slug: DEFAULT_WORKSPACE_SLUG }, select: { id: true } });
  if (!workspace) return { repos: [], items: [], unmeasured: [] };

  const scopedByClient = scope.clientIds != null ? { clientId: { in: scope.clientIds.length ? scope.clientIds : ["__none__"] } } : null;
  const scans = await prisma.pulseScan.findMany({
    where: {
      workspaceId: workspace.id,
      inputType: "GITHUB_REPO",
      status: "COMPLETED",
      inputGithubRepo: { not: null },
      ...(scopedByClient ? (scope.triggeredByUserId ? { OR: [scopedByClient, { triggeredByUserId: scope.triggeredByUserId }] } : scopedByClient) : {}),
    },
    select: { id: true, inputGithubRepo: true, projectName: true, completedAt: true, client: { select: { name: true } } },
    orderBy: { completedAt: "desc" },
    take: HISTORY_SCANS,
  });
  if (scans.length === 0) return { repos: [], items: [], unmeasured: [] };

  // The score of every measured scan, read straight out of the JSON so the (large) reports
  // of older scans are never loaded. ⚠️ Raw SQL is invisible to the type checker (§50), so
  // the shape is checked below rather than trusted.
  const ids = scans.map((s) => s.id);
  const scoreRows = await prisma.$queryRaw<{ id: string; score: number | null; repo: string | null }[]>(Prisma.sql`
    SELECT id,
           ("agentData"->'codeHealth'->>'score')::int AS score,
           "agentData"->'codeHealth'->>'repo' AS repo
    FROM "PulseScan"
    WHERE id IN (${Prisma.join(ids)})
  `);
  const scoreOf = new Map(scoreRows.filter((r) => typeof r.score === "number").map((r) => [r.id, r.score as number]));

  // Latest MEASURED scan per repository. A newer scan whose measure did not run does not
  // hide the last good one; it is listed as unmeasured instead.
  const byRepo = new Map<string, typeof scans>();
  for (const s of scans) {
    const key = s.inputGithubRepo!.toLowerCase();
    byRepo.set(key, [...(byRepo.get(key) ?? []), s]);
  }
  const latestIds: string[] = [];
  const unmeasured: CodePortfolio["unmeasured"] = [];
  for (const list of byRepo.values()) {
    const measured = list.find((s) => scoreOf.has(s.id));
    if (measured) latestIds.push(measured.id);
    else unmeasured.push({ repo: list[0].inputGithubRepo!, scanId: list[0].id, reason: "The code could not be measured on any scan of this repository." });
  }

  const full = await prisma.pulseScan.findMany({ where: { id: { in: latestIds } }, select: { id: true, agentData: true } });
  const reportOf = new Map(full.map((f) => [f.id, (f.agentData as { codeHealth?: CodeHealthReport | null } | null)?.codeHealth ?? null]));

  const repos: PortfolioRepo[] = [];
  const items: WorkItem[] = [];
  for (const list of byRepo.values()) {
    const latest = list.find((s) => reportOf.get(s.id));
    const report = latest ? reportOf.get(latest.id) : null;
    if (!latest || !report || typeof report.score !== "number" || !report.totals) continue;
    const history = list
      .filter((s) => scoreOf.has(s.id) && s.completedAt)
      .map((s) => ({ at: s.completedAt!.toISOString(), score: scoreOf.get(s.id)! }))
      .reverse();
    repos.push(summariseRepo(report, { scanId: latest.id, projectName: latest.projectName, clientName: latest.client?.name ?? null, history }));
    items.push(...workItemsFor(report));
  }
  repos.sort((a, b) => a.score - b.score || a.repo.localeCompare(b.repo));
  return { repos, items, unmeasured };
}
