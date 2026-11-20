import { apiOk } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — public. `?deep=1` also asks the database for `SELECT 1` and answers 503 when
 * it can't, so the deploy's health check (and anything else that asks) can tell "Node is up" from
 * "the app can serve a page". The plain form never touches the database.
 */
export async function GET(req: Request) {
  const commit = process.env.COMMIT_SHA ?? null;
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  let database: "ok" | "unreachable" | undefined;
  if (deep) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok";
    } catch {
      database = "unreachable";
    }
  }
  const body = {
    ok: database !== "unreachable",
    service: "foundry-by-gitwork",
    version: process.env.npm_package_version ?? "0.1.0",
    // Deploy provenance — injected at Docker build via the deploy workflow.
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    builtAt: process.env.BUILD_TIME ?? null,
    timestamp: new Date().toISOString(),
    ...(database ? { database } : {}),
  };
  return apiOk(body, database === "unreachable" ? { status: 503 } : undefined);
}
