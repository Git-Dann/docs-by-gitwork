import { describe, expect, it } from "vitest";
import { demoDeliveryTimeline } from "../demo/demo-delivery";
import { gmailComposeUrl, parseWeeklyDraft, plainDraft, quietWeek, tidy, weeklyFacts, weeklySubject } from "../weekly-update";

// Friday 20 Nov 2026.
const now = new Date("2026-11-20T15:00:00Z");
const t = demoDeliveryTimeline("northwind", now);
const facts = weeklyFacts(t, t.weeks[0], { author: "Dan Lindsay", now });

describe("weeklyFacts", () => {
  it("greets the client's people by first name and signs off as the author", () => {
    expect(facts.greet).toEqual(["Priya", "Tom"]);
    expect(facts.signOff).toBe("Dan");
    expect(facts.isFriday).toBe(true);
  });

  it("groups finished work by release or category, biggest first", () => {
    expect(facts.done[0].group).toBe("v2.4 · Bookings");
    expect(facts.done[0].items).toHaveLength(3);
  });

  it("names the developers who did something this week", () => {
    expect(facts.team).toEqual(expect.arrayContaining(["Umer", "Jamal", "Abdullah"]));
    expect(facts.team).not.toContain("Syed"); // last week, not this one
  });

  it("dates last week's update to its Friday", () => {
    const last = weeklyFacts(t, t.weeks[1], { author: "Dan", now });
    expect(last.dateLabel).toBe("13 Nov");
    expect(weeklySubject(last)).toBe("Northwind Labs: weekly update, 13 Nov");
  });
});

describe("plainDraft", () => {
  const d = plainDraft(facts);

  it("reads like the emails it replaces", () => {
    expect(d.subject).toBe("Northwind Labs: weekly update, 20 Nov");
    expect(d.body.startsWith("Hi Priya and Tom,")).toBe(true);
    expect(d.body).toContain("v2.4 · Bookings: done");
    expect(d.body).toContain("What we need from you\n- Payments in the app: We need admin access to your Stripe account.");
    expect(d.body.trimEnd().endsWith("Have a great weekend,\nDan")).toBe(true);
  });

  it("has no em dashes", () => {
    expect(d.body).not.toMatch(/[—–]/);
  });

  it("says a quiet week is quiet, without inventing finished work", () => {
    const quiet = { ...facts, done: [], shipped: [], outages: [], meetings: [] };
    expect(quietWeek(quiet)).toBe(true);
    expect(plainDraft(quiet).body).toContain("A quick update on where things are this week.");
    expect(plainDraft(quiet).body).not.toContain("Done this week");
  });
});

describe("parseWeeklyDraft", () => {
  it("accepts a sound reply and takes the dashes out", () => {
    const d = parseWeeklyDraft({ subject: "Northwind Labs: weekly update, 20 Nov", body: "Hi Priya and Tom,\n\nBookings went out — members can now cancel.\n\nHave a great weekend,\nDan" }, facts);
    expect(d?.body).toContain("went out, members can now cancel");
  });

  it("falls back to the plain draft when the reply is the wrong shape", () => {
    expect(parseWeeklyDraft(null, facts)).toBeNull();
    expect(parseWeeklyDraft({ body: "too short" }, facts)).toBeNull();
  });

  it("refuses a reply that reports finished work in a week with none", () => {
    const quiet = { ...facts, done: [], shipped: [], outages: [], meetings: [] };
    const body = "Hi Priya,\n\nWe finished the booking screens and they are now live for everyone.\n\nCheers,\nDan";
    expect(parseWeeklyDraft({ subject: "x", body }, quiet)).toBeNull();
    expect(parseWeeklyDraft({ subject: "x", body }, facts)).not.toBeNull();
  });

  it("uses the standard subject when the reply has none", () => {
    expect(parseWeeklyDraft({ body: "Hi Priya,\n\nA quick update on this week, all on track.\n\nCheers,\nDan" }, facts)?.subject).toBe(weeklySubject(facts));
  });
});

describe("helpers", () => {
  it("tidies spacing", () => {
    expect(tidy("a  \n\n\n\nb ")).toBe("a\n\nb");
  });

  it("builds a Gmail compose link that sends nothing", () => {
    const url = new URL(gmailComposeUrl(["a@x.com", "b@x.com"], { subject: "S & T", body: "Line 1\nLine 2" }));
    expect(url.host).toBe("mail.google.com");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("a@x.com,b@x.com");
    expect(url.searchParams.get("su")).toBe("S & T");
    expect(url.searchParams.get("body")).toBe("Line 1\nLine 2");
  });
});
