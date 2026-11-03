/**
 * pulse-platform-matrix — what does Pulse ACTUALLY run for each dropdown platform?
 *
 * Runs the real deterministic scan engine (runLiteScan — the same core the in-app scan
 * and the MCP tool use) for every platform in the scan form's dropdown, against real
 * targets of every shape, and records exactly which checks each run produced.
 *
 * It exists because "the code says it filters by platform" has repeatedly turned out
 * not to be the same thing as "the scan only reports what applies". This measures the
 * second one.
 *
 *   GITHUB_TOKEN=$(gh auth token) npx tsx scripts/pulse-platform-matrix.ts [--out file.json]
 *     [--only url|repo] [--platform IOS_APP,...] [--target <id>,...]
 *
 * No database: runLiteScan is deterministic and AI-free. Needs network.
 */
import { writeFileSync } from "node:fs";
import { runLiteScan } from "@/server/pulse-lite/run-lite-scan";
import { SUPPORTED_PULSE_PLATFORMS } from "@/server/pulse-checks/platform-applicability";

export interface MatrixTarget {
  id: string;
  inputType: "URL" | "GITHUB_REPO";
  value: string;
  /** What the target really is — the ground truth a reviewer judges against. */
  is: string;
}

export const MATRIX_TARGETS: MatrixTarget[] = [
  { id: "web-saas", inputType: "URL", value: "https://linear.app", is: "a SaaS web app" },
  { id: "web-marketing", inputType: "URL", value: "https://gitwork.co.uk", is: "an agency marketing site" },
  { id: "web-bare", inputType: "URL", value: "https://example.com", is: "a single static page" },
  { id: "api", inputType: "URL", value: "https://api.github.com", is: "a JSON REST API" },
  { id: "app-store", inputType: "URL", value: "https://apps.apple.com/gb/app/beyond-nutrition-uk/id1632891361", is: "an iOS App Store listing" },
  { id: "play-store", inputType: "URL", value: "https://play.google.com/store/apps/details?id=com.trainerize.beyondnutritionuk&hl=en_GB", is: "an Android Google Play listing" },
  { id: "chrome-store", inputType: "URL", value: "https://chromewebstore.google.com/detail/bitwarden-password-manager/nngceckbapebfimnlniiiahkandclblb", is: "a Chrome Web Store listing" },
  { id: "chrome-store-gone", inputType: "URL", value: "https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeg", is: "a Chrome Web Store item that has been removed (the store still answers 200)" },
  { id: "repo-ios", inputType: "GITHUB_REPO", value: "kickstarter/ios-oss", is: "a native iOS (Swift) app" },
  { id: "repo-android", inputType: "GITHUB_REPO", value: "android/nowinandroid", is: "a native Android (Kotlin) app" },
  { id: "repo-flutter", inputType: "GITHUB_REPO", value: "flutter/gallery", is: "a Flutter app" },
  { id: "repo-rn", inputType: "GITHUB_REPO", value: "mattermost/mattermost-mobile", is: "a React Native app" },
  { id: "repo-electron", inputType: "GITHUB_REPO", value: "electron/fiddle", is: "an Electron desktop app" },
  { id: "repo-extension", inputType: "GITHUB_REPO", value: "darkreader/darkreader", is: "a browser extension" },
  { id: "repo-cli", inputType: "GITHUB_REPO", value: "sindresorhus/np", is: "a CLI published to npm" },
  { id: "repo-web", inputType: "GITHUB_REPO", value: "vercel/commerce", is: "a Next.js web app" },
  { id: "repo-api", inputType: "GITHUB_REPO", value: "gothinkster/node-express-realworld-example-app", is: "an Express API backend" },
];

export interface MatrixCheck {
  key: string;
  category: string;
  status: string;
}

export interface MatrixRun {
  target: string;
  inputType: string;
  value: string;
  is: string;
  platform: string;
  executionPlatform: string | null;
  ms: number;
  error: string | null;
  collectors: string[];
  checks: MatrixCheck[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function runOne(target: MatrixTarget, platform: string): Promise<MatrixRun> {
  const started = performance.now();
  try {
    const result = await runLiteScan({
      inputType: target.inputType,
      url: target.inputType === "URL" ? target.value : undefined,
      githubRepo: target.inputType === "GITHUB_REPO" ? target.value : undefined,
      platform,
      includePageSpeed: false,
      renderJs: false,
    });
    return {
      target: target.id, inputType: target.inputType, value: target.value, is: target.is, platform,
      executionPlatform: result.executionPlatform ?? null,
      ms: Math.round(performance.now() - started),
      error: null,
      collectors: result.collectorExecutions.map((c) => `${c.name}:${c.outcome}`),
      checks: result.checks.map((c) => ({ key: c.checkKey, category: c.category, status: c.status })),
    };
  } catch (error) {
    return {
      target: target.id, inputType: target.inputType, value: target.value, is: target.is, platform,
      executionPlatform: null, ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error), collectors: [], checks: [],
    };
  }
}

async function main() {
  const only = arg("only");
  const platforms = (arg("platform")?.split(",") ?? [...SUPPORTED_PULSE_PLATFORMS]);
  const targetIds = arg("target")?.split(",");
  const targets = MATRIX_TARGETS.filter((t) =>
    (!only || (only === "url" ? t.inputType === "URL" : t.inputType === "GITHUB_REPO")) &&
    (!targetIds || targetIds.includes(t.id)));
  const out = arg("out") ?? "pulse-platform-matrix.json";

  const runs: MatrixRun[] = [];
  // One target at a time, its platforms sequentially: the repo snapshot is memoised per
  // process, and the stores rate-limit bursts — both reward not fanning out.
  for (const target of targets) {
    for (const platform of platforms) {
      const run = await runOne(target, platform);
      runs.push(run);
      const reported = run.checks.filter((c) => c.status !== "SKIPPED" && c.status !== "NOT_APPLICABLE").length;
      console.log(`${target.id.padEnd(15)} ${platform.padEnd(22)} ${String(run.ms).padStart(6)}ms  reported=${String(reported).padStart(4)}  total=${String(run.checks.length).padStart(4)}${run.error ? `  ERROR ${run.error}` : ""}`);
      writeFileSync(out, JSON.stringify({ targets: MATRIX_TARGETS, runs }, null, 1));
    }
  }
  console.log(`wrote ${out} — ${runs.length} runs`);
}

main().catch((error) => { console.error(error); process.exit(1); });
