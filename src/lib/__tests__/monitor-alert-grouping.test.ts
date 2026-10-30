import { describe, expect, it } from "vitest";
import { GROUP_ALERTS_WITHIN_MS, shouldPostAlert } from "../monitor-alerts";

const NOW = new Date("2026-10-30T22:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("one post per client", () => {
  it("posts the first outage on a client", () => {
    expect(shouldPostAlert("down", [{ alertKind: null, alertedDownAt: null }], NOW)).toBe(true);
  });
  it("folds a second outage into the first when it comes within the window", () => {
    expect(shouldPostAlert("down", [{ alertKind: "down", alertedDownAt: ago(3 * 60_000) }], NOW)).toBe(false);
    expect(shouldPostAlert("flaky", [{ alertKind: "down", alertedDownAt: ago(3 * 60_000) }], NOW)).toBe(false);
  });
  it("posts again once the window has passed, or when the earlier one has recovered", () => {
    expect(shouldPostAlert("down", [{ alertKind: "down", alertedDownAt: ago(GROUP_ALERTS_WITHIN_MS + 1) }], NOW)).toBe(true);
    expect(shouldPostAlert("down", [{ alertKind: null, alertedDownAt: null }], NOW)).toBe(true);
  });
  it("says 'back' once, when nothing else on the client is still out", () => {
    expect(shouldPostAlert("recovered", [{ alertKind: "down", alertedDownAt: ago(60_000) }], NOW)).toBe(false);
    expect(shouldPostAlert("stable", [{ alertKind: "flaky", alertedDownAt: ago(60_000) }], NOW)).toBe(false);
    expect(shouldPostAlert("recovered", [{ alertKind: null, alertedDownAt: null }], NOW)).toBe(true);
    expect(shouldPostAlert("recovered", [], NOW)).toBe(true);
  });
});
