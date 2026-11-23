import { describe, expect, it } from "vitest";
import { groupByWeek, weekStart, type DeliveryItem, type DeliveryTimeline } from "@/lib/client-delivery-timeline";
import {
  firstNameOf,
  forClientTimeline,
  isQuiet,
  parseWeekStart,
  publishProblem,
  weeksWithUpdates,
  type PublishedUpdate,
} from "@/lib/wiki-updates";

const NOW = new Date("2026-11-20T12:00:00Z"); // a Friday

function timeline(items: DeliveryItem[]): DeliveryTimeline {
  const from = weekStart(new Date(NOW.getTime() - 3 * 7 * 86_400_000));
  return {
    clientName: "Northwind",
    contacts: [{ name: "Priya Anand", email: "priya@example.com" }],
    weeks: groupByWeek(items, from, NOW),
    state: {
      inProgress: [{ id: "t1", title: "Reports", group: "v2", people: ["Umer"], dueDate: null }],
      upNext: [{ id: "t2", title: "CSV export", group: null, people: ["Jamal"], dueDate: "2026-11-25T00:00:00Z" }],
      waitingOnClient: [
        { id: "blocked:t3", title: "Payments", need: "Stripe access", since: null, href: "/app/portal/northwind/tasks?task=t3" },
        { id: "approve:c1", title: "2.4.0 on iOS", need: "Approve the release", since: null, href: "/app/portal/northwind/wiki#changelog" },
      ],
      nextRelease: { label: "v2.5", endDate: null, done: 1, total: 3 },
    },
    from: from.toISOString(),
    readAt: NOW.toISOString(),
  };
}

const item = (over: Partial<DeliveryItem>): DeliveryItem => ({
  id: "x",
  kind: "done",
  at: "2026-11-19T10:00:00Z",
  title: "Thing",
  detail: null,
  href: "/app/portal/northwind/tasks?task=1",
  people: ["Umer"],
  group: null,
  ...over,
});

describe("forClientTimeline — the client's copy", () => {
  const t = timeline([
    item({ id: "done:1", people: ["Umer", "Jamal"] }),
    item({ id: "tidy:1", kind: "tidy", title: "7 older tasks marked done together" }),
    item({ id: "shipped:1", kind: "shipped", title: "2.4.0 on iOS", href: "/app/portal/northwind/wiki#changelog" }),
  ]);
  const c = forClientTimeline(t);
  const json = JSON.stringify(c);

  it("names no developer anywhere", () => {
    for (const name of ["Umer", "Jamal"]) expect(json).not.toContain(name);
  });

  it("never carries an /app link", () => {
    expect(json).not.toContain("/app/");
  });

  it("drops board tidy-ups, and the week's summary doesn't count them", () => {
    const week = c.weeks[0];
    expect(week.items.map((i) => i.kind)).not.toContain("tidy");
    expect(week.summary).not.toMatch(/tidy/i);
    expect(week.items).toHaveLength(2);
  });

  it("drops the contacts (emails) we write to", () => {
    expect(json).not.toContain("priya@example.com");
  });

  it("links to the client's own wiki sections instead", () => {
    expect(c.weeks[0].items.find((i) => i.kind === "shipped")?.section).toBe("changelog");
    expect(c.state.waitingOnClient.map((w) => w.section)).toEqual(["board", "changelog"]);
  });
});

describe("publishing rules", () => {
  it("only a real Monday is a week", () => {
    expect(parseWeekStart("2026-11-16")).toBe("2026-11-16");
    expect(parseWeekStart("2026-11-17")).toBeNull();
    expect(parseWeekStart("2026-02-30")).toBeNull();
    expect(parseWeekStart("16/11/2026")).toBeNull();
  });

  it("refuses a week that hasn't started, an empty subject or body", () => {
    expect(publishProblem({ weekStart: "2026-11-23", subject: "a", body: "b" }, NOW)).toMatch(/hasn't started/);
    expect(publishProblem({ weekStart: "2026-11-16", subject: " ", body: "b" }, NOW)).toMatch(/subject/);
    expect(publishProblem({ weekStart: "2026-11-16", subject: "a", body: "\n " }, NOW)).toMatch(/empty/);
    expect(publishProblem({ weekStart: "2026-11-16", subject: "a", body: "b" }, NOW)).toBeNull();
  });

  it("shows the client a first name, never an email", () => {
    expect(firstNameOf("Dan Lindsay")).toBe("Dan");
    expect(firstNameOf("dan@gitwork.co.uk")).toBeNull();
    expect(firstNameOf("  ")).toBeNull();
  });
});

describe("weeksWithUpdates", () => {
  const pub = (weekStart: string): PublishedUpdate => ({
    id: weekStart,
    weekStart,
    subject: "s",
    body: "b",
    publishedAt: NOW.toISOString(),
    publishedBy: "Dan",
  });

  it("pairs an update with its week, newest first, and keeps updates older than the timeline", () => {
    const c = forClientTimeline(timeline([item({ id: "done:1" })]));
    const rows = weeksWithUpdates(c.weeks, [pub("2026-11-16"), pub("2026-09-07")]);
    expect(rows[0].start).toBe("2026-11-16");
    expect(rows[0].update?.id).toBe("2026-11-16");
    expect(rows.at(-1)).toMatchObject({ start: "2026-09-07", week: null });
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].start >= rows[i].start).toBe(true);
  });

  it("a week with an update is never quiet, even with nothing on the board", () => {
    expect(isQuiet({ week: { start: "x", label: "", summary: "", items: [] }, update: pub("x") })).toBe(false);
    expect(isQuiet({ week: { start: "x", label: "", summary: "", items: [] }, update: null })).toBe(true);
  });
});
