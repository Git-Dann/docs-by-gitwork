import { apiOk } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { cronHealth } from "@/server/cron-watchdog";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — public. `?deep=1` also asks the database for `SELECT 1` and answers 503 when
 * it can't, so the deploy's health check (and anything else that asks) can tell "Node is up" from
 * "the app can serve a page". The plain form never touches the database.
 *
 * `?cron=1` answers 503 when a scheduled job in deploy/crontab has stopped being called (names
 * only; the job list is in the public repo anyway). Probed from GitHub by foundry-watchdog.yml,
 * because it is the only way to notice the every-minute `jobs` worker itself stopping.
 */
export async function GET(req: Request) {
  const commit = process.env.COMMIT_SHA ?? null;
  const params = new URL(req.url).searchParams;
  const deep = params.get("deep") === "1";
  const cron = params.get("cron") === "1";
  let database: "ok" | "unreachable" | undefined;
  if (deep) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok";
    } catch {
      database = "unreachable";
    }
  }
  let stoppedJobs: { name: string; silentMinutes: number }[] | undefined;
  let cronCheck: "ok" | "stopped" | "unreachable" | undefined;
  if (cron) {
    try {
      const { stale } = await cronHealth();
      stoppedJobs = stale.map((s) => ({ name: s.name, silentMinutes: s.silentMinutes }));
      cronCheck = stale.length ? "stopped" : "ok";
    } catch {
      cronCheck = "unreachable";
    }
  }
  const failing = database === "unreachable" || (cronCheck !== undefined && cronCheck !== "ok");
  const body = {
    ok: !failing,
    service: "foundry-by-gitwork",
    version: process.env.npm_package_version ?? "0.1.0",
    // Deploy provenance — injected at Docker build via the deploy workflow.
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    builtAt: process.env.BUILD_TIME ?? null,
    timestamp: new Date().toISOString(),
    ...(database ? { database } : {}),
    ...(cronCheck ? { cron: cronCheck, stoppedJobs } : {}),
  };
  return apiOk(body, failing ? { status: 503 } : undefined);
}
