import { describe, expect, it } from "vitest";
import {
  careHref,
  careReportHref,
  isCareSection,
  legacyReportRedirect,
  legacySupportRedirect,
  legacySupportSection,
} from "@/lib/care-links";

describe("careHref", () => {
  it("is bare Care with no client", () => {
    expect(careHref()).toBe("/app/care");
    expect(careHref({ section: "reports" })).toBe("/app/care");
  });
  it("names the client, and the section unless it is the default", () => {
    expect(careHref({ clientId: "c1" })).toBe("/app/care?client=c1");
    expect(careHref({ clientId: "c1", section: "conversations" })).toBe("/app/care?client=c1");
    expect(careHref({ clientId: "c1", section: "reports" })).toBe("/app/care?client=c1&section=reports");
  });
  it("encodes report ids", () => {
    expect(careReportHref("a/b")).toBe("/app/care/reports/a%2Fb");
  });
  it("only accepts real sections", () => {
    expect(isCareSection("automation")).toBe(true);
    expect(isCareSection("inbox")).toBe(false);
    // Retired Nov 2026. It must not resolve, or a stale link would open a section that is gone.
    expect(isCareSection("tickets")).toBe(false);
    expect(isCareSection(null)).toBe(false);
  });
});

describe("legacy /app/support links land on the matching Care place", () => {
  it.each([
    [{ tab: "inbox" }, "conversations"],
    // Tickets was retired, so its tab falls through like any unknown one and lands on
    // Conversations rather than on a section that no longer exists.
    [{ tab: "tickets" }, null],
    [{ tab: "reports" }, "reports"],
    [{ panel: "connectors" }, "settings"],
    [{ panel: "settings" }, "automation"],
    // The old page let the panel win over the tab.
    [{ tab: "reports", panel: "connectors" }, "settings"],
    [{ tab: "nonsense" }, null],
    [{}, null],
  ] as const)("%o → %s", (params, expected) => {
    expect(legacySupportSection(params)).toBe(expected);
  });

  it("bare /app/support goes to Care home", () => {
    expect(legacySupportRedirect({})).toBe("/app/care");
  });

  it("translates client + tab and keeps every other parameter", () => {
    expect(legacySupportRedirect({ client: "c1", tab: "reports", utm_source: "slack" })).toBe(
      "/app/care?client=c1&section=reports&utm_source=slack",
    );
    expect(legacySupportRedirect({ client: "c1", panel: "connectors" })).toBe("/app/care?client=c1&section=settings");
    expect(legacySupportRedirect({ client: "c1", tab: "inbox" })).toBe("/app/care?client=c1");
  });

  it("an old tickets link lands on the client's conversations, not a dead section", () => {
    expect(legacySupportRedirect({ client: "c1", tab: "tickets" })).toBe("/app/care?client=c1");
  });

  it("keeps repeated parameters", () => {
    expect(legacySupportRedirect({ tag: ["a", "b"] })).toBe("/app/care?tag=a&tag=b");
  });

  it("a section with no client is dropped (there is nothing to open it on)", () => {
    expect(legacySupportRedirect({ tab: "reports" })).toBe("/app/care");
  });

  it("report links keep their id and query", () => {
    expect(legacyReportRedirect("r1", {})).toBe("/app/care/reports/r1");
    expect(legacyReportRedirect("r1", { print: "1" })).toBe("/app/care/reports/r1?print=1");
  });
});
