import { describe, expect, it } from "vitest";
import { buildPageTitle, pageMetadataTitle } from "../page-title";

/**
 * Tab titles. Every /app page rendered "Foundry by Gitwork" — four open tabs on
 * four different clients were indistinguishable.
 *
 * The ordering rule is the substantive one: a browser truncates a tab from the
 * RIGHT, so the client name has to come first or it is the first thing lost —
 * which would leave the tabs exactly as unusable as before.
 */

describe("buildPageTitle", () => {
  it("puts the client first, then the feature, then the app", () => {
    expect(buildPageTitle("Tasks", "YourGroop")).toBe("YourGroop · Tasks · Foundry");
  });

  it("drops the context when there isn't one", () => {
    expect(buildPageTitle("Pulse")).toBe("Pulse · Foundry");
    expect(buildPageTitle("Pulse", null)).toBe("Pulse · Foundry");
    expect(buildPageTitle("Pulse", "")).toBe("Pulse · Foundry");
    expect(buildPageTitle("Pulse", "   ")).toBe("Pulse · Foundry");
  });

  it("survives a page with no title at all rather than rendering ' · Foundry'", () => {
    expect(buildPageTitle("")).toBe("Foundry by Gitwork");
    expect(buildPageTitle("   ", "  ")).toBe("Foundry by Gitwork");
  });

  it("does not repeat a client name the feature already carries", () => {
    // e.g. a page titled with the client, then given the same context.
    expect(buildPageTitle("YourGroop", "YourGroop")).toBe("YourGroop · Foundry");
    expect(buildPageTitle("yourgroop", "YourGroop")).toBe("YourGroop · Foundry");
  });

  it("trims its inputs", () => {
    expect(buildPageTitle("  Tasks  ", "  YourGroop  ")).toBe("YourGroop · Tasks · Foundry");
  });

  it("keeps the client name ahead of the feature, since tabs truncate from the right", () => {
    const title = buildPageTitle("Design System", "Big Wedge Golf");
    expect(title.indexOf("Big Wedge Golf")).toBeLessThan(title.indexOf("Design System"));
  });
});

describe("pageMetadataTitle", () => {
  it("returns an absolute title so the root template can't double-append", () => {
    // With `template: "%s · Foundry"`, a plain string would yield
    // "YourGroop · Tasks · Foundry · Foundry".
    const t = pageMetadataTitle("Tasks", "YourGroop");
    expect(t).toEqual({ absolute: "YourGroop · Tasks · Foundry" });
    expect(t.absolute.match(/Foundry/g)).toHaveLength(1);
  });
});
