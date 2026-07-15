import { describe, it, expect } from "vitest";
import { bucketKey, buildThroughput, tallyDevOutput } from "../portal-analytics-helpers";

const DAY = 86_400_000;

describe("bucketKey", () => {
  it("buckets by UTC day", () => {
    expect(bucketKey(new Date("2026-07-15T23:59:00Z"), "day")).toBe("2026-07-15");
    expect(bucketKey(new Date("2026-07-16T00:00:00Z"), "day")).toBe("2026-07-16");
  });

  it("buckets by ISO week (Monday start)", () => {
    // 2026-07-15 is a Wednesday → week starts Monday 2026-07-13.
    expect(bucketKey(new Date("2026-07-15T12:00:00Z"), "week")).toBe("2026-07-13");
    // Monday itself maps to itself.
    expect(bucketKey(new Date("2026-07-13T00:00:00Z"), "week")).toBe("2026-07-13");
    // Sunday belongs to the week that started the previous Monday.
    expect(bucketKey(new Date("2026-07-19T12:00:00Z"), "week")).toBe("2026-07-13");
  });
});

describe("buildThroughput", () => {
  const from = new Date("2026-07-13T00:00:00Z");
  const to = new Date("2026-07-15T00:00:00Z");

  it("produces a gapless daily series with zero-activity days present", () => {
    const series = buildThroughput([new Date("2026-07-13T09:00:00Z")], [new Date("2026-07-15T17:00:00Z")], from, to, "day");
    expect(series.map((s) => s.bucket)).toEqual(["2026-07-13", "2026-07-14", "2026-07-15"]);
    expect(series[0]).toEqual({ bucket: "2026-07-13", created: 1, completed: 0 });
    expect(series[1]).toEqual({ bucket: "2026-07-14", created: 0, completed: 0 });
    expect(series[2]).toEqual({ bucket: "2026-07-15", created: 0, completed: 1 });
  });

  it("counts multiple items in the same bucket", () => {
    const d = new Date("2026-07-14T10:00:00Z");
    const series = buildThroughput([d, d, d], [d], from, to, "day");
    const mid = series.find((s) => s.bucket === "2026-07-14")!;
    expect(mid.created).toBe(3);
    expect(mid.completed).toBe(1);
  });

  it("ignores items outside the seeded range", () => {
    const series = buildThroughput([new Date(from.getTime() - 5 * DAY)], [], from, to, "day");
    expect(series.reduce((a, s) => a + s.created, 0)).toBe(0);
  });

  it("stays sorted ascending", () => {
    const series = buildThroughput([], [], from, to, "day");
    const keys = series.map((s) => s.bucket);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("tallyDevOutput", () => {
  const devIds = ["u1", "u2"];

  it("counts completions via m-n assignees and legacy assigneeId, deduped per task", () => {
    const rows = [
      { startedAt: null, completedAt: new Date(), assigneeId: "u1", assignees: [{ id: "u1" }] }, // dup → counts once
      { startedAt: null, completedAt: new Date(), assigneeId: null, assignees: [{ id: "u2" }] },
      { startedAt: null, completedAt: new Date(), assigneeId: "u1", assignees: [] }, // legacy only
      { startedAt: null, completedAt: new Date(), assigneeId: "outsider", assignees: [{ id: "outsider" }] }, // not a dev
    ];
    const out = tallyDevOutput(rows, devIds);
    expect(out.get("u1")?.completed).toBe(2);
    expect(out.get("u2")?.completed).toBe(1);
    expect(out.has("outsider")).toBe(false);
  });

  it("averages lead time only over tasks with a startedAt", () => {
    const base = new Date("2026-07-10T00:00:00Z");
    const rows = [
      { startedAt: base, completedAt: new Date(base.getTime() + 2 * DAY), assigneeId: "u1", assignees: [] },
      { startedAt: base, completedAt: new Date(base.getTime() + 4 * DAY), assigneeId: "u1", assignees: [] },
      { startedAt: null, completedAt: new Date(), assigneeId: "u1", assignees: [] }, // no timing → excluded from lead
    ];
    const out = tallyDevOutput(rows, devIds).get("u1")!;
    expect(out.completed).toBe(3);
    expect(out.leadN).toBe(2);
    expect(out.leadSum).toBe(6 * DAY);
    expect(Math.round(out.leadSum / out.leadN)).toBe(3 * DAY);
  });
});
