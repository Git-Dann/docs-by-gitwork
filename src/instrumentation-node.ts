/**
 * Node-only server start-up (loaded by src/instrumentation.ts).
 *
 * 1. Attaches the Postgres second tier to the GitHub conditional-request cache (CLAUDE.md §84.15).
 *    Done here, not by an import in src/lib/github.ts, because github.ts is also bundled for the
 *    browser and must not pull in Prisma or Node built-ins. If anything fails, the cache stays
 *    memory-only.
 * 2. Starts first-time setup (src/server/bootstrap.ts `runFirstBootSetup`) so it runs at start-up
 *    instead of on whichever request happens to come first (CLAUDE.md §88). Not awaited: the
 *    server serves at once, and a request that arrives first awaits the same run. A failure is
 *    logged and the next request retries, exactly as before. Skipped during `next build`.
 */
import { setGithubCacheStore } from "@/lib/github";
import { prisma } from "@/lib/prisma";
import { createGithubCacheStore } from "@/server/github-cache-store";

if (process.env.DATABASE_URL) {
  try {
    setGithubCacheStore(createGithubCacheStore(prisma));
    // Open the pool now, so the first lookups after a deploy do not time out on connect.
    void prisma.$connect().catch(() => undefined);
  } catch (err) {
    console.warn(
      `[github] persistent cache not attached; using memory only: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/** Whether this process should start first-time setup now. Exported for the test. */
export function shouldRunFirstBootSetup(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.DATABASE_URL) && env.NEXT_PHASE !== "phase-production-build";
}

if (shouldRunFirstBootSetup()) {
  // Dynamic import keeps the seeding tree out of start-up when it isn't wanted.
  void import("@/server/bootstrap")
    .then(({ runFirstBootSetup }) => runFirstBootSetup())
    .then(() => console.info("[bootstrap] first-time setup finished at start-up"))
    .catch((err) =>
      console.warn(
        `[bootstrap] first-time setup failed at start-up; the next request will retry: ${err instanceof Error ? err.message : err}`,
      ),
    );
}
