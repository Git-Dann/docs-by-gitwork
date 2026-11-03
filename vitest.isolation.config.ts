import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The isolation suite (`npm run test:isolation`). Kept apart from vitest.config.ts because it
 * needs a real Postgres — `npm test` and `npm run verify` stay database-free.
 * Prepare the database first with scripts/isolation-db.sh. See docs/build-checklist.md §4b.
 */
const url = process.env.ISOLATION_DATABASE_URL ?? "postgresql://foundry:foundry@localhost:5432/foundry_isolation";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/isolation/**/*.test.ts"],
    setupFiles: ["./tests/isolation/setup.ts"],
    // One process, one file, in order: the calls share one database.
    fileParallelism: false,
    testTimeout: 60_000,
    // Route handlers log every refusal; the report file carries what matters.
    onConsoleLog: () => false,
    env: {
      DATABASE_URL: url,
      DIRECT_URL: url,
      NODE_ENV: "test",
      // Signing secrets some handlers need to construct; never real values.
      AUTH_SECRET: "isolation-suite-secret-0123456789abcdef",
      ENCRYPTION_KEY: "aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWk=",
    },
  },
});
