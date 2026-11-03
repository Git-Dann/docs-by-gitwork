/**
 * Every route that names one Pulse scan or one study looks it up inside the caller's
 * workspace (multi-tenant Phase 2.2b). Fails naming any route that falls back to Gitwork's
 * workspace or finds its row by id alone.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/app/api/pulse/scans/[scanId]", "src/app/api/study/studies"];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : routes(p);
    return name === "route.ts" ? [p] : [];
  });
}

const files = ROOTS.flatMap(routes);

describe("Pulse scan and Study routes", () => {
  it("found the routes to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s stays in the caller's workspace", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src, "falls back to Gitwork's workspace").not.toMatch(/ensureBaseRecords\(/);
    expect(src, "finds a scan or study by id alone").not.toMatch(
      /(pulseScan|study)\.findUnique\(\{\s*where:\s*\{\s*id:\s*(scanId|studyId)\s*\}/,
    );
  });
});
