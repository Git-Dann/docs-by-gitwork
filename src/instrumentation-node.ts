/**
 * Node-only server start-up (loaded by src/instrumentation.ts).
 *
 * Attaches the Postgres second tier to the GitHub conditional-request cache (CLAUDE.md §84.15).
 * Done here, not by an import in src/lib/github.ts, because github.ts is also bundled for the
 * browser and must not pull in Prisma or Node built-ins. If anything fails, the cache stays
 * memory-only.
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
