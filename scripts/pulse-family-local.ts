/**
 * Run a Pulse source-check family against a LOCAL clone, the way production would.
 *
 *   npx tsx scripts/pulse-family-local.ts <path-to-clone> [--all]
 *
 * Production reads a repo through the GitHub API (native-repo.ts buildSnapshot): a tree
 * listing, a handful of shape probes, then a capped, ranked set of config and source
 * files. This rebuilds that snapshot from a clone with the SAME selection functions
 * (selectShapeProbes, resolveSnapshotShape, selectFilesToRead, the CLI bin targets), so
 * the checks see what they would see in production, with no API calls and no rate limit.
 * That is what makes validating a family against real repositories cheap (CLAUDE.md §37:
 * "validating a family against a real codebase is what finds the wrong ones").
 *
 * Prints one JSON line per check: { checkKey, status, confidence, detail, evidence }.
 * --all prints PASS too; by default only checks that did not pass.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { binEntries, evaluateCliChecks } from "@/server/pulse-checks/cli-tool";
import { evaluateChromeExtensionChecks, isChromeExtension } from "@/server/pulse-checks/chrome-extension";
import { evaluateExtensionExtendedChecks } from "@/server/pulse-checks/chrome-extension-extended";
import { evaluateDesktopChecks } from "@/server/pulse-checks/desktop-app";
import { evaluateDesktopExtendedChecks } from "@/server/pulse-checks/desktop-app-extended";
import { evaluateAndroidChecks } from "@/server/pulse-checks/android-app";
import { evaluateAndroidExtendedChecks } from "@/server/pulse-checks/android-app-extended";
import { evaluateReactNativeChecks } from "@/server/pulse-checks/react-native-app";
import { evaluateCrossPlatformExtendedChecks } from "@/server/pulse-checks/cross-platform-extended";
import { evaluateIosChecks } from "@/server/pulse-checks/ios-app";
import { evaluateFlutterChecks } from "@/server/pulse-checks/flutter-app";
import { detectNativePlatform, type RepoSnapshot } from "@/server/pulse-checks/native-mobile";
import { resolveSnapshotShape, selectFilesToRead, selectShapeProbes } from "@/server/pulse-checks/native-repo";
import { parsePackageManifest } from "@/server/pulse-checks/project-shape";
import type { PulseScanCheckInput } from "@/types/pulse";

const MAX_BLOB = 512 * 1024;

function read(dir: string, path: string): string | null {
  try {
    const st = statSync(join(dir, path));
    if (!st.isFile() || st.size > MAX_BLOB) return null;
    return readFileSync(join(dir, path), "utf8");
  } catch {
    return null;
  }
}

function snapshotOf(dir: string): { snapshot: RepoSnapshot; shape: string } {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: dir, maxBuffer: 256 * 1024 * 1024 }).toString().split("\0").filter(Boolean);
  const files = new Map<string, string>();
  for (const p of selectShapeProbes(paths)) {
    const t = read(dir, p);
    if (t !== null) files.set(p, t);
  }
  const shape = resolveSnapshotShape(paths, files);
  const sizes = paths.map((p) => {
    try {
      return { path: p, size: statSync(join(dir, p)).size };
    } catch {
      return { path: p, size: 0 };
    }
  });
  const { config, source } = selectFilesToRead(sizes, shape);
  const extra: string[] = [];
  if (shape === "cli") {
    const pkg = parsePackageManifest(files.get("package.json") ?? null);
    const known = new Set(paths.map((p) => p.toLowerCase()));
    for (const { path } of pkg ? binEntries(pkg) : []) {
      const clean = path.replace(/^\.\//, "");
      if (known.has(clean.toLowerCase())) extra.push(clean);
    }
    if (paths.includes(".npmrc")) extra.push(".npmrc");
  }
  for (const p of new Set([...config, ...source, ...extra])) {
    if (files.has(p)) continue;
    const t = read(dir, p);
    if (t !== null) files.set(p, t);
  }
  return { snapshot: { owner: "local", repo: dir, paths, files, truncated: false, accessible: true }, shape };
}

function run(snapshot: RepoSnapshot, shape: string): PulseScanCheckInput[] {
  if (shape === "electron" || shape === "tauri") return [...evaluateDesktopChecks(snapshot, shape), ...evaluateDesktopExtendedChecks(snapshot, shape)];
  if (shape === "cli") return evaluateCliChecks(snapshot);
  if (shape === "chrome-extension" || isChromeExtension(snapshot)) return [...evaluateChromeExtensionChecks(snapshot), ...evaluateExtensionExtendedChecks(snapshot)];
  const platform = detectNativePlatform(snapshot.paths, snapshot.files.get("package.json") ?? null);
  if (shape === "react-native") return [...evaluateReactNativeChecks(snapshot), ...evaluateCrossPlatformExtendedChecks(snapshot, "react-native")];
  if (platform === "android") return [...evaluateAndroidChecks(snapshot), ...evaluateAndroidExtendedChecks(snapshot)];
  if (platform === "ios") return evaluateIosChecks(snapshot);
  if (platform === "flutter") return evaluateFlutterChecks(snapshot);
  return [];
}

const dir = process.argv[2];
if (!dir) {
  console.error("usage: tsx scripts/pulse-family-local.ts <clone-dir> [--all]");
  process.exit(2);
}
const all = process.argv.includes("--all");
const { snapshot, shape } = snapshotOf(dir);
const checks = run(snapshot, shape);
console.log(JSON.stringify({ shape, paths: snapshot.paths.length, filesRead: snapshot.files.size, checks: checks.length }));
for (const c of checks) {
  if (!all && c.status === "PASS") continue;
  console.log(JSON.stringify({ checkKey: c.checkKey, status: c.status, confidence: c.confidence ?? null, detail: c.detail ?? null, evidence: c.evidence ?? null }));
}
