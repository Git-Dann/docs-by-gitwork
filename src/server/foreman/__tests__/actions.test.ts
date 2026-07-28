import { describe, it, expect } from "vitest";
import { findingState, partitionFindings, visibleFindings, type FindingAction } from "../actions";

function f(key: string, metric: number) {
  return { key, metric };
}
function actionsMap(...entries: FindingAction[]): Map<string, FindingAction> {
  return new Map(entries.map((a) => [a.findingKey, a]));
}

describe("findingState", () => {
  it("is active when there is no resolution", () => {
    expect(findingState(f("k", 3), undefined)).toBe("active");
  });

  it("is muted regardless of metric", () => {
    const a: FindingAction = { findingKey: "k", action: "mute", dismissedMetric: null };
    expect(findingState(f("k", 3), a)).toBe("muted");
    expect(findingState(f("k", 999), a)).toBe("muted");
  });

  it("stays dismissed while the metric does not exceed the dismissed value", () => {
    const a: FindingAction = { findingKey: "k", action: "dismiss", dismissedMetric: 5 };
    expect(findingState(f("k", 5), a)).toBe("dismissed"); // equal → still hidden
    expect(findingState(f("k", 3), a)).toBe("dismissed"); // improved → still hidden
  });

  it("resurfaces (active) once the metric worsens past the dismissed value", () => {
    const a: FindingAction = { findingKey: "k", action: "dismiss", dismissedMetric: 5 };
    expect(findingState(f("k", 6), a)).toBe("active");
  });

  it("treats a null dismissedMetric as: any positive metric resurfaces", () => {
    const a: FindingAction = { findingKey: "k", action: "dismiss", dismissedMetric: null };
    // -Infinity threshold → any real metric is greater → active
    expect(findingState(f("k", 1), a)).toBe("active");
  });
});

describe("partitionFindings / visibleFindings", () => {
  const findings = [f("a", 3), f("b", 2), f("c", 4), f("d", 1)];
  const actions = actionsMap(
    { findingKey: "b", action: "mute", dismissedMetric: null },
    { findingKey: "c", action: "dismiss", dismissedMetric: 4 }, // metric 4, not worse → dismissed
    { findingKey: "d", action: "dismiss", dismissedMetric: 0 }, // metric 1 > 0 → resurfaced
  );

  it("splits into active / dismissed / muted", () => {
    const p = partitionFindings(findings, actions);
    expect(p.active.map((x) => x.key).sort()).toEqual(["a", "d"]); // a untouched, d resurfaced
    expect(p.muted.map((x) => x.key)).toEqual(["b"]);
    expect(p.dismissed.map((x) => x.key)).toEqual(["c"]);
  });

  it("visibleFindings returns only the active ones", () => {
    expect(visibleFindings(findings, actions).map((x) => x.key).sort()).toEqual(["a", "d"]);
  });

  it("with no actions everything is visible", () => {
    expect(visibleFindings(findings, new Map()).length).toBe(4);
  });
});
