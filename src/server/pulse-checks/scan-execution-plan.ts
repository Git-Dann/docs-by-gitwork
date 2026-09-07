import { normalizePulsePlatform, type PulsePlatform, type UrlSurfaceKind } from "./platform-applicability";
import type { SnapshotShape } from "./native-repo";

export type UrlTargetKind = "web" | "app_store" | "play_store";
export type RepoCollectorName =
  | "secret-scan"
  | "native-mobile"
  | "chrome-extension"
  | "desktop"
  | "cli"
  | "web-source"
  | "cleanliness"
  | "ci-workflows"
  | "containers"
  | "service-depth"
  | "operational-depth";

export interface UrlCollectorPlan {
  browser: boolean;
  deploy: boolean;
  standards: boolean;
}

const WEB_BROWSER_PLATFORMS = new Set<PulsePlatform>([
  "WEB_APP",
  "SAAS",
  "MARKETING_SITE",
  "OTHER",
]);

const WEB_DEPLOY_PLATFORMS = new Set<PulsePlatform>([
  ...WEB_BROWSER_PLATFORMS,
  "API_BACKEND",
]);

const SOURCE_ONLY_PLATFORMS = new Set<PulsePlatform>([
  "IOS_APP",
  "ANDROID_APP",
  "CROSS_PLATFORM_MOBILE",
  "DESKTOP_APP",
  "CHROME_EXTENSION",
  "CLI_TOOL",
]);

export function detectUrlTargetKind(url: string): UrlTargetKind {
  const lower = url.toLowerCase();
  if (lower.includes("apps.apple.com") || lower.includes("itunes.apple.com")) return "app_store";
  if (lower.includes("play.google.com/store/apps")) return "play_store";
  return "web";
}

/**
 * Decide which expensive URL collectors can produce evidence about this exact
 * target. This is an execution contract, not a result filter: false collectors
 * are never invoked and consume no quota or scan time.
 */
export function buildUrlCollectorPlan(
  platform: string | undefined,
  surfaceKind: UrlSurfaceKind,
  targetKind: UrlTargetKind,
): UrlCollectorPlan {
  const resolved = normalizePulsePlatform(platform);
  if (targetKind !== "web" || surfaceKind === "ACCESS_INTERSTITIAL") {
    return { browser: false, deploy: false, standards: false };
  }
  if (SOURCE_ONLY_PLATFORMS.has(resolved)) {
    return { browser: false, deploy: false, standards: false };
  }
  if (surfaceKind === "BUNDLED_PROTOTYPE") {
    return {
      browser: WEB_BROWSER_PLATFORMS.has(resolved),
      deploy: false,
      standards: false,
    };
  }
  return {
    browser: WEB_BROWSER_PLATFORMS.has(resolved),
    deploy: WEB_DEPLOY_PLATFORMS.has(resolved),
    standards: true,
  };
}

/** Whether the core URL engine should go beyond reachability/classification. */
export function shouldRunDeepUrlChecks(
  platform: string | undefined,
  targetKind: UrlTargetKind,
): boolean {
  return targetKind === "web" && !SOURCE_ONLY_PLATFORMS.has(normalizePulsePlatform(platform));
}

/**
 * Select repository collectors from the detected artefact. Detection wins over
 * the dropdown: the tree is evidence; the user's label is only an expectation.
 */
export function buildRepoCollectorPlan(
  platform: string | undefined,
  detectedShape: SnapshotShape,
): RepoCollectorName[] {
  const common: RepoCollectorName[] = ["secret-scan"];
  const finish: RepoCollectorName[] = ["cleanliness", "ci-workflows"];

  if (["ios", "android", "flutter", "react-native"].includes(detectedShape)) {
    return [...common, "native-mobile", ...finish];
  }
  if (detectedShape === "chrome-extension") {
    return [...common, "chrome-extension", ...finish];
  }
  if (detectedShape === "electron" || detectedShape === "tauri") {
    return [...common, "desktop", ...finish];
  }
  if (detectedShape === "cli") {
    return [...common, "cli", ...finish];
  }

  const resolved = normalizePulsePlatform(platform);
  if (SOURCE_ONLY_PLATFORMS.has(resolved)) return [...common, ...finish];

  const web: RepoCollectorName[] = [...common, "web-source", ...finish, "containers"];
  if (resolved === "MARKETING_SITE") return web;
  return [...web, "service-depth", "operational-depth"];
}

export function effectivePlatformForRepoShape(
  selectedPlatform: string | undefined,
  detectedShape: SnapshotShape,
): PulsePlatform {
  if (detectedShape === "ios") return "IOS_APP";
  if (detectedShape === "android") return "ANDROID_APP";
  if (detectedShape === "flutter" || detectedShape === "react-native") return "CROSS_PLATFORM_MOBILE";
  if (detectedShape === "electron" || detectedShape === "tauri") return "DESKTOP_APP";
  if (detectedShape === "chrome-extension") return "CHROME_EXTENSION";
  if (detectedShape === "cli") return "CLI_TOOL";
  return normalizePulsePlatform(selectedPlatform);
}

/** A repository's GitHub homepage field is metadata, not the selected artefact. */
export function shouldScanRepositoryHomepage(): false {
  return false;
}
