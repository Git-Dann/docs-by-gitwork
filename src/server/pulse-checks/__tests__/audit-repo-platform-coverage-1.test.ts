import { describe, it, expect } from "vitest";
import { buildPlatformCoverageCheck } from "../platform-coverage";

describe("platform_family_coverage truthfulness", () => {
  it("does not call an unrecognised repo (e.g. a Rust/Go CLI like ripgrep or gh) a web or service project", () => {
    const r = buildPlatformCoverageCheck({ selectedPlatform: "CLI_TOOL", inputType: "GITHUB_REPO", detectedShape: "none" });
    expect(r?.status).toBe("WARN");
    expect(r?.detail).not.toMatch(/general web or service project/);
    expect(r?.detail).toMatch(/matches none of Pulse's platform families/);
    expect(r?.detail).toMatch(/npm-style packages only/);
    expect(r?.detail).toMatch(/22 CLI \/ published package checks did NOT run/);
    expect(r?.evidence).toBe("selected CLI_TOOL, detected none");
  });

  it("does not attach the npm-only CLI note to a non-CLI family on an unrecognised repo", () => {
    const ios = buildPlatformCoverageCheck({ selectedPlatform: "IOS_APP", inputType: "GITHUB_REPO", detectedShape: "none" });
    expect(ios?.status).toBe("WARN");
    expect(ios?.detail).not.toMatch(/npm-style packages only/);
    expect(ios?.detail).not.toMatch(/general web or service project/);
    expect(ios?.detail).toMatch(/55 iOS checks did NOT run/);

    const desktop = buildPlatformCoverageCheck({ selectedPlatform: "DESKTOP_APP", inputType: "GITHUB_REPO", detectedShape: "none" });
    expect(desktop?.status).toBe("WARN");
    expect(desktop?.detail).not.toMatch(/npm-style packages only/);
    expect(desktop?.detail).toMatch(/Electron \/ Tauri checks did NOT run/);
  });

  it("still names the detected family when the repo is a different known platform (nowinandroid)", () => {
    const r = buildPlatformCoverageCheck({ selectedPlatform: "IOS_APP", inputType: "GITHUB_REPO", detectedShape: "android" });
    expect(r?.status).toBe("WARN");
    expect(r?.detail).toMatch(/looks like a native Android project/);
    expect(r?.detail).toMatch(/The Android family ran instead/);
    expect(r?.detail).not.toMatch(/npm-style packages only/);
  });

  it("still passes a matching repo (NewPipe)", () => {
    const r = buildPlatformCoverageCheck({ selectedPlatform: "ANDROID_APP", inputType: "GITHUB_REPO", detectedShape: "android" });
    expect(r?.status).toBe("PASS");
  });

  it("still returns nothing for a web selection on an unrecognised repo", () => {
    const r = buildPlatformCoverageCheck({ selectedPlatform: "WEB_APP", inputType: "GITHUB_REPO", detectedShape: "none" });
    expect(r).toBeNull();
  });
});
