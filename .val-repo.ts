// Validate a check family against a REAL local clone, using the SAME file
// selection the live scanner uses (`selectFilesToRead`) so the sample — and
// therefore every absence finding's confidence — matches production.
import { readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { selectFilesToRead, resolveSnapshotShape, selectShapeProbes } from "./src/server/pulse-checks/native-repo";
import { evaluateIosChecks } from "./src/server/pulse-checks/ios-app";
import { evaluateFlutterChecks } from "./src/server/pulse-checks/flutter-app";
import { evaluateAndroidChecks } from "./src/server/pulse-checks/android-app";
import { evaluateDesktopChecks } from "./src/server/pulse-checks/desktop-app";
import { evaluateReactNativeChecks } from "./src/server/pulse-checks/react-native-app";
import { evaluateChromeExtensionChecks } from "./src/server/pulse-checks/chrome-extension";
import { evaluateCliChecks } from "./src/server/pulse-checks/cli-tool";
import { evaluateWebSourceChecks } from "./src/server/pulse-checks/web-repo-source";
import { evaluateCleanlinessChecks } from "./src/server/pulse-checks/code-cleanliness";
import type { RepoSnapshot } from "./src/server/pulse-checks/native-mobile";

const root = process.argv[2];
const forced = process.argv[3];
const paths = execSync("git ls-files", { cwd: root, encoding: "utf8", maxBuffer: 256e6 })
  .split("\n").filter(Boolean);

const entries = paths.map((p) => {
  try { return { path: p, size: statSync(join(root, p)).size }; } catch { return { path: p, size: 0 }; }
});

// Round 0 exactly as the scanner does it: read the tiny probe files, then let
// the REAL detector pick the shape. Guessing here would validate a family the
// live scan would never have run.
const probes = new Map<string, string>();
for (const p of selectShapeProbes(paths)) {
  try { probes.set(p, readFileSync(join(root, p), "utf8")); } catch { /* ignore */ }
}
const shape = (forced ?? resolveSnapshotShape(paths, probes)) as Parameters<typeof selectFilesToRead>[1];
const { config, source } = selectFilesToRead(entries, shape);

const files = new Map<string, string>();
for (const p of [...config, ...source]) {
  try { files.set(p, readFileSync(join(root, p), "utf8")); } catch { /* binary */ }
}

const snapshot: RepoSnapshot = { owner: "Git-Dann", repo: root.split("/").pop()!, paths, files, truncated: false, accessible: true };

const families: Record<string, (s: RepoSnapshot) => unknown[]> = {
  ios: evaluateIosChecks, flutter: evaluateFlutterChecks, android: evaluateAndroidChecks,
  "react-native": evaluateReactNativeChecks, "chrome-extension": evaluateChromeExtensionChecks,
  cli: evaluateCliChecks, none: evaluateWebSourceChecks,
  electron: (s) => evaluateDesktopChecks(s, "electron"), tauri: (s) => evaluateDesktopChecks(s, "tauri"),
};

console.log(`repo=${snapshot.repo} shape=${shape} files=${paths.length} config=${config.length} sampled=${source.length}`);
const run = families[shape] ?? evaluateWebSourceChecks;
const checks = [...(run(snapshot) as never[]), ...(evaluateCleanlinessChecks(snapshot) as never[])] as {
  checkKey: string; status: string; confidence?: string; label: string; detail?: string; evidence?: string; category: string;
}[];
console.log(`checks emitted: ${checks.length}\n`);

const order = ["FAIL", "WARN", "INCONCLUSIVE", "EVIDENCE_REQUIRED", "PASS", "SKIPPED", "NOT_APPLICABLE"];
for (const st of order) {
  const group = checks.filter((c) => c.status === st);
  if (!group.length) continue;
  console.log(`──────── ${st} (${group.length}) ────────`);
  for (const c of group) {
    console.log(`  ${c.checkKey}  [${c.category}] (${c.confidence ?? "-"})`);
    console.log(`    ${c.label}`);
    if (st === "FAIL" || st === "WARN") {
      if (c.detail) console.log(`    → ${c.detail.slice(0, 300)}`);
      if (c.evidence) console.log(`    ev: ${String(c.evidence).slice(0, 200)}`);
    }
  }
  console.log();
}
