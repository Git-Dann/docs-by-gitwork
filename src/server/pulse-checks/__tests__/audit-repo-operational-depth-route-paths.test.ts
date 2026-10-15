import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import { evaluateOperationalDepthChecks } from "../operational-depth";

// Unsampled tree paths count as route evidence for the missing-page rules. These cases pin
// which paths are routes: a directory named after a page is not the page.

function snap(files: Record<string, string>, extraPaths: string[]): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const run = (files: Record<string, string>, key: string, extraPaths: string[]) => {
  const check = evaluateOperationalDepthChecks(snap(files, extraPaths)).find(
    (candidate: PulseScanCheckInput) => candidate.checkKey === key,
  );
  if (!check) throw new Error(`No check emitted for ${key}`);
  return check.status;
};

const angular = { "src/app/app.routes.ts": 'export const routes = [{ path: "", component: Home }];' };
const rails = { "config/routes.rb": "Rails.application.routes.draw do\n  root 'pages#home'\nend" };
const settings = { "app/settings/page.tsx": "export default function Settings() { return null; }" };
const next = { "app/page.tsx": 'import React from "react"; export default function Page() { return null; }' };

describe("route-path evidence for missing-page rules", () => {
  it("does not treat an Angular src/app/ helper folder as a statement page", () => {
    expect(
      run(angular, "pages_depth_accessibility_route", ["src/app/shared/accessibility/focus-trap.ts"]),
    ).not.toBe("PASS");
    expect(
      run(angular, "pages_depth_accessibility_route", ["src/app/pages/accessibility/accessibility.component.ts"]),
    ).toBe("PASS");
  });

  it("does not treat an e2e accessibility audit as an accessibility statement", () => {
    expect(run(next, "pages_depth_accessibility_route", ["e2e/accessibility.spec.ts"])).not.toBe("PASS");
    expect(run(next, "pages_depth_accessibility_route", ["app/(legal)/accessibility/page.mdx"])).toBe("PASS");
  });

  it("does not treat a browser-compatibility e2e suite as supported-platform docs", () => {
    expect(
      run(angular, "pages_depth_supported_platforms_route", ["playwright/browser-compatibility.spec.ts"]),
    ).not.toBe("PASS");
  });

  it("still credits an e2e flow for a data export", () => {
    expect(run(settings, "pages_depth_data_export_route", ["playwright/settings/data-export.e2e.ts"])).toBe("PASS");
    expect(run(settings, "pages_depth_data_export_route", ["scripts/data-export.ts"])).not.toBe("PASS");
  });

  it("credits a Rails view but not a Rails partial or model", () => {
    expect(run(rails, "pages_depth_accessibility_route", ["app/views/pages/accessibility.html.erb"])).toBe("PASS");
    expect(
      run(rails, "pages_depth_accessibility_route", [
        "app/views/shared/accessibility/_banner.html.erb",
        "app/models/accessibility_setting.rb",
      ]),
    ).not.toBe("PASS");
  });
});
