import { describe, expect, it } from "vitest";
import type { Estimate } from "@/types/wiki-estimates";
import { estimateSchema } from "@/server/validators";
import {
  buildEstimateReadout,
  calendarTicks,
  calendarWindow,
  calendarMonthsBetween,
  fittingZoom,
  formatPlanDuration,
  planDurationParts,
  isPlannable,
  nextMonday,
  normaliseTeamSizes,
  parseIsoDate,
  placeSpan,
  planForTeam,
  teamThroughput,
  toIsoDate,
  workdayDate,
} from "@/lib/wiki-estimates";

/**
 * A realistic app build. Discovery and Launch are single-person work; Design and QA
 * cap at two. Every expected figure below was worked out by hand from
 * `ceil(effort / throughput)` at the typical 15% coordination overhead — not by running
 * this module — so a test cannot pass by agreeing with a broken implementation.
 */
function estimate(over: Partial<Estimate> = {}): Estimate {
  return {
    id: "e1",
    title: "Version 1 build",
    summary: null,
    startDate: "2026-11-02", // a Monday
    teamSizes: [1, 2, 3, 4, 5],
    recommendedTeam: 2,
    coordination: "TYPICAL",
    contingencyPct: 20,
    phases: [
      { id: "p1", name: "Discovery", effortDays: 5, maxDevs: 1 },
      { id: "p2", name: "Design", effortDays: 15, maxDevs: 2 },
      { id: "p3", name: "Build", effortDays: 60, maxDevs: null },
      { id: "p4", name: "QA", effortDays: 12, maxDevs: 2 },
      { id: "p5", name: "Launch", effortDays: 3, maxDevs: 1 },
    ],
    orderKey: 0,
    updatedAt: "2026-10-13T00:00:00.000Z",
    ...over,
  };
}

const TODAY = new Date(Date.UTC(2026, 9, 13)); // Tue 13 Oct 2026

describe("teamThroughput — more people help, but never proportionally", () => {
  it("one developer is exactly one", () => {
    expect(teamThroughput(1, 0.15)).toBe(1);
  });

  it("each extra developer is worth less than the last", () => {
    const t = [1, 2, 3, 4, 5].map((n) => teamThroughput(n, 0.15));
    expect(t[1]).toBeCloseTo(1.739, 3);
    expect(t[3]).toBeCloseTo(2.759, 3);
    for (let i = 1; i < t.length; i += 1) {
      expect(t[i]).toBeGreaterThan(t[i - 1]); // always faster…
      expect(t[i] - t[i - 1]).toBeLessThan(t[i - 1] - (i >= 2 ? t[i - 2] : 0)); // …by less
      expect(t[i]).toBeLessThan(i + 1); // …and never n×
    }
  });
});

describe("planForTeam", () => {
  it("sums phases in sequence, each rounded up to whole working days", () => {
    const start = parseIsoDate("2026-11-02")!;
    expect(planForTeam(estimate(), 1, start).phases.map((p) => p.workingDays)).toEqual([5, 15, 60, 12, 3]);
    expect(planForTeam(estimate(), 2, start).phases.map((p) => p.workingDays)).toEqual([5, 9, 35, 7, 3]);
    expect(planForTeam(estimate(), 4, start).phases.map((p) => p.workingDays)).toEqual([5, 9, 22, 7, 3]);
  });

  it("totals and contingency for each team", () => {
    const start = parseIsoDate("2026-11-02")!;
    const totals = [1, 2, 3, 4, 5].map((n) => {
      const p = planForTeam(estimate(), n, start);
      return [p.workingDays, p.upperWorkingDays];
    });
    expect(totals).toEqual([
      [95, 114],
      [59, 71],
      [50, 60],
      [46, 56],
      [44, 53],
    ]);
  });

  it("a capped phase does not speed up past its cap", () => {
    const start = parseIsoDate("2026-11-02")!;
    const four = planForTeam(estimate(), 4, start);
    const discovery = four.phases.find((p) => p.name === "Discovery")!;
    expect(discovery.devsUsed).toBe(1);
    expect(discovery.workingDays).toBe(5);
  });

  it("dates skip weekends — 95 working days from Mon 2 Nov ends Fri 12 Mar", () => {
    const p = planForTeam(estimate(), 1, parseIsoDate("2026-11-02")!);
    expect(toIsoDate(p.start)).toBe("2026-11-02");
    expect(toIsoDate(p.phases[0].end)).toBe("2026-11-06");
    expect(toIsoDate(p.phases[1].start)).toBe("2026-11-09");
    expect(toIsoDate(p.end)).toBe("2027-03-12");
    expect(toIsoDate(p.upperEnd)).toBe("2027-04-08");
  });

  it("a weekend start date moves to the Monday", () => {
    const p = planForTeam(estimate(), 1, parseIsoDate("2026-10-31")!); // a Saturday
    expect(toIsoDate(p.start)).toBe("2026-11-02");
  });

  it("zero contingency means no tail", () => {
    const p = planForTeam(estimate({ contingencyPct: 0 }), 2, parseIsoDate("2026-11-02")!);
    expect(p.upperWorkingDays).toBe(p.workingDays);
    expect(p.upperEnd).toEqual(p.end);
  });
});

