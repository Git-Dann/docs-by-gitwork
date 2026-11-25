import { describe, expect, it } from "vitest";
import { budgetAlert, budgetAlertCopy, budgetPeriod } from "../budget";

describe("budgetPeriod", () => {
  const now = new Date("2026-11-25T10:00:00Z");

  it("is the calendar month by default", () => {
    const p = budgetPeriod(null, now);
    expect(p.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(p.key).toBe("2026-11");
    expect(p.label).toBe("in November 2026");
  });

  it("counts from a set date as a one-off pot, with its own alert key", () => {
    const p = budgetPeriod("2026-11-20", now);
    expect(p.start.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(p.key).toBe("since-2026-11-20");
    expect(p.label).toBe("since 20 Nov 2026");
  });

  it("ignores a date in the future or a malformed one", () => {
    expect(budgetPeriod("2027-01-01", now).key).toBe("2026-11");
    expect(budgetPeriod("next week", now).key).toBe("2026-11");
  });
});

describe("budgetAlert", () => {
  it("sends nothing under 50%", () => {
    expect(budgetAlert(99, 200, [])).toEqual({ send: null, mark: [] });
  });

  it("sends each level once, as it is crossed", () => {
    expect(budgetAlert(100, 200, [])).toEqual({ send: 50, mark: [50] });
    expect(budgetAlert(120, 200, [50])).toEqual({ send: null, mark: [] });
    expect(budgetAlert(160, 200, [50])).toEqual({ send: 80, mark: [80] });
    expect(budgetAlert(190, 200, [50, 80])).toEqual({ send: 95, mark: [95] });
    expect(budgetAlert(250, 200, [50, 80, 95])).toEqual({ send: null, mark: [] });
  });

  it("jumping straight past several levels sends only the highest, and marks them all", () => {
    expect(budgetAlert(195, 200, [])).toEqual({ send: 95, mark: [50, 80, 95] });
  });

  it("never alerts with no budget", () => {
    expect(budgetAlert(500, 0, [])).toEqual({ send: null, mark: [] });
  });

  it("says what the spend covers in plain words", () => {
    const copy = budgetAlertCopy(80, 161.5, 200, budgetPeriod(null, new Date("2026-11-25T00:00:00Z")));
    expect(copy.title).toBe("AI spend has reached 80% of the $200 budget");
    expect(copy.body).toContain("$161.50 of $200 used in November 2026");
    expect(copy.body).toContain("every AI feature");
  });
});
