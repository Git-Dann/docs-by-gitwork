// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM-FAMILY COVERAGE — does the dropdown selection actually get checked?
//
// WHY THIS EXISTS. The scan dropdown was purely SUBTRACTIVE. Picking "iOS app"
// removed five irrelevant categories and fed a label into the AI prompt; it never
// caused a single one of the 39 iOS checks to run. Those fire on repo DETECTION,
// so:
//
//   • Pick "iOS app", scan an App Store URL → store-listing checks, and none of
//     the iOS family. Nothing said so.
//   • Pick "Chrome extension", scan the Web Store URL → none of the 12 extension
//     checks. Nothing said so.
//   • Pick "Web app", scan an iOS repo → the iOS family runs anyway, because
//     detection is what drives it.
//
// Detection winning over a wrong selection is right — a user who picks the wrong
// entry should still get a correct scan. What was wrong is that the gap was
// SILENT, so a scan that could not run the checks the user asked for looked
// identical to one that ran them and found nothing. That is the same disease as
// §35: "we could not look" rendering as "there is nothing there".
//
// This module makes the gap a finding. It is PURE — the caller supplies what it
// selected, what it scanned and what was detected.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

/** The shape names the snapshot builder resolves to. Kept as a string union so
 *  this module stays free of the I/O layer that owns the real type. */
export type CoverageShape =
  | "ios" | "android" | "flutter" | "react-native"
  | "electron" | "tauri" | "cli" | "chrome-extension" | "none";

export type CoverageInputType = "URL" | "GITHUB_REPO" | "FREE_TEXT";

/** What each dropdown entry promises, and how many checks are behind it. */
interface FamilySpec {
  /** Shapes that satisfy this selection. */
  shapes: CoverageShape[];
  /** Human name for the family, used in the message. */
  label: string;
  /**
   * Exact size of the family — the number of distinct checkKeys its module(s)
   * emit. This is QUOTED TO THE USER ("the 25 browser extension checks did NOT
   * run"), so an overstatement is the same defect class this whole module was
   * built to fix: claiming something about checks that do not exist.
   *
   * ⚠️ Hand-maintained numbers drift. `platform-coverage.reconcile.test.ts`
   * counts the keys in `sourceFiles` and fails if this disagrees — which is how
   * the browser-extension count was caught reading 26 against a family of 25.
   */
  count: number;
  /** The module(s) that emit this family, so the drift test can count them. */
  sourceFiles: string[];
}

/**
 * Dropdown value → the repo-source family it implies.
 *
 * Entries NOT listed here (WEB_APP, SAAS, MARKETING_SITE, OTHER) are graded by the
 * URL suite, which needs no repo — so there is nothing to warn about.
 */
export const PLATFORM_FAMILIES: Record<string, FamilySpec> = {
  IOS_APP: { shapes: ["ios"], label: "iOS", count: 39, sourceFiles: ["ios-app.ts"] },
  ANDROID_APP: { shapes: ["android"], label: "Android", count: 33, sourceFiles: ["android-app.ts"] },
  CROSS_PLATFORM_MOBILE: {
    shapes: ["flutter", "react-native"],
    label: "Flutter / React Native",
    count: 43,
    sourceFiles: ["flutter-app.ts", "react-native-app.ts"],
  },
  DESKTOP_APP: { shapes: ["electron", "tauri"], label: "Electron / Tauri", count: 33, sourceFiles: ["desktop-app.ts"] },
  CHROME_EXTENSION: {
    shapes: ["chrome-extension"],
    label: "browser extension",
    count: 25,
    sourceFiles: ["chrome-extension.ts"],
  },
  CLI_TOOL: { shapes: ["cli"], label: "CLI / published package", count: 22, sourceFiles: ["cli-tool.ts"] },
};

/** Friendly name for a detected shape, for the "we found X instead" message. */
const SHAPE_LABEL: Record<CoverageShape, string> = {
  ios: "a native iOS project",
  android: "a native Android project",
  flutter: "a Flutter project",
  "react-native": "a React Native project",
  electron: "an Electron desktop app",
  tauri: "a Tauri desktop app",
  cli: "a CLI / published npm package",
  "chrome-extension": "a browser extension",
  none: "a general web or service project",
};

/**
 * Build the coverage check.
 *
 * Deliberately never a FAIL. Scanning a URL when the deep checks need a repo is a
 * legitimate thing to do — you may not have the source — so this reports what was
 * and was not covered and tells the user how to get the rest. Marking it down
 * would penalise a project for how it was scanned rather than for what it is.
 */
export function buildPlatformCoverageCheck(input: {
  selectedPlatform: string;
  inputType: CoverageInputType;
  detectedShape: CoverageShape | null;
}): PulseScanCheckInput | null {
  const selected = (input.selectedPlatform ?? "").toUpperCase();
  const spec = PLATFORM_FAMILIES[selected];

  // A web-shaped selection is fully served by the URL suite — nothing to report.
  if (!spec) return null;

  const base = {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "platform_family_coverage",
    label: "Platform-specific checks ran for this project",
  } as const;

  // ── Scanned a URL, but the family needs source ─────────────────────────────
  if (input.inputType !== "GITHUB_REPO") {
    return {
      ...base,
      status: "SKIPPED",
      confidence: "HIGH",
      detail:
        `You scanned this as "${selected.replace(/_/g, " ").toLowerCase()}", but the ${spec.count} ${spec.label} ` +
        `checks read the project's SOURCE — token storage, build configuration, release logging, permissions — and ` +
        `none of that is visible from a URL. This scan therefore covers only what a URL can show. To get the full ` +
        `${spec.label} assessment, run a second scan with "GitHub repo" as the input type and point it at the ` +
        `repository. Nothing here is a pass or a failure for those checks: they did not run.`,
    };
  }

  const detected = input.detectedShape ?? "none";

  // ── Repo scanned and it matches ────────────────────────────────────────────
  if (spec.shapes.includes(detected)) {
    return {
      ...base,
      status: "PASS",
      confidence: "HIGH",
      detail: `Detected ${SHAPE_LABEL[detected]}, matching your "${selected.replace(/_/g, " ").toLowerCase()}" ` +
        `selection — the ${spec.label} check family ran against this repository's source.`,
    };
  }

  // ── Repo scanned, but it is a different shape ──────────────────────────────
  const detectedSpec = Object.values(PLATFORM_FAMILIES).find((f) => f.shapes.includes(detected));
  return {
    ...base,
    status: "WARN",
    confidence: "HIGH",
    detail:
      `You selected "${selected.replace(/_/g, " ").toLowerCase()}", but this repository looks like ` +
      `${SHAPE_LABEL[detected]}. ${detectedSpec
        ? `The ${detectedSpec.label} family ran instead — detection wins over the dropdown, so the findings above are ` +
          `about what this repo actually is, not what was selected.`
        : `No platform-specific family applies to it, so only the generic repo checks ran.`} ` +
      `The ${spec.count} ${spec.label} checks did NOT run. If the ${spec.label} code lives in a different ` +
      `repository — a common split for cross-platform products — scan that one separately; if this is the right ` +
      `repo, change the selection so the report is labelled correctly.`,
    evidence: `selected ${selected}, detected ${detected}`,
  };
}