describe("larger teams", () => {
  it("a twelve-developer team still plans — the uncapped Build gets 4.53× throughput, not 12×", () => {
    const twelve = planForTeam(estimate(), 12, d("2026-11-02"));
    const build = twelve.phases.find((p) => p.name === "Build")!;
    expect(build.devsUsed).toBe(12);
    expect(build.workingDays).toBe(14); // ceil(60 / 4.528)
  });

  it("the route accepts team sizes up to 15, and refuses 16", () => {
    const base = {
      title: "Big build",
      teamSizes: [4, 8, 12, 15],
      coordination: "TYPICAL" as const,
      contingencyPct: 20,
      phases: [{ id: "a", name: "Build", effortDays: 200, maxDevs: 15 }],
    };
    expect(estimateSchema.safeParse(base).success).toBe(true);
    expect(estimateSchema.safeParse({ ...base, teamSizes: [16] }).success).toBe(false);
    expect(estimateSchema.safeParse({ ...base, teamSizes: [1, 2, 3, 4, 5, 6, 7, 8, 9] }).success).toBe(
      false,
    );
  });
});

describe("buildEstimateReadout", () => {
  it("flags the team sizes that buy nothing, naming the smallest that already gets there", () => {
    const allCapped = estimate({
      phases: [
        { id: "a", name: "Discovery", effortDays: 5, maxDevs: 1 },
        { id: "b", name: "Build", effortDays: 30, maxDevs: 2 },
      ],
      teamSizes: [1, 2, 3, 4],
    });
    const { plans } = buildEstimateReadout(allCapped, TODAY);
    expect(plans.map((p) => p.noFasterThan)).toEqual([null, null, 2, 2]);
  });

  it("with no agreed start, plans from the next Monday and says so", () => {
    const r = buildEstimateReadout(estimate({ startDate: null }), TODAY);
    expect(r.startAgreed).toBe(false);
    expect(toIsoDate(r.start)).toBe("2026-10-19");
  });

  it("opens on the recommended team, else the smallest", () => {
    expect(buildEstimateReadout(estimate(), TODAY).recommended?.devs).toBe(2);
    expect(buildEstimateReadout(estimate({ recommendedTeam: 7 }), TODAY).recommended?.devs).toBe(1);
  });

  it("an estimate with no effort states nothing — no plans, no headline", () => {
    const empty = estimate({ phases: [{ id: "x", name: "Build", effortDays: 0, maxDevs: null }] });
    expect(isPlannable(empty)).toBe(false);
    const r = buildEstimateReadout(empty, TODAY);
    expect(r.plans).toEqual([]);
    expect(r.recommended).toBeNull();
  });

  it("ignores an unnamed phase rather than drawing a nameless bar", () => {
    const r = buildEstimateReadout(
      estimate({ phases: [{ id: "x", name: "  ", effortDays: 10, maxDevs: null }] }),
      TODAY,
    );
    expect(r.plans).toEqual([]);
  });
});

describe("normaliseTeamSizes", () => {
  it("unique, ascending, in range, at most eight", () => {
    expect(normaliseTeamSizes([3, 1, 3, 0, 16, 2.5, 2])).toEqual([1, 2, 3]);
    expect(normaliseTeamSizes([12, 15, 10])).toEqual([10, 12, 15]);
    expect(normaliseTeamSizes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toHaveLength(8);
  });
});

describe("formatPlanDuration — measured on the real calendar, rounded up", () => {
  // Every expected value here was computed independently from real dates (Python's
  // calendar module), not by running this module.
  const span = (first: string, last: string, workingDays = 50) => ({
    start: d(first),
    end: d(last),
    workingDays,
  });

  it("under ten working days it counts working days, Monday to Friday", () => {
    expect(formatPlanDuration(span("2026-11-02", "2026-11-02", 1))).toBe("1 working day");
    expect(formatPlanDuration(span("2026-11-02", "2026-11-12", 9))).toBe("9 working days");
  });

  it("weeks are calendar weeks between the real dates, weekends included", () => {
    // 2 Nov → Thu 21 Jan is 81 calendar days: 11.6 weeks, so 12.
    expect(formatPlanDuration(span("2026-11-02", "2027-01-21"))).toBe("12 weeks");
    // 2 Nov → Fri 12 Mar is 131 days: 18.7 weeks, so 19.
    expect(formatPlanDuration(span("2026-11-02", "2027-03-12"))).toBe("19 weeks");
    // 180 days is the last span stated in weeks.
    expect(formatPlanDuration(span("2026-11-02", "2027-04-30"))).toBe("26 weeks");
  });

  it("months use each month's own length, not an average", () => {
    // 2 Nov → Mon 3 May: 6 whole months and 1 of May's 31 days → 6½.
    expect(formatPlanDuration(span("2026-11-02", "2027-05-03"))).toBe("6½ months");
    // → Tue 15 Jun: 7 months and 14 of June's 30 days (0.47) → 7½.
    expect(formatPlanDuration(span("2026-11-02", "2027-06-15"))).toBe("7½ months");
    // → Wed 2 Jun: 7 whole months and 1 day — so it is PAST 7 months and reads 7½.
    // A 30.44-day average month makes this 6.997 and says "7 months", promising a week
    // that the calendar does not have. This is the case that tells the two apart.
    expect(formatPlanDuration(span("2026-11-02", "2027-06-02"))).toBe("7½ months");
    // → Wed 30 Jun: 7 months and 29 of June's 30 days (0.97) → 8.
    expect(formatPlanDuration(span("2026-11-02", "2027-06-30"))).toBe("8 months");
  });

  it("calendarMonthsBetween counts the remainder against the month it falls in", () => {
    // 2 Nov → 21 Jan: Nov→Dec→Jan is 2 whole months, then 2–21 Jan is 20 of 31 days.
    expect(calendarMonthsBetween(d("2026-11-02"), d("2027-01-21"))).toBeCloseTo(2 + 20 / 31, 6);
    // A February remainder is out of 28, not 30.
    expect(calendarMonthsBetween(d("2027-01-04"), d("2027-02-17"))).toBeCloseTo(1 + 14 / 28, 6);
  });

  it("no work states no duration", () => {
    expect(formatPlanDuration(span("2026-11-02", "2026-11-02", 0))).toBe("—");
  });

  it("splits figure from unit for the serif / mono grammar", () => {
    expect(planDurationParts(span("2026-11-02", "2027-01-21"))).toEqual({ figure: "12", unit: "weeks" });
  });
});

describe("parseIsoDate", () => {
  it("rejects a date that does not exist rather than rolling it over", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("31/12/2026")).toBeNull();
    expect(toIsoDate(parseIsoDate("2026-12-31")!)).toBe("2026-12-31");
  });

  it("nextMonday is today when today is a Monday", () => {
    expect(toIsoDate(nextMonday(parseIsoDate("2026-11-02")!))).toBe("2026-11-02");
  });
});

