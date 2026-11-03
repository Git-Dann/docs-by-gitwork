// The scan page's source, for tests that assert something is rendered on it. The page is
// pulse-scan-results.tsx plus the pieces it was split into under ./scan/, so a test that
// read the one file would stop seeing anything that moved.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readScanPageSource(root = process.cwd()): string {
  const dir = join(root, "src/components/pulse/scan");
  const files = [
    join(root, "src/components/pulse/pulse-scan-results.tsx"),
    ...readdirSync(dir).filter((f) => f.endsWith(".tsx")).sort().map((f) => join(dir, f)),
  ];
  return files.map((f) => readFileSync(f, "utf8")).join("\n");
}
