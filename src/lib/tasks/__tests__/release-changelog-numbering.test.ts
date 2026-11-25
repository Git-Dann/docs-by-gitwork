/**
 * A client can number releases by their changelog (§161): Big Wedge's planning site reused
 * "v2.0.0" for months while the app went 2.0.0 → 2.0.2 → 2.0.3 → 2.0.4.
 */
import { describe, expect, it } from "vitest";
import { changelogLabel, releaseLabel, shownVersion, sortReleases } from "@/lib/tasks/releases";

const rel = (over: Record<string, unknown>) => ({ version: "v2.0.0", name: "Q4: Refinement Session (Weeks 48 -> 49)", ...over });

describe("numbering releases by the changelog", () => {
  it("shows the changelog version only when the client asks and one is set", () => {
    expect(shownVersion(rel({ changelogVersion: "2.0.4", client: { releasesUseChangelog: true } }))).toBe("v2.0.4");
    expect(shownVersion(rel({ changelogVersion: "2.0.4", client: { releasesUseChangelog: false } }))).toBe("v2.0.0");
    expect(shownVersion(rel({ changelogVersion: null, client: { releasesUseChangelog: true } }))).toBe("v2.0.0");
    expect(shownVersion(rel({ changelogVersion: "  ", client: { releasesUseChangelog: true } }))).toBe("v2.0.0");
    expect(shownVersion(rel({}))).toBe("v2.0.0");
  });

  it("uses a number the server already decided", () => {
    expect(shownVersion(rel({ displayVersion: "v2.0.3" }))).toBe("v2.0.3");
  });

  it("labels and orders by the number shown", () => {
    expect(releaseLabel(rel({ changelogVersion: "2.0.4", client: { releasesUseChangelog: true } }))).toBe(
      "v2.0.4 · Q4: Refinement Session (Weeks 48 -> 49)",
    );
    const on = { releasesUseChangelog: true };
    const sorted = sortReleases([
      { version: "v2.0.0", name: null, startDate: null, orderKey: 1, changelogVersion: "2.0.4", client: on },
      { version: "v2.0.0", name: null, startDate: null, orderKey: 2, changelogVersion: "2.0.3", client: on },
    ]);
    expect(sorted.map((r) => r.changelogVersion)).toEqual(["2.0.3", "2.0.4"]);
  });

  it("adds a v only when there isn't one", () => {
    expect(changelogLabel("2.0.4")).toBe("v2.0.4");
    expect(changelogLabel("v2.0.4")).toBe("v2.0.4");
    expect(changelogLabel("V2.0.4")).toBe("V2.0.4");
  });
});
