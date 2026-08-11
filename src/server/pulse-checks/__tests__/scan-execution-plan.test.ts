import { describe, expect, it } from "vitest";
import {
  buildRepoCollectorPlan,
  buildUrlCollectorPlan,
  shouldRunDeepUrlChecks,
  shouldScanRepositoryHomepage,
} from "../scan-execution-plan";
import { SUPPORTED_PULSE_PLATFORMS } from "../platform-applicability";

describe("Pulse collector execution plan", () => {
  it("runs browser and deploy collectors only for URL surfaces they can measure", () => {
    expect(buildUrlCollectorPlan("WEB_APP", "DEPLOYED_PRODUCT", "web")).toEqual({
      browser: true,
      deploy: true,
      standards: true,
    });
    expect(buildUrlCollectorPlan("API_BACKEND", "DEPLOYED_PRODUCT", "web")).toEqual({
      browser: false,
      deploy: true,
      standards: true,
    });
    expect(buildUrlCollectorPlan("WEB_APP", "BUNDLED_PROTOTYPE", "web")).toEqual({
      browser: true,
      deploy: false,
      standards: false,
    });
  });

  it("has an explicit URL execution decision for every supported platform", () => {
    const browserPlatforms = new Set(["WEB_APP", "SAAS", "MARKETING_SITE", "OTHER"]);
    const deployPlatforms = new Set([...browserPlatforms, "API_BACKEND"]);

    for (const platform of SUPPORTED_PULSE_PLATFORMS) {
      expect(buildUrlCollectorPlan(platform, "DEPLOYED_PRODUCT", "web")).toEqual({
        browser: browserPlatforms.has(platform),
        deploy: deployPlatforms.has(platform),
        standards: deployPlatforms.has(platform),
      });
    }
  });

  it("never spends browser/deploy calls on stores, checkpoints, or source-only platforms", () => {
    for (const platform of [
      "IOS_APP",
      "ANDROID_APP",
      "CROSS_PLATFORM_MOBILE",
      "DESKTOP_APP",
      "CHROME_EXTENSION",
      "CLI_TOOL",
    ]) {
      expect(buildUrlCollectorPlan(platform, "DEPLOYED_PRODUCT", "web")).toEqual({
        browser: false,
        deploy: false,
        standards: false,
      });
    }

    expect(buildUrlCollectorPlan("IOS_APP", "DEPLOYED_PRODUCT", "app_store")).toEqual({
      browser: false,
      deploy: false,
      standards: false,
    });
    expect(buildUrlCollectorPlan("WEB_APP", "ACCESS_INTERSTITIAL", "web")).toEqual({
      browser: false,
      deploy: false,
      standards: false,
    });
    expect(shouldRunDeepUrlChecks("IOS_APP", "web")).toBe(false);
    expect(shouldRunDeepUrlChecks("CLI_TOOL", "web")).toBe(false);
    expect(shouldRunDeepUrlChecks("WEB_APP", "web")).toBe(true);
    expect(shouldRunDeepUrlChecks("WEB_APP", "app_store")).toBe(false);
  });

  it("runs only the repository family matching the detected artefact", () => {
    expect(buildRepoCollectorPlan("IOS_APP", "ios")).toEqual([
      "secret-scan",
      "native-mobile",
      "cleanliness",
      "ci-workflows",
    ]);
    expect(buildRepoCollectorPlan("CHROME_EXTENSION", "chrome-extension")).toEqual([
      "secret-scan",
      "chrome-extension",
      "cleanliness",
      "ci-workflows",
    ]);
    expect(buildRepoCollectorPlan("CLI_TOOL", "cli")).toEqual([
      "secret-scan",
      "cli",
      "cleanliness",
      "ci-workflows",
    ]);
    expect(buildRepoCollectorPlan("DESKTOP_APP", "electron")).toEqual([
      "secret-scan",
      "desktop",
      "cleanliness",
      "ci-workflows",
    ]);
    expect(buildRepoCollectorPlan("API_BACKEND", "none")).toEqual([
      "secret-scan",
      "web-source",
      "cleanliness",
      "ci-workflows",
      "containers",
      "service-depth",
      "operational-depth",
    ]);
  });

  it("never treats a repository's optional homepage as part of the repo scan", () => {
    expect(shouldScanRepositoryHomepage()).toBe(false);
  });
});
