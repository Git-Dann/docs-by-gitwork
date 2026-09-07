import { describe, expect, it } from "vitest";
import { triage } from "../public-scan";
import { CATEGORIES } from "@/server/pulse-checks/categories";
import type { CheckCategory, PulseCheckStatus, PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// The free tier is the TRIAGED report, not the whole scan.
//
// Measured on real sites before this existed: stripe.com emits 603 warnings, of
// which 591 are P3 and 588 are LOW severity; a blank IANA placeholder page emits
// 716. Rendering all of them would put a ~600-row yellow wall under the score on
// every site including excellent ones, which discredits the score above it.
//
// These tests pin the three properties that make the free/paid split honest:
//   1. every P1/P2 finding is shown, in full, with its evidence
//   2. the P3 tail is COUNTED, never silently dropped
//   3. "could not establish" is surfaced with a reason, never as silence
// ─────────────────────────────────────────────────────────────────────────────

function check(over: Partial<PulseScanCheckInput> & { checkKey: string; status: PulseCheckStatus }): PulseScanCheckInput {
  return {
    category: CATEGORIES.SECURITY,
    label: `label for ${over.checkKey}`,
    detail: `evidence for ${over.checkKey}`,
    ...over,
  } as PulseScanCheckInput;
}

/** A CRITICAL-severity failure ranks P1; a LOW-severity warning ranks P3. */
const p1 = (key: string) => check({ checkKey: key, status: "FAIL", severity: "CRITICAL", confidence: "HIGH" });
const p3 = (key: string, category: CheckCategory = CATEGORIES.SEO) =>
  check({ checkKey: key, status: "WARN", severity: "LOW", confidence: "LOW", category });

describe("actionable findings are shown in full, with evidence", () => {
  it("includes P1 findings and carries their evidence through", () => {
    const t = triage([p1("no_exposed_env"), p3("meta_description")]);
    const keys = t.actionable.map((f) => f.checkKey);
    expect(keys).toContain("no_exposed_env");
    const found = t.actionable.find((f) => f.checkKey === "no_exposed_env")!;
    expect(found.detail).toBe("evidence for no_exposed_env");
    expect(found.tier).toBe("P1");
  });

  it("orders actionable findings worst-first", () => {
    const t = triage([
      p3("low_one"),
      p1("critical_one"),
      check({ checkKey: "mid_one", status: "WARN", severity: "HIGH", confidence: "HIGH" }),
    ]);
    // rankFindings sorts by severity × certainty × category weight; the P1 must lead.
    expect(t.actionable[0]?.checkKey).toBe("critical_one");
  });

  it("never puts a passing check in the actionable list", () => {
    const t = triage([
      check({ checkKey: "fine", status: "PASS" }),
      check({ checkKey: "also_fine", status: "PASS", severity: "CRITICAL" }),
      p1("broken"),
    ]);
    expect(t.actionable.map((f) => f.checkKey)).toEqual(["broken"]);
  });
});

describe("the advisory tail is counted, never dropped", () => {
  it("counts every P3 finding and never lists it", () => {
    const advisory = Array.from({ length: 50 }, (_, i) => p3(`advisory_${i}`));
    const t = triage([p1("real_problem"), ...advisory]);

    expect(t.actionable).toHaveLength(1);
    expect(t.advisoryCount).toBe(50);
    // The point of the split: the count is honest, the wall is not rendered.
    expect(t.actionable.map((f) => f.checkKey)).not.toContain("advisory_0");
  });

  it("breaks the advisory count down by category, biggest first", () => {
    const t = triage([
      ...Array.from({ length: 5 }, (_, i) => p3(`seo_${i}`, CATEGORIES.SEO)),
      ...Array.from({ length: 9 }, (_, i) => p3(`a11y_${i}`, CATEGORIES.ACCESSIBILITY)),
    ]);
    expect(t.advisoryCount).toBe(14);
    expect(t.advisoryByCategory[0]).toEqual({ category: CATEGORIES.ACCESSIBILITY, count: 9 });
    expect(t.advisoryByCategory[1]).toEqual({ category: CATEGORIES.SEO, count: 5 });
  });

  it("accounts for every non-passing check somewhere", () => {
    const checks = [p1("a"), p3("b"), p3("c"), check({ checkKey: "d", status: "WARN", severity: "HIGH", confidence: "HIGH" })];
    const t = triage(checks);
    // Nothing may vanish: a finding is either actionable or counted as advisory.
    expect(t.actionable.length + t.advisoryCount).toBe(checks.length);
  });
});

describe("'we could not establish this' is surfaced, free, with a reason", () => {
  it("reports skipped and inconclusive checks with their reason", () => {
    const t = triage([
      check({ checkKey: "ios_thing", status: "SKIPPED", detail: "Needs a GitHub repository; this was a URL scan." }),
      check({ checkKey: "spa_seo", status: "INCONCLUSIVE", detail: "Content is client-rendered; not in the static HTML." }),
      check({ checkKey: "n_a", status: "NOT_APPLICABLE", detail: "No GraphQL detected." }),
    ]);
    expect(t.notEstablished).toHaveLength(3);
    expect(t.notEstablished.map((n) => n.reason)).toContain("No GraphQL detected.");
  });

  it("omits an unexplained skip rather than reporting a reasonless one", () => {
    // A bare SKIPPED with no detail tells the reader nothing; shipping it would
    // recreate the silence this section exists to remove.
    const t = triage([
      check({ checkKey: "silent", status: "SKIPPED", detail: "" }),
      check({ checkKey: "explained", status: "SKIPPED", detail: "Requires a repository." }),
    ]);
    expect(t.notEstablished.map((n) => n.checkKey)).toEqual(["explained"]);
  });

  it("never counts an unestablished check as a finding", () => {
    const t = triage([check({ checkKey: "s", status: "SKIPPED", detail: "why" })]);
    expect(t.actionable).toEqual([]);
    expect(t.advisoryCount).toBe(0);
  });
});

describe("degenerate input", () => {
  it("returns an empty, well-formed triage for an empty scan", () => {
    const t = triage([]);
    expect(t).toEqual({ actionable: [], advisoryCount: 0, advisoryByCategory: [], notEstablished: [] });
  });

  it("keeps a perfect scan's report empty rather than inventing something to say", () => {
    const t = triage([check({ checkKey: "a", status: "PASS" }), check({ checkKey: "b", status: "PASS" })]);
    expect(t.actionable).toEqual([]);
    expect(t.advisoryCount).toBe(0);
  });
});

describe("the split stays useful at realistic scale", () => {
  it("keeps the actionable report small against a Stripe-shaped scan", () => {
    // Shape taken from the live measurement: 2 P1 fails, 12 P2, 591 P3.
    const shaped = [
      p1("privacy_policy"),
      p1("terms_of_service"),
      ...Array.from({ length: 12 }, (_, i) =>
        check({ checkKey: `p2_${i}`, status: "WARN", severity: "HIGH", confidence: "HIGH" })),
      ...Array.from({ length: 591 }, (_, i) => p3(`p3_${i}`)),
    ];
    const t = triage(shaped);
    expect(t.actionable).toHaveLength(14);
    expect(t.advisoryCount).toBe(591);
    // The whole point: a reader gets 14 things to do, not 605.
    expect(t.actionable.length).toBeLessThan(25);
  });
});