describe("the calendar", () => {
  const start = parseIsoDate("2026-11-02")!;

  it("every window starts on the Monday of the start week, in whole weeks", () => {
    const week = calendarWindow("week", parseIsoDate("2026-11-04")!, 0);
    expect([toIsoDate(week.from), toIsoDate(week.to)]).toEqual(["2026-11-02", "2026-11-09"]);
    const month = calendarWindow("month", start, 1);
    expect([toIsoDate(month.from), toIsoDate(month.to)]).toEqual(["2026-12-14", "2027-01-25"]);
    const half = calendarWindow("half", start, 0);
    expect([toIsoDate(half.from), toIsoDate(half.to)]).toEqual(["2026-11-02", "2027-05-03"]);
  });

  it("a five-week plan starting mid-month opens on the month view, not six months", () => {
    // The regression: windows on the 1st put 19 Oct – 24 Nov outside "October", and the
    // plan fell through to a half-year axis that was mostly empty.
    // The demo's loyalty add-on: 26 working days with its 30% tail, ending Mon 23 Nov.
    expect(fittingZoom(d("2026-10-19"), d("2026-11-23"))).toBe("month");
  });

  it("picks the smallest zoom that holds every contingency tail", () => {
    expect(fittingZoom(start, parseIsoDate("2026-11-05")!)).toBe("week");
    expect(fittingZoom(start, parseIsoDate("2026-11-20")!)).toBe("month");
    expect(fittingZoom(start, parseIsoDate("2027-04-08")!)).toBe("half");
    expect(fittingZoom(start, parseIsoDate("2027-08-01")!)).toBe("year");
  });

  it("ticks: days in a week, Mondays in a month, months beyond", () => {
    expect(calendarTicks("week", calendarWindow("week", start, 0))).toHaveLength(7);
    const month = calendarTicks("month", calendarWindow("month", start, 0));
    expect(month.map((t) => toIsoDate(t.date))).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
      "2026-12-07",
    ]);
    // 2 Nov 2026 – 1 Nov 2027: the 1st of every month inside it, Dec through Oct.
    const year = calendarTicks("year", calendarWindow("year", start, 0));
    expect(year.map((t) => toIsoDate(t.date))[0]).toBe("2026-12-01");
    expect(year).toHaveLength(11);
  });

  it("a span is placed to the END of its last day, and says when it runs off either edge", () => {
    const win = calendarWindow("week", start, 0);
    const oneDay = placeSpan(start, start, win)!;
    expect(oneDay.left).toBe(0);
    expect(oneDay.width).toBeCloseTo(100 / 7, 5);
    const long = placeSpan(d("2026-10-28"), d("2026-11-20"), win)!;
    expect(long).toMatchObject({ left: 0, width: 100, continues: true, continued: true });
    expect(placeSpan(d("2026-12-01"), d("2026-12-02"), win)).toBeNull();
  });

  it("workdayDate counts whole weeks without walking every day", () => {
    expect(toIsoDate(workdayDate(start, 250))).toBe("2027-10-18");
  });
});

function d(iso: string): Date {
  return parseIsoDate(iso)!;
}
