import { describe, expect, it } from "vitest";
import {
  ALL_SEGMENTS,
  addScore,
  bucketFor,
  corpusCaveat,
  emptyBuckets,
  meanOf,
  monthKeyFor,
  normaliseBuckets,
  percentileOf,
} from "../corpus";

// ─────────────────────────────────────────────────────────────────────────────
// Every anonymous public scan is a data point, and every one was being deleted:
// PulseLiteScan has a 7-day TTL and the reconcile cron prunes it with nothing
// aggregating first. This is the histogram that survives.
//
// The arithmetic is pure so it can be tested without a database (there is none
// locally). What these tests protect is the honesty of the eventual figure — a
// percentile gets screenshotted into a deck and outlives its context, so it must
// refuse to exist rather than be wrong.
// ─────────────────────────────────────────────────────────────────────────────

describe("bucketing", () => {
  it("puts a score in its ten-point bucket", () => {
    expect(bucketFor(0)).toBe(0);
    expect(bucketFor(9)).toBe(0);
    expect(bucketFor(10)).toBe(1);
    expect(bucketFor(64)).toBe(6);
    expect(bucketFor(90)).toBe(9);
  });

  it("puts 100 in the top bucket rather than inventing an eleventh", () => {
    expect(bucketFor(100)).toBe(9);
  });

  it("clamps impossible input instead of writing out of bounds", () => {
    expect(bucketFor(-40)).toBe(0);
    expect(bucketFor(1000)).toBe(9);
  });
});

describe("the histogram tolerates a corrupt Json column", () => {
  it("returns zeroes for anything that is not an array", () => {
    for (const bad of [null, undefined, {}, "nope", 7]) {
      expect(normaliseBuckets(bad)).toEqual(emptyBuckets());
    }
  });

  it("replaces non-numeric, negative and NaN entries with zero", () => {
    // A corrupt percentile is worse than an absent one, so NaN must never propagate.
    const out = normaliseBuckets([1, "x", -5, NaN, Infinity, 2, null, undefined, 3, 4]);
    expect(out).toEqual([1, 0, 0, 0, 0, 2, 0, 0, 3, 4]);
    expect(out.some(Number.isNaN)).toBe(false);
  });

  it("pads a short array to the full width", () => {
    expect(normaliseBuckets([5, 5])).toHaveLength(10);
  });

  it("ignores extra entries beyond the width", () => {
    expect(normaliseBuckets(Array.from({ length: 20 }, () => 1))).toHaveLength(10);
  });
});

describe("adding a score", () => {
  it("increments exactly one bucket and mutates nothing", () => {
    const before = emptyBuckets();
    const after = addScore(before, 64);
    expect(after[6]).toBe(1);
    expect(after.reduce((a, b) => a + b, 0)).toBe(1);
    expect(before.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("percentileOf refuses to answer from too little data", () => {
  const small = { scanCount: 5, scoreSum: 300, buckets: addScore(addScore(emptyBuckets(), 60), 70) };

  it("returns null below the minimum corpus", () => {
    // The worst version of this feature is a confident percentile drawn from nine scans.
    expect(percentileOf(64, small)).toBeNull();
  });

  it("answers once the corpus is large enough", () => {
    const buckets = emptyBuckets();
    buckets[0] = 20; // 20 sites scored 0-9
    buckets[9] = 20; // 20 scored 90-100
    const dist = { scanCount: 40, scoreSum: 2000, buckets };
    // A score of 95 sits in the top bucket: 20 below + half of its own 20 = 30/40.
    expect(percentileOf(95, dist)).toBe(75);
  });

  it("honours an explicit minimum", () => {
    const buckets = emptyBuckets();
    buckets[5] = 10;
    const dist = { scanCount: 10, scoreSum: 550, buckets };
    expect(percentileOf(55, dist)).toBeNull();
    expect(percentileOf(55, dist, 10)).toBe(50);
  });

  it("places the worst and best scores at the extremes", () => {
    const buckets = emptyBuckets();
    for (let i = 0; i < 10; i++) buckets[i] = 10;
    const dist = { scanCount: 100, scoreSum: 5000, buckets };
    expect(percentileOf(5, dist)).toBe(5);   // bottom bucket, half of it
    expect(percentileOf(95, dist)).toBe(95); // top bucket, 90 below + half
  });
});

describe("meanOf", () => {
  it("averages the corpus", () => {
    expect(meanOf({ scanCount: 4, scoreSum: 280, buckets: emptyBuckets() })).toBe(70);
  });

  it("returns null rather than dividing by zero", () => {
    expect(meanOf({ scanCount: 0, scoreSum: 0, buckets: emptyBuckets() })).toBeNull();
  });
});

describe("the caveat travels with the figure", () => {
  it("states the sample size and that this is our own history, not a survey", () => {
    const caveat = corpusCaveat({ scanCount: 412, scoreSum: 0, buckets: emptyBuckets() }, ALL_SEGMENTS);
    expect(caveat).toContain("412");
    expect(caveat).toMatch(/not an industry survey/);
    expect(caveat).toMatch(/self-selected/);
  });

  it("names the segment when there is one", () => {
    expect(corpusCaveat({ scanCount: 50, scoreSum: 0, buckets: emptyBuckets() }, "MARKETING_SITE"))
      .toContain("marketing site sites");
  });
});

describe("month keys", () => {
  it("formats UTC year-month with a leading zero", () => {
    expect(monthKeyFor(new Date("2026-08-22T01:00:00Z"))).toBe("2026-08");
    expect(monthKeyFor(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  it("uses UTC, so a late-night local scan does not land in the wrong month", () => {
    expect(monthKeyFor(new Date("2026-08-31T23:30:00Z"))).toBe("2026-08");
    expect(monthKeyFor(new Date("2026-09-01T00:30:00Z"))).toBe("2026-09");
  });
});
